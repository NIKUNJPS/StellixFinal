"""Billing tests (Batch 14).

Webhook signature verification (real HMAC-SHA256, via stripe's own
WebhookSignature — no mocking of Stripe's verification code), tier sync
(Organization.tier + Batch 11's rate-limit multiplier) driven entirely by
webhook events, Starter-cap enforcement, and the deferred-credential 503 gate.

The 503-gate tests originally asserted the Stripe settings were genuinely unset
in this dev environment rather than forcing them — mirroring Batch 9's
test_llm_graceful_degradation.py. That pattern proved to be a trap: it makes the
ambient deployment state a premise, so the tests invert into failures the moment
the credential is configured (which is exactly what happened to the LLM tests
when ANTHROPIC_API_KEY was added). Both files now force the state they test via
fixtures — stripe_configured / stripe_unconfigured below. Stripe's own
verification code is still never mocked."""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime

import pytest
from app.core.config import settings
from app.core.token_bucket import get_org_rate_multiplier
from app.db.tenant import bind_organization, mark_session_unscoped
from app.models.organization import Organization, OrganizationTier
from app.models.subscription import Subscription, SubscriptionStatus
from sqlalchemy import select
from stripe import WebhookSignature

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, create_org_user, register_org

WEBHOOK_SECRET = "whsec_test_secret_batch14"


def _sign(payload_str: str, secret: str) -> str:
    ts = int(time.time())
    signed = f"{ts}.{payload_str}"
    sig = WebhookSignature._compute_signature(signed, secret)
    return f"t={ts},v1={sig}"


def _event(event_type: str, data_object: dict, event_id: str = "evt_test") -> str:
    return json.dumps({"id": event_id, "object": "event", "type": event_type, "data": {"object": data_object}})


@pytest.fixture
def stripe_configured(monkeypatch):
    """Turn Stripe "on" for the webhook-signature/tier-sync tests below."""
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_fake_for_tests")
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "STRIPE_PRICE_STARTER", "price_starter_test")
    monkeypatch.setattr(settings, "STRIPE_PRICE_PRO", "price_pro_test")


@pytest.fixture
def stripe_unconfigured(monkeypatch):
    """Turn Stripe "off" for the 503-gate tests.

    These tests used to assert `not settings.STRIPE_SECRET_KEY` and rely on the
    ambient unset dev state. That makes an unconfigured deployment a *premise*
    rather than the condition under test, so the whole 503 gate silently
    inverts into failures the day someone configures Stripe — exactly what
    happened to the LLM degradation tests when ANTHROPIC_API_KEY was added
    (and the failing assert printed the live key into the logs). Forcing the
    state here keeps these tests meaningful and secret-free either way.
    """
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", None)
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", None)


async def _fetch_organization(db_session_factory, organization_id):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        return await session.get(Organization, organization_id)


async def _fetch_subscription(db_session_factory, organization_id):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        return (
            await session.execute(select(Subscription).where(Subscription.organization_id == organization_id))
        ).scalar_one()


async def _seed_subscription(db_session_factory, *, organization_id, tier, customer_id, subscription_id) -> None:
    async with db_session_factory() as session:
        bind_organization(session.sync_session, organization_id)
        session.add(
            Subscription(
                organization_id=organization_id,
                stripe_customer_id=customer_id,
                stripe_subscription_id=subscription_id,
                tier=tier,
                status=SubscriptionStatus.ACTIVE,
            )
        )
        await session.commit()


# --------------------------------------------------------------------------- #
# Deferred-credential 503 gate
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_checkout_returns_503_when_stripe_not_configured(client, stripe_unconfigured):
    token, _org = await register_org(client, org_name="BillDeferCo1", email="a@billdefer1.com")
    resp = await client.post("/billing/checkout", json={"tier": "pro"}, headers=bearer(token))
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_portal_returns_503_when_stripe_not_configured(client, stripe_unconfigured):
    token, _org = await register_org(client, org_name="BillDeferCo2", email="a@billdefer2.com")
    resp = await client.post("/billing/portal", headers=bearer(token))
    assert resp.status_code == 503


