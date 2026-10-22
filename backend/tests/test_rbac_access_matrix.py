"""Batch 26 Part A regression net: the exact role -> capability matrix.

Written and run against the codebase BEFORE the dynamic-RBAC refactor, then run again
after it, unchanged. Every case asserts, for each of the 5 system roles, whether the
role gets through authorization (anything but 403) or is refused (403). The expected
sets are the ground truth reverse-engineered from every require_role() call site and
service-level role check in Batch 25 — if this file needs editing to pass after the
refactor, someone's access changed.

Tokens are minted with the real create_access_token (the identical path login uses),
which keeps the sweep fast and clear of the login rate limiter.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from app.core.security import create_access_token, hash_password
from app.db.tenant import bind_organization, mark_session_unscoped
from app.failure.detection import FailureAssessment
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.failure import FailureTrigger
from app.models.kill_switch_review import KillSwitchReview
from app.models.notification import Notification
from app.models.organization import Organization, OrganizationStatus, OrganizationTier
from app.models.strategy import Strategy, StrategyStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from sqlalchemy import select

from tests.data_helpers import seed_strategy
from tests.helpers import bearer

R = UserRole
ALL = frozenset(R)
ADMIN = frozenset({R.ADMIN})
ADMIN_COMPLIANCE = frozenset({R.ADMIN, R.COMPLIANCE_OFFICER})
GOVERNANCE = frozenset({R.RISK_MANAGER, R.CIO, R.ADMIN})
APPROVAL = GOVERNANCE | {R.COMPLIANCE_OFFICER}
AUDIT_VIEW = APPROVAL
AUTHORS = frozenset({R.RESEARCHER, R.ADMIN})

_PASSWORD_HASH = hash_password("matrix-not-used-9")
_VALID_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}


@dataclass
class Team:
    org_id: uuid.UUID
    users: dict[UserRole, User]
    tokens: dict[UserRole, dict[str, str]]


async def _team(maker, tag: str) -> Team:
    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(
            name=f"Matrix {tag}", slug=f"matrix-{tag}", tier=OrganizationTier.PRO, max_strategies=500,
            is_active=True, status=OrganizationStatus.ACTIVE,
        )
        session.add(org)
        await session.flush()
        users = {}
        for role in UserRole:
            user = User(
                organization_id=org.id, email=f"{role.value}@{tag}.matrix.io", full_name=f"{role.value} user",
                hashed_password=_PASSWORD_HASH, role=role, is_active=True, email_verified=True,
            )
            session.add(user)
            users[role] = user
        await session.commit()
        for u in users.values():
            await session.refresh(u)
    tokens = {
        role: bearer(create_access_token(user_id=u.id, organization_id=org.id, role=role.value))
        for role, u in users.items()
    }
    return Team(org_id=org.id, users=users, tokens=tokens)


async def _add(maker, org_id, obj):
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        session.add(obj)
        await session.commit()
        await session.refresh(obj)
        return obj


Runner = Callable[[object, object, Team, UserRole], Awaitable[int]]


def _simple(method: str, path: str, json: dict | None = None) -> Runner:
    async def run(client, maker, team, role):
        resp = await client.request(method, path.format(org=team.org_id, admin=team.users[R.ADMIN].id),
                                    json=json, headers=team.tokens[role])
        return resp.status_code
    return run


def _on_strategy(method: str, suffix: str, json: dict | None, **seed) -> Runner:
    async def run(client, maker, team, role):
        sid = await seed_strategy(maker, organization_id=team.org_id, valid_rules=True, **seed)
        resp = await client.request(method, f"/strategies/{sid}{suffix}", json=json, headers=team.tokens[role])
        return resp.status_code
    return run


async def _activation(client, maker, team, role):
    sid = await seed_strategy(maker, organization_id=team.org_id, status=StrategyStatus.CANDIDATE,
                              valid_rules=True, robustness_score=0.85)
    await _add(maker, team.org_id, ApprovalRecord(strategy_id=sid, approved_by_user_id=team.users[R.CIO].id,
                                                  action=ApprovalAction.APPROVE, justification="ok"))
    resp = await client.post(f"/strategies/{sid}/transition", json={"target_status": "active"}, headers=team.tokens[role])
    return resp.status_code


async def _kill(client, maker, team, role):
    sid = await seed_strategy(maker, organization_id=team.org_id, status=StrategyStatus.ACTIVE,
                              valid_rules=True, robustness_score=0.9)
    resp = await client.post(f"/governance/kill-switch/{sid}", json={"reason": "matrix"}, headers=team.tokens[role])
    return resp.status_code


async def _acknowledge(client, maker, team, role):
    sid = await seed_strategy(maker, organization_id=team.org_id, status=StrategyStatus.RETIRED, valid_rules=True)
    now = datetime.now(UTC)
    review = await _add(maker, team.org_id, KillSwitchReview(
        strategy_id=sid, triggered_by_user_id=team.users[R.RISK_MANAGER].id, triggered_by_role="risk_manager",
        reason="matrix", status_before_kill="active", triggered_at=now, review_deadline=now + timedelta(days=14),
    ))
    resp = await client.post(f"/governance/kill-switch/reviews/{review.id}/acknowledge",
                             json={"note": "seen"}, headers=team.tokens[role])
    return resp.status_code


async def _manual_fail(client, maker, team, role):
    sid = await seed_strategy(maker, organization_id=team.org_id, status=StrategyStatus.ACTIVE,
                              valid_rules=True, robustness_score=0.9)
    with patch("app.worker.tasks.run_manual_failure.delay") as delay:
        delay.return_value.id = "t"
        resp = await client.post(f"/strategies/{sid}/fail", json={"symbol": "SPY", "reason": "matrix"},
                                 headers=team.tokens[role])
    return resp.status_code


async def _export_create(client, maker, team, role):
    with patch("app.worker.tasks.run_compliance_export.delay") as delay:
        delay.return_value.id = "t"
        resp = await client.post("/governance/export", headers=team.tokens[role],
                                 json={"start_date": "2026-01-01", "end_date": "2026-12-31", "export_format": "json"})
    return resp.status_code


async def _delete_researchers_draft(client, maker, team, role):
    sid = await seed_strategy(maker, organization_id=team.org_id, valid_rules=True,
                              created_by_user_id=team.users[R.RESEARCHER].id)
    resp = await client.delete(f"/strategies/{sid}", headers=team.tokens[role])
    return resp.status_code


async def _health_detailed(client, maker, team, role):
    async def _services():
        return {name: {"status": "ok", "response_time_ms": 1.0, "detail": None, "uptime_pct": 100.0,
                       "last_check": datetime.now(UTC)}
                for name in ("postgres", "timescaledb", "redis", "celery_worker")}

    async def _empty():
        return []

    async def _zero():
        return 0

    async def _none(_org):
        return None

    with (
        patch("app.api.routes.system.svc.get_service_health", _services),
        patch("app.api.routes.system.svc.get_job_queue_counts", _empty),
        patch("app.api.routes.system.svc.get_failed_job_count", _zero),
        patch("app.api.routes.system.svc.get_memory_index_status", _none),
    ):
        resp = await client.get("/system/health-detailed", headers=team.tokens[role])
    return resp.status_code


async def _evolution_reject(client, maker, team, role):
    sid = await seed_strategy(maker, organization_id=team.org_id, status=StrategyStatus.CANDIDATE, valid_rules=True)
    resp = await client.post(f"/evolution/candidates/{sid}/reject", json={"justification": "no"},
                             headers=team.tokens[role])
    return resp.status_code


RANDOM = uuid.uuid4()
CASES: list[tuple[str, frozenset[UserRole], Runner]] = [
    # --- admin-only routes -------------------------------------------------------
    ("billing status", ADMIN, _simple("GET", "/billing/status")),
    ("billing invoices", ADMIN, _simple("GET", "/billing/invoices")),
    ("billing checkout", ADMIN, _simple("POST", "/billing/checkout", {"tier": "pro"})),
    ("billing portal", ADMIN, _simple("POST", "/billing/portal")),
    ("digest preview", ADMIN, _simple("POST", "/notifications/digest/preview")),
    ("organization settings", ADMIN, _simple("PATCH", "/organizations/me", {"weekly_digest_enabled": True})),
    ("system health detailed", ADMIN, _health_detailed),
    ("create invitation", ADMIN, _simple("POST", "/users/invitations", {"email": "new.person@matrix.io"})),
    ("list invitations", ADMIN, _simple("GET", "/users/invitations")),
    ("revoke invitation", ADMIN, _simple("DELETE", f"/users/invitations/{RANDOM}")),
    ("get user by id", ADMIN, _simple("GET", "/users/{admin}")),
    # --- admin + compliance --------------------------------------------------------
    ("member directory", ADMIN_COMPLIANCE, _simple("GET", "/users/members")),
    ("llm audit log", ADMIN_COMPLIANCE, _simple("GET", "/llm/audit-log")),
    ("export list", ADMIN_COMPLIANCE, _simple("GET", "/governance/export")),
    ("export create", ADMIN_COMPLIANCE, _export_create),
    ("export get", ADMIN_COMPLIANCE, _simple("GET", f"/governance/export/{RANDOM}")),
    ("export download", ADMIN_COMPLIANCE, _simple("GET", f"/governance/export/{RANDOM}/download")),
    # --- governance views ------------------------------------------------------------
    ("active strategies", APPROVAL, _simple("GET", "/governance/active-strategies")),
    ("approval queue", APPROVAL, _simple("GET", "/governance/approval-queue")),
    ("strategy controls", APPROVAL, _simple("GET", "/governance/strategy-controls")),
    ("kill switch reviews", APPROVAL, _simple("GET", "/governance/kill-switch/reviews")),
    ("governance audit log", AUDIT_VIEW, _simple("GET", "/governance/audit-log")),
    # --- governance actions ------------------------------------------------------------
    ("kill switch", GOVERNANCE, _kill),
    ("acknowledge kill review", frozenset({R.CIO}), _acknowledge),
    ("reject candidate", APPROVAL, _on_strategy("POST", "/approve", {"action": "reject", "justification": "no"},
                                                status=StrategyStatus.CANDIDATE, robustness_score=0.85)),
    ("evolution reject", APPROVAL, _evolution_reject),
    ("transition to active", APPROVAL, _activation),
    ("retire candidate", GOVERNANCE, _on_strategy("POST", "/retire", {"reason": "done"},
                                                  status=StrategyStatus.CANDIDATE)),
    ("transition to retired", GOVERNANCE, _on_strategy("POST", "/transition",
                                                       {"target_status": "retired", "reason": "done"},
                                                       status=StrategyStatus.CANDIDATE)),
    ("retire parentless failed (override)", ADMIN, _on_strategy("POST", "/retire", {"reason": "done"},
                                                                 status=StrategyStatus.FAILED)),
    ("manual fail", GOVERNANCE, _manual_fail),
    # --- research authoring ------------------------------------------------------------
    ("save new version", AUTHORS, _on_strategy("POST", "/versions",
                                                {"entry_rules": {**_VALID_ENTRY, "operator": "OR"},
                                                 "change_reason": "matrix change"})),
    ("delete another researcher's draft", AUTHORS, _delete_researchers_draft),
    # --- open to every authenticated role (must stay open) --------------------------------
    ("list strategies", ALL, _simple("GET", "/strategies")),
    ("create strategy", ALL, _simple("POST", "/strategies", {"name": "open to all"})),
    ("portfolio overview", ALL, _simple("GET", "/portfolio/overview")),
    ("failures", ALL, _simple("GET", "/failures")),
    ("research notes", ALL, _simple("GET", "/research-notes")),
]


@pytest.mark.parametrize(("name", "allowed", "runner"), CASES, ids=[c[0] for c in CASES])
async def test_role_access_matrix(client, db_session_factory, name, allowed, runner):
    team = await _team(db_session_factory, uuid.uuid4().hex[:10])
    for role in UserRole:
        status = await runner(client, db_session_factory, team, role)
        if role in allowed:
            assert status not in (401, 403), f"{name}: {role.value} was refused ({status}) but had access before"
        else:
            assert status == 403, f"{name}: {role.value} got {status} but was refused before"


async def test_audit_log_scope_per_role(client, db_session_factory):
    team = await _team(db_session_factory, "scope")
    expected = {R.ADMIN: "organization", R.COMPLIANCE_OFFICER: "organization",
                R.CIO: "risk_actions", R.RISK_MANAGER: "own_risk_actions"}
    for role, scope in expected.items():
        body = (await client.get("/governance/audit-log", headers=team.tokens[role])).json()
        assert body["scope"] == scope, role


async def test_kill_review_list_scope_and_self_review_per_role(client, db_session_factory):
    team = await _team(db_session_factory, "killscope")
    for role in (R.RISK_MANAGER, R.CIO, R.ADMIN):
        assert await _kill(client, db_session_factory, team, role) == 200
    async with db_session_factory() as session:
        bind_organization(session.sync_session, team.org_id)
        reviews = (await session.execute(select(KillSwitchReview))).scalars().all()
    by_role = {r.triggered_by_role: r for r in reviews}
    assert by_role["cio"].is_self_reviewed is True
    assert by_role["risk_manager"].is_self_reviewed is False
    assert by_role["admin"].is_self_reviewed is False

    counts = {
        role: (await client.get("/governance/kill-switch/reviews", headers=team.tokens[role])).json()["total"]
        for role in APPROVAL
    }
    assert counts == {R.RISK_MANAGER: 1, R.CIO: 3, R.COMPLIANCE_OFFICER: 3, R.ADMIN: 3}


async def _notified_roles(maker, team) -> set[UserRole]:
    async with maker() as session:
        bind_organization(session.sync_session, team.org_id)
        user_ids = set((await session.execute(select(Notification.user_id))).scalars().all())
    return {role for role, u in team.users.items() if u.id in user_ids}


async def test_approval_request_notifies_exactly_the_approvers(client, db_session_factory):
    from app.services.strategy import maybe_notify_approval_requested

    team = await _team(db_session_factory, "notifyapprove")
    sid = await seed_strategy(db_session_factory, organization_id=team.org_id, status=StrategyStatus.CANDIDATE,
                              valid_rules=True, robustness_score=0.8)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, team.org_id)
        await maybe_notify_approval_requested(session, await session.get(Strategy, sid))
        await session.commit()
    assert await _notified_roles(db_session_factory, team) == set(APPROVAL)


async def test_failure_alert_notifies_governance_roles(client, db_session_factory):
    from app.services.failure import persist_failure

    team = await _team(db_session_factory, "notifyfail")
    sid = await seed_strategy(db_session_factory, organization_id=team.org_id, status=StrategyStatus.ACTIVE,
                              valid_rules=True, robustness_score=0.8)
    assessment = FailureAssessment(trigger=FailureTrigger.DRAWDOWN_BREACH, regime_at_failure="Bear",
                                   failure_timestamp=datetime(2025, 1, 2, tzinfo=UTC))
    async with db_session_factory() as session:
        bind_organization(session.sync_session, team.org_id)
        await persist_failure(session, strategy=await session.get(Strategy, sid), assessment=assessment)
        await session.commit()
    assert await _notified_roles(db_session_factory, team) == set(GOVERNANCE)


async def test_payment_failed_notifies_admin_and_cio(client, db_session_factory):
    from app.services.billing import handle_invoice_payment_failed

    team = await _team(db_session_factory, "notifybill")
    await _add(db_session_factory, team.org_id, Subscription(
        stripe_customer_id="cus_matrix", stripe_subscription_id="sub_matrix",
        tier=OrganizationTier.PRO, status=SubscriptionStatus.ACTIVE,
    ))
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        await handle_invoice_payment_failed(session, {"customer": "cus_matrix", "subscription": "sub_matrix"})
    assert await _notified_roles(db_session_factory, team) == {R.ADMIN, R.CIO}


async def test_superadmin_org_contact_is_the_org_admin(client, db_session_factory):
    from app.services.superadmin import _org_admin_email

    team = await _team(db_session_factory, "orgcontact")
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        assert await _org_admin_email(session, team.org_id) == team.users[R.ADMIN].email

