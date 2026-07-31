"""Billing service — thin wrapper around the official ``stripe`` SDK (Batch 14).

Mirrors app/llm/service.py's LLMUnavailableError pattern exactly: every public
function checks settings.STRIPE_SECRET_KEY *before* touching the stripe SDK at
all (a proactive guard, not a reactive catch of whatever the SDK happens to
raise on a missing key). Route handlers catch BillingUnavailableError and
return a clean 503 — never a crash.

Uses stripe's async resource methods (``create_async``/``list_async``/...)
throughout so a Stripe API round-trip never blocks the event loop, with an
explicit `api_key=` on every call (not the global `stripe.api_key`) — no
mutable process-global state, and it mirrors how LLMService instantiates its
own anthropic.Anthropic(api_key=...) client per call rather than relying on
an SDK-wide default.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

import stripe
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import NotificationType
from app.models.organization import TIER_MAX_STRATEGIES, Organization, OrganizationTier
from app.models.strategy import Strategy, StrategyStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.services.notification import notify_users_with_roles

logger = logging.getLogger(__name__)


class BillingUnavailableError(Exception):
    """Raised when Stripe isn't configured (no STRIPE_SECRET_KEY — deferred
    until sponsor funding, per this batch's own prompt) or a genuine Stripe
    API failure occurs. Route handlers convert this to a clean 503."""


class EnterpriseContactSalesError(Exception):
    """Raised when a caller tries to self-serve checkout into Enterprise —
    that tier is Contact Sales only and deliberately has no Stripe Price.
    Route handlers convert this to a 400, not a 503 (Stripe may be fully
    configured; this is a product policy, not an availability problem)."""


def _require_configured() -> None:
    if not settings.STRIPE_SECRET_KEY:
        raise BillingUnavailableError("Billing not configured")


def _tier_price_id(tier: OrganizationTier) -> str | None:
    return {
        OrganizationTier.STARTER: settings.STRIPE_PRICE_STARTER,
        OrganizationTier.PRO: settings.STRIPE_PRICE_PRO,
    }.get(tier)


def _price_id_to_tier(price_id: str | None) -> OrganizationTier | None:
    if price_id and price_id == settings.STRIPE_PRICE_STARTER:
        return OrganizationTier.STARTER
    if price_id and price_id == settings.STRIPE_PRICE_PRO:
        return OrganizationTier.PRO
    return None


def _map_stripe_status(stripe_status: str) -> SubscriptionStatus:
    """Stripe's real subscription.status has more values than the 4 this
    schema tracks (see docs/schemas.md -> Subscription "Judgment calls") —
    every consumer of Subscription.status here only branches on "actively
    paying" vs. not, so incomplete/incomplete_expired/unpaid collapse onto
    past_due and paused collapses onto canceled rather than widening the enum."""
    try:
        return SubscriptionStatus(stripe_status)
    except ValueError:
        if stripe_status in ("incomplete", "incomplete_expired", "unpaid"):
            return SubscriptionStatus.PAST_DUE
        if stripe_status == "paused":
            return SubscriptionStatus.CANCELED
        logger.warning("Unrecognized Stripe subscription status %r; defaulting to past_due", stripe_status)
        return SubscriptionStatus.PAST_DUE


async def _apply_tier_to_organization(
    session: AsyncSession, organization: Organization, tier: OrganizationTier
) -> None:
    """The single place Organization.tier/max_strategies get written after
    registration — see docs/schemas.md -> Subscription: Organization.tier
    remains what the rest of the codebase (rate limiter, strategy cap) reads;
    this batch makes the webhook the sole writer, keeping it live-synced."""
    organization.tier = tier
    organization.max_strategies = TIER_MAX_STRATEGIES[tier]


async def get_subscription(session: AsyncSession, organization_id: uuid.UUID) -> Subscription | None:
    return (
        await session.execute(select(Subscription).where(Subscription.organization_id == organization_id))
    ).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Checkout / Portal (JWT-authenticated routes)
# --------------------------------------------------------------------------- #
async def create_checkout_session(
    session: AsyncSession, *, organization: Organization, user: User, tier: OrganizationTier
) -> str:
    _require_configured()
    if tier == OrganizationTier.ENTERPRISE:
        raise EnterpriseContactSalesError(
            "Enterprise is by invitation only — contact sales@stellixlabs.com"
        )
    price_id = _tier_price_id(tier)
    if not price_id:
        raise BillingUnavailableError(
            f"No Stripe Price configured for tier={tier.value}; run scripts/stripe_setup.py"
        )

    existing = await get_subscription(session, organization.id)
    org_id_str = str(organization.id)

    params: dict = dict(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/admin/billing?checkout=success",
        cancel_url=f"{settings.FRONTEND_URL}/admin/billing?checkout=cancelled",
        client_reference_id=org_id_str,
        metadata={"organization_id": org_id_str, "tier": tier.value},
        subscription_data={"metadata": {"organization_id": org_id_str, "tier": tier.value}},
        api_key=settings.STRIPE_SECRET_KEY,
    )
    # Reuse the existing Stripe Customer (e.g. Starter -> Pro upgrade) rather
    # than letting Checkout create a second Customer for the same org; a
    # brand-new org has no Subscription row yet, so Checkout creates the
    # Customer itself from customer_email.
    if existing and existing.stripe_customer_id:
        params["customer"] = existing.stripe_customer_id
    else:
        params["customer_email"] = user.email

    checkout_session = await stripe.checkout.Session.create_async(**params)
    return checkout_session.url


async def create_portal_session(session: AsyncSession, *, organization: Organization) -> str:
    _require_configured()
    subscription = await get_subscription(session, organization.id)
    if subscription is None:
        raise BillingUnavailableError("No billing account yet — subscribe to a plan first")

    portal_session = await stripe.billing_portal.Session.create_async(
        customer=subscription.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/admin/billing",
        api_key=settings.STRIPE_SECRET_KEY,
    )
    return portal_session.url


# --------------------------------------------------------------------------- #
# Status / invoices (JWT-authenticated routes)
# --------------------------------------------------------------------------- #
async def get_billing_status(session: AsyncSession, *, organization: Organization) -> dict:
    subscription = await get_subscription(session, organization.id)
    active_strategy_count = await session.scalar(
        select(func.count())
        .select_from(Strategy)
        .where(Strategy.status != StrategyStatus.RETIRED)
    )
    return {
        "tier": organization.tier,
        "max_strategies": organization.max_strategies,
        "active_strategy_count": active_strategy_count or 0,
        "subscription_status": subscription.status if subscription else None,
        "current_period_end": subscription.current_period_end if subscription else None,
        "cancel_at_period_end": subscription.cancel_at_period_end if subscription else False,
    }


async def list_invoices(*, stripe_customer_id: str, limit: int = 24) -> list[dict]:
    _require_configured()
    invoices = await stripe.Invoice.list_async(
        customer=stripe_customer_id, limit=limit, api_key=settings.STRIPE_SECRET_KEY
    )
    return [
        {
            "id": inv.id,
            "number": inv.number,
            "status": inv.status,
            "amount_due": inv.amount_due,
            "amount_paid": inv.amount_paid,
            "currency": inv.currency,
            "created": datetime.fromtimestamp(inv.created, tz=UTC),
            "hosted_invoice_url": inv.hosted_invoice_url,
            "invoice_pdf": inv.invoice_pdf,
        }
        for inv in invoices.data
    ]


# --------------------------------------------------------------------------- #
# Webhook event handlers — called with an UNSCOPED system session (see
# docs/schemas.md -> Subscription: the webhook has no tenant context bound a
# priori, it has to look up which org an event belongs to).
# --------------------------------------------------------------------------- #
async def handle_checkout_completed(session: AsyncSession, data_object: dict) -> None:
    organization_id_raw = (data_object.get("metadata") or {}).get("organization_id")
    if not organization_id_raw:
        logger.warning("checkout.session.completed with no metadata.organization_id; ignoring")
        return
    organization_id = uuid.UUID(organization_id_raw)
    tier = OrganizationTier((data_object.get("metadata") or {}).get("tier", OrganizationTier.STARTER.value))
    customer_id = data_object.get("customer")
    subscription_id = data_object.get("subscription")

    organization = await session.get(Organization, organization_id)
    if organization is None:
        logger.warning("checkout.session.completed for unknown organization_id=%s", organization_id)
        return

    subscription = await get_subscription(session, organization_id)
    if subscription is None:
        subscription = Subscription(
            organization_id=organization_id,
            stripe_customer_id=customer_id,
            stripe_subscription_id=subscription_id,
            tier=tier,
            status=SubscriptionStatus.ACTIVE,
        )
        session.add(subscription)
    else:
        subscription.stripe_customer_id = customer_id
        subscription.stripe_subscription_id = subscription_id
        subscription.tier = tier
        subscription.status = SubscriptionStatus.ACTIVE

    await _apply_tier_to_organization(session, organization, tier)
    await session.commit()


async def handle_subscription_updated(session: AsyncSession, data_object: dict) -> None:
    organization_id_raw = (data_object.get("metadata") or {}).get("organization_id")
    if not organization_id_raw:
        logger.warning("customer.subscription.updated with no metadata.organization_id; ignoring")
        return
    organization_id = uuid.UUID(organization_id_raw)

    organization = await session.get(Organization, organization_id)
    subscription = await get_subscription(session, organization_id)
    if organization is None or subscription is None:
        logger.warning(
            "customer.subscription.updated for organization_id=%s with no existing org/subscription row",
            organization_id,
        )
        return

    price_id = None
    items = (data_object.get("items") or {}).get("data") or []
    if items:
        price_id = (items[0].get("price") or {}).get("id")
    tier = _price_id_to_tier(price_id) or subscription.tier

    subscription.tier = tier
    subscription.status = _map_stripe_status(data_object.get("status", "active"))
    subscription.cancel_at_period_end = bool(data_object.get("cancel_at_period_end", False))
    period_end = data_object.get("current_period_end")
    subscription.current_period_end = (
        datetime.fromtimestamp(period_end, tz=UTC) if period_end else None
    )

    await _apply_tier_to_organization(session, organization, tier)
    await session.commit()


async def handle_subscription_deleted(session: AsyncSession, data_object: dict) -> None:
    """Judgment call (see docs/schemas.md -> Subscription): downgrades to
    Starter limits, does NOT touch Organization.is_active and does NOT
    delete/retire any existing data — full lockout is a separate, deliberate
    admin action, not an automatic consequence of a lapsed subscription."""
    organization_id_raw = (data_object.get("metadata") or {}).get("organization_id")
    if not organization_id_raw:
        logger.warning("customer.subscription.deleted with no metadata.organization_id; ignoring")
        return
    organization_id = uuid.UUID(organization_id_raw)

    organization = await session.get(Organization, organization_id)
    subscription = await get_subscription(session, organization_id)
    if organization is None or subscription is None:
        logger.warning(
            "customer.subscription.deleted for organization_id=%s with no existing org/subscription row",
            organization_id,
        )
        return

    subscription.status = SubscriptionStatus.CANCELED
    subscription.cancel_at_period_end = False
    await _apply_tier_to_organization(session, organization, OrganizationTier.STARTER)
    await session.commit()


async def handle_invoice_payment_failed(session: AsyncSession, data_object: dict) -> None:
    """Looked up via stripe_customer_id/stripe_subscription_id (a real DB
    lookup), not invoice-level metadata — unlike checkout/subscription
    events (whose metadata this service sets explicitly), an Invoice isn't
    guaranteed to carry the subscription's metadata."""
    customer_id = data_object.get("customer")
    subscription_id = data_object.get("subscription")

    # OR'd on whichever identifiers Stripe actually gave us — never match on a
    # None identifier (SQLAlchemy renders `column == None` as `IS NULL`,
    # which would spuriously match an unrelated org's customer-only,
    # no-subscription-yet row).
    conditions = []
    if customer_id:
        conditions.append(Subscription.stripe_customer_id == customer_id)
    if subscription_id:
        conditions.append(Subscription.stripe_subscription_id == subscription_id)
    subscription = None
    if conditions:
        subscription = (
            await session.execute(select(Subscription).where(or_(*conditions)))
        ).scalar_one_or_none()
    if subscription is None:
        logger.warning(
            "invoice.payment_failed for unknown customer=%s subscription=%s", customer_id, subscription_id
        )
        return

    subscription.status = SubscriptionStatus.PAST_DUE
    await notify_users_with_roles(
        session,
        organization_id=subscription.organization_id,
        roles={UserRole.ADMIN, UserRole.CIO},
        type=NotificationType.PAYMENT_FAILED,
        message="A payment on your Stellix Labs subscription failed. Please update your billing details.",
        link="/admin/billing",
    )
    await session.commit()
