"""Kill switch (Batch 10): bypasses the state machine entirely, requires a reason,
writes an audit_log entry, and is gated to risk_manager/cio/admin (not
compliance_officer — see schemas.md RBAC finding #1)."""

from __future__ import annotations

import uuid

import pytest
from app.core.security import hash_password
from app.db.tenant import bind_organization, mark_session_unscoped
from app.models.audit_log import AuditEventType, AuditLog
from app.models.strategy import StrategyStatus
from app.models.user import User, UserRole
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, create_org_user, login, register_org


async def _add_user(
    maker: async_sessionmaker, *, organization_id: uuid.UUID, email: str, role: UserRole
) -> User:
    """Add an additional user with a given role to an ALREADY-EXISTING org (unlike
    create_org_user, which always creates a fresh org too)."""
    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        user = User(
            organization_id=organization_id,
            email=email.lower(),
            hashed_password=hash_password("supersecret1"),
            full_name=None,
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def _audit_rows(maker: async_sessionmaker, organization_id: uuid.UUID) -> list[AuditLog]:
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        return list((await session.execute(select(AuditLog))).scalars().all())


async def test_kill_switch_forces_retired_and_writes_audit_log(client, db_session_factory):
    token, org = await register_org(client, org_name="Kill Co", email="admin@kill.co")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.ACTIVE,
        valid_rules=True, robustness_score=0.9,
    )

    resp = await client.post(
        f"/governance/kill-switch/{sid}",
        json={"reason": "Anomalous drawdown detected, stopping immediately"},
        headers=bearer(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "retired"

    rows = await _audit_rows(db_session_factory, org)
    kill_rows = [r for r in rows if r.event_type == AuditEventType.KILL_SWITCH_ACTIVATED]
    assert len(kill_rows) == 1
    row = kill_rows[0]
    assert row.entity_type == "strategy"
    assert row.entity_id == sid
    assert row.before_state == {"status": "active"}
    assert row.after_state == {"status": "retired"}
    assert row.justification == "Anomalous drawdown detected, stopping immediately"


async def test_kill_switch_requires_non_blank_reason(client, db_session_factory):
    token, org = await register_org(client, org_name="Kill Reason Co", email="admin@killreason.co")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.ACTIVE,
        valid_rules=True, robustness_score=0.9,
    )

    empty = await client.post(f"/governance/kill-switch/{sid}", json={"reason": ""}, headers=bearer(token))
    assert empty.status_code == 422

    whitespace = await client.post(
        f"/governance/kill-switch/{sid}", json={"reason": "   "}, headers=bearer(token)
    )
    assert whitespace.status_code == 422

    # Neither attempt should have written an audit_log entry.
    rows = await _audit_rows(db_session_factory, org)
    assert not any(r.event_type == AuditEventType.KILL_SWITCH_ACTIVATED for r in rows)


async def test_kill_switch_bypasses_retire_admin_escalation(client, db_session_factory):
    """The flagship bypass proof: a FAILED, parentless strategy normally requires an
    admin to /retire (assert_retire_permitted's escalation) — a plain risk_manager
    gets 403 there, but kill-switch works for that SAME risk_manager on that SAME
    strategy, because it short-circuits the state machine entirely. Live-verified
    against real Postgres during Batch 10; this is the hermetic regression version."""
    org, _risk_mgr = await create_org_user(
        db_session_factory, org_name="Bypass Co", slug="bypass-co",
        email="riskmgr@bypass.co", role=UserRole.RISK_MANAGER,
    )
    token = (await login(client, email="riskmgr@bypass.co")).json()["access_token"]
    sid = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.FAILED,
        valid_rules=True, parent_strategy_id=None,
    )

    retire_resp = await client.post(
        f"/strategies/{sid}/retire", json={"reason": "trying the normal path"}, headers=bearer(token)
    )
    assert retire_resp.status_code == 403

    kill_resp = await client.post(
        f"/governance/kill-switch/{sid}",
        json={"reason": "Emergency stop, cannot wait for admin escalation"},
        headers=bearer(token),
    )
    assert kill_resp.status_code == 200
    assert kill_resp.json()["status"] == "retired"


@pytest.mark.parametrize("role", [UserRole.RESEARCHER, UserRole.COMPLIANCE_OFFICER])
async def test_kill_switch_wrong_role_403(client, db_session_factory, role):
    org, _user = await create_org_user(
        db_session_factory, org_name=f"KillDeny {role.value}", slug=f"kill-deny-{role.value}",
        email=f"{role.value}@killdeny.co", role=role,
    )
    token = (await login(client, email=f"{role.value}@killdeny.co")).json()["access_token"]
    sid = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE,
        valid_rules=True, robustness_score=0.9,
    )

    resp = await client.post(
        f"/governance/kill-switch/{sid}", json={"reason": "trying anyway"}, headers=bearer(token)
    )
    assert resp.status_code == 403


@pytest.mark.parametrize("role", [UserRole.RISK_MANAGER, UserRole.CIO, UserRole.ADMIN])
async def test_kill_switch_correct_roles_pass_the_gate(client, db_session_factory, role):
    org, _user = await create_org_user(
        db_session_factory, org_name=f"KillAllow {role.value}", slug=f"kill-allow-{role.value}",
        email=f"{role.value}@killallow.co", role=role,
    )
    token = (await login(client, email=f"{role.value}@killallow.co")).json()["access_token"]
    sid = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE,
        valid_rules=True, robustness_score=0.9,
    )

    resp = await client.post(
        f"/governance/kill-switch/{sid}", json={"reason": "authorized shutdown"}, headers=bearer(token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "retired"