@pytest.mark.anyio
async def test_invoices_returns_empty_when_no_subscription_yet(client):
    """A never-upgraded org has nothing to show regardless of Stripe config —
    a genuinely different, deliberate path from the 503 case below. No
    stripe_unconfigured fixture on purpose: "regardless of config" is the claim,
    so this must hold whether or not a key is present."""
    token, _org = await register_org(client, org_name="BillDeferCo3", email="a@billdefer3.com")
    resp = await client.get("/billing/invoices", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json() == {"items": []}


@pytest.mark.anyio
async def test_invoices_returns_503_when_subscription_exists_but_stripe_not_configured(
    client, db_session_factory, stripe_unconfigured
):
    token, org = await register_org(client, org_name="BillDeferCo4", email="a@billdefer4.com")
    await _seed_subscription(
        db_session_factory, organization_id=org, tier=OrganizationTier.PRO,
        customer_id="cus_fake", subscription_id="sub_fake",
    )
    resp = await client.get("/billing/invoices", headers=bearer(token))
    assert resp.status_code == 503


@pytest.mark.anyio
async def test_status_reports_starter_defaults_with_no_subscription(client):
    token, _org = await register_org(client, org_name="BillDeferCo5", email="a@billdefer5.com")
    resp = await client.get("/billing/status", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["tier"] == "starter"
    assert body["max_strategies"] == 25
    assert body["subscription_status"] is None


# --------------------------------------------------------------------------- #
# Webhook signature verification
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_webhook_returns_503_when_not_configured(client, stripe_unconfigured):
    resp = await client.post(
        "/billing/webhook",
        content=_event("checkout.session.completed", {"id": "cs_1"}),
        headers={"stripe-signature": "irrelevant"},
    )
    assert resp.status_code == 503


@pytest.mark.anyio
async def test_webhook_rejects_missing_signature(client, stripe_configured):
    resp = await client.post(
        "/billing/webhook", content=_event("checkout.session.completed", {"id": "cs_1"})
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_webhook_rejects_invalid_signature(client, stripe_configured):
    resp = await client.post(
        "/billing/webhook",
        content=_event("checkout.session.completed", {"id": "cs_1"}),
        headers={"stripe-signature": "t=1,v1=deadbeef"},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_webhook_processes_valid_checkout_completed_event(client, db_session_factory, stripe_configured):
    token, org = await register_org(client, org_name="WebhookCo1", email="a@webhookco1.com")
    payload = _event(
        "checkout.session.completed",
        {
            "id": "cs_test1",
            "customer": "cus_test1",
            "subscription": "sub_test1",
            "metadata": {"organization_id": str(org), "tier": "pro"},
        },
    )
    resp = await client.post(
        "/billing/webhook", content=payload, headers={"stripe-signature": _sign(payload, WEBHOOK_SECRET)}
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": True, "handled": True}

    organization = await _fetch_organization(db_session_factory, org)
    assert organization.tier == OrganizationTier.PRO
    assert organization.max_strategies is None

    subscription = await _fetch_subscription(db_session_factory, org)
    assert subscription.stripe_customer_id == "cus_test1"
    assert subscription.stripe_subscription_id == "sub_test1"
    assert subscription.status == SubscriptionStatus.ACTIVE


@pytest.mark.anyio
async def test_webhook_subscription_updated_syncs_tier_and_period(client, db_session_factory, stripe_configured):
    token, org = await register_org(client, org_name="WebhookCo2", email="a@webhookco2.com")
    await _seed_subscription(
        db_session_factory, organization_id=org, tier=OrganizationTier.STARTER,
        customer_id="cus_test2", subscription_id="sub_test2",
    )

    period_end_ts = int(datetime(2027, 1, 1, tzinfo=UTC).timestamp())
    payload = _event(
        "customer.subscription.updated",
        {
            "id": "sub_test2",
            "status": "active",
            "cancel_at_period_end": True,
            "current_period_end": period_end_ts,
            "items": {"data": [{"price": {"id": settings.STRIPE_PRICE_PRO}}]},
            "metadata": {"organization_id": str(org)},
        },
    )
    resp = await client.post(
        "/billing/webhook", content=payload, headers={"stripe-signature": _sign(payload, WEBHOOK_SECRET)}
    )
    assert resp.status_code == 200

    organization = await _fetch_organization(db_session_factory, org)
    assert organization.tier == OrganizationTier.PRO

    subscription = await _fetch_subscription(db_session_factory, org)
    assert subscription.cancel_at_period_end is True
    assert subscription.current_period_end is not None


@pytest.mark.anyio
async def test_webhook_subscription_deleted_downgrades_tier_and_rate_multiplier(
    client, db_session_factory, stripe_configured
):
    organization, _user = await create_org_user(
        db_session_factory,
        org_name="WebhookCo3",
        slug="webhookco3",
        email="a@webhookco3.com",
        tier=OrganizationTier.ENTERPRISE,
    )
    await _seed_subscription(
        db_session_factory, organization_id=organization.id, tier=OrganizationTier.ENTERPRISE,
        customer_id="cus_test3", subscription_id="sub_test3",
    )

    payload = _event(
        "customer.subscription.deleted",
        {"id": "sub_test3", "metadata": {"organization_id": str(organization.id)}},
    )
    resp = await client.post(
        "/billing/webhook", content=payload, headers={"stripe-signature": _sign(payload, WEBHOOK_SECRET)}
    )
    assert resp.status_code == 200

    refreshed = await _fetch_organization(db_session_factory, organization.id)
    assert refreshed.tier == OrganizationTier.STARTER
    assert refreshed.max_strategies == 25

    subscription = await _fetch_subscription(db_session_factory, organization.id)
    assert subscription.status == SubscriptionStatus.CANCELED

    # Batch 11's rate-limit multiplier reads the now-downgraded tier — fresh
    # org, first-ever call to this function, so no stale 60s cache risk.
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        multiplier = await get_org_rate_multiplier(session, organization.id)
    assert multiplier == 1.0


@pytest.mark.anyio
async def test_webhook_invoice_payment_failed_marks_past_due_and_notifies(
    client, db_session_factory, stripe_configured
):
    token, org = await register_org(client, org_name="WebhookCo4", email="a@webhookco4.com")
    await _seed_subscription(
        db_session_factory, organization_id=org, tier=OrganizationTier.PRO,
        customer_id="cus_test4", subscription_id="sub_test4",
    )

    payload = _event(
        "invoice.payment_failed",
        {"id": "in_test4", "customer": "cus_test4", "subscription": "sub_test4"},
    )
    resp = await client.post(
        "/billing/webhook", content=payload, headers={"stripe-signature": _sign(payload, WEBHOOK_SECRET)}
    )
    assert resp.status_code == 200

    subscription = await _fetch_subscription(db_session_factory, org)
    assert subscription.status == SubscriptionStatus.PAST_DUE

    notif_resp = await client.get("/notifications", headers=bearer(token))
    assert notif_resp.status_code == 200
    items = notif_resp.json()["items"]
    assert any(n["type"] == "payment_failed" for n in items)


@pytest.mark.anyio
async def test_webhook_unrecognized_event_type_acked_not_processed(client, stripe_configured):
    payload = _event("customer.updated", {"id": "cus_x"})
    resp = await client.post(
        "/billing/webhook", content=payload, headers={"stripe-signature": _sign(payload, WEBHOOK_SECRET)}
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": True, "handled": False}


# --------------------------------------------------------------------------- #
# Tier enforcement (Starter cap; upgrade raises it)
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_strategy_creation_blocked_at_starter_cap(client, db_session_factory):
    token, org = await register_org(client, org_name="CapCo1", email="a@capco1.com")
    for i in range(25):
        await seed_strategy(db_session_factory, organization_id=org, name=f"Strat {i}")

    resp = await client.post("/strategies", json={"name": "One Too Many", "symbol": "SPY"}, headers=bearer(token))
    assert resp.status_code == 403
    assert "cap" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_strategy_creation_allowed_after_upgrade_raises_limit(client, db_session_factory, stripe_configured):
    token, org = await register_org(client, org_name="CapCo2", email="a@capco2.com")
    for i in range(25):
        await seed_strategy(db_session_factory, organization_id=org, name=f"Strat {i}")

    blocked = await client.post("/strategies", json={"name": "Blocked", "symbol": "SPY"}, headers=bearer(token))
    assert blocked.status_code == 403

    payload = _event(
        "checkout.session.completed",
        {
            "id": "cs_cap2",
            "customer": "cus_cap2",
            "subscription": "sub_cap2",
            "metadata": {"organization_id": str(org), "tier": "pro"},
        },
    )
    webhook_resp = await client.post(
        "/billing/webhook", content=payload, headers={"stripe-signature": _sign(payload, WEBHOOK_SECRET)}
    )
    assert webhook_resp.status_code == 200

    allowed = await client.post("/strategies", json={"name": "Now Allowed", "symbol": "SPY"}, headers=bearer(token))
    assert allowed.status_code == 201
