"""Batch 25 Task 2: "save changes as a new version" is a real, reachable path that
bumps vX.Y -> vX.(Y+1), snapshots a StrategyVersion with the user's written change
reason, and never creates a second strategy row. New, unrelated strategies still start
at v1.0."""

from __future__ import annotations

import asyncio
import uuid

from app.db.tenant import bind_organization
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.audit_log import AuditEventType, AuditLog
from app.models.strategy import Strategy, StrategyStatus
from app.models.strategy_version import StrategyVersion
from app.models.user import UserRole
from sqlalchemy import func, select

from tests.data_helpers import seed_strategy
from tests.helpers import add_user_to_org, bearer, create_org_user, token_for

_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


async def _researcher(maker, tag: str):
    org, user = await create_org_user(
        maker, org_name=f"Version {tag}", slug=f"version-{tag}", email=f"r@{tag}.io", role=UserRole.RESEARCHER
    )
    return org, user


async def _create(client, token, name="RSI Reversion"):
    resp = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": name, "entry_rules": _ENTRY, "exit_rules": _EXIT, "risk_constraints": _RISK},
        headers=bearer(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _tighter(value: int) -> dict:
    return {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": value}]}


async def test_save_as_new_version_increments_and_records_reason(client, db_session_factory):
    org, user = await _researcher(db_session_factory, "bump")
    token = await token_for(client, user.email)
    created = await _create(client, token)
    assert created["version"] == "v1.0"
    sid = created["id"]

    first = await client.post(
        f"/strategies/{sid}/versions",
        json={"entry_rules": _tighter(25), "change_reason": "Tighter oversold threshold after Q2 review"},
        headers=bearer(token),
    )
    assert first.status_code == 201, first.text
    assert first.json()["version"] == "v1.1"
    assert first.json()["id"] == sid

    second = await client.post(
        f"/strategies/{sid}/versions",
        json={"risk_constraints": {**_RISK, "stop_loss_pct": 3}, "change_reason": "Smaller stop loss"},
        headers=bearer(token),
    )
    assert second.status_code == 201
    assert second.json()["version"] == "v1.2"

    history = (await client.get(f"/strategies/{sid}/versions", headers=bearer(token))).json()
    assert [v["version_number"] for v in history] == ["v1.0", "v1.1", "v1.2"]
    assert [v["change_reason"] for v in history] == [
        "Initial version",
        "Tighter oversold threshold after Q2 review",
        "Smaller stop loss",
    ]
    assert history[1]["changed_keys"] == ["entry_rules"]
    assert history[2]["changed_keys"] == ["risk_constraints"]

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        assert await session.scalar(select(func.count()).select_from(Strategy)) == 1  # no duplicate row
        snapshots = (
            await session.execute(select(StrategyVersion).where(StrategyVersion.version_number == "v1.1"))
        ).scalars().all()
        assert snapshots[0].parameters_snapshot["entry_rules"] == _tighter(25)
        audit = (
            await session.execute(
                select(AuditLog).where(AuditLog.event_type == AuditEventType.STRATEGY_VERSION_SAVED)
            )
        ).scalars().all()
    assert len(audit) == 2
    assert {a.actor_email for a in audit} == {user.email}
    assert {a.justification for a in audit} == {"Tighter oversold threshold after Q2 review", "Smaller stop loss"}


async def test_new_unrelated_strategy_still_starts_at_v1_0(client, db_session_factory):
    _, user = await _researcher(db_session_factory, "fresh")
    token = await token_for(client, user.email)
    first = await _create(client, token, name="First")
    await client.post(
        f"/strategies/{first['id']}/versions",
        json={"entry_rules": _tighter(20), "change_reason": "tune"},
        headers=bearer(token),
    )
    other = await _create(client, token, name="Completely different idea")
    assert other["version"] == "v1.0"


async def test_change_reason_is_mandatory_and_changes_are_required(client, db_session_factory):
    _, user = await _researcher(db_session_factory, "rules")
    token = await token_for(client, user.email)
    sid = (await _create(client, token))["id"]

    missing = await client.post(f"/strategies/{sid}/versions", json={"entry_rules": _tighter(22)}, headers=bearer(token))
    assert missing.status_code == 422
    blank = await client.post(
        f"/strategies/{sid}/versions", json={"entry_rules": _tighter(22), "change_reason": "   "}, headers=bearer(token)
    )
    assert blank.status_code == 422
    unchanged = await client.post(
        f"/strategies/{sid}/versions", json={"entry_rules": _ENTRY, "change_reason": "no-op"}, headers=bearer(token)
    )
    assert unchanged.status_code == 422
    assert "No rule" in unchanged.json()["detail"]
    current = (await client.get(f"/strategies/{sid}", headers=bearer(token))).json()
    assert current["strategy"]["version"] == "v1.0"


async def test_retired_strategy_is_immutable_and_governance_roles_cannot_author(client, db_session_factory):
    org, user = await _researcher(db_session_factory, "immutable")
    token = await token_for(client, user.email)
    retired = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.RETIRED, valid_rules=True
    )
    resp = await client.post(
        f"/strategies/{retired}/versions",
        json={"entry_rules": _tighter(10), "change_reason": "revive"},
        headers=bearer(token),
    )
    assert resp.status_code == 409
    put = await client.put(f"/strategies/{retired}", json={"entry_rules": _tighter(10)}, headers=bearer(token))
    assert put.status_code == 409

    risk = await add_user_to_org(db_session_factory, organization_id=org.id, email="risk@immutable.io", role=UserRole.RISK_MANAGER)
    draft = await seed_strategy(db_session_factory, organization_id=org.id, valid_rules=True)
    forbidden = await client.post(
        f"/strategies/{draft}/versions",
        json={"entry_rules": _tighter(10), "change_reason": "risk edit"},
        headers=bearer(await token_for(client, risk.email)),
    )
    assert forbidden.status_code == 403


async def test_new_version_of_active_strategy_returns_to_draft(client, db_session_factory):
    org, user = await _researcher(db_session_factory, "active")
    token = await token_for(client, user.email)
    sid = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE, valid_rules=True, robustness_score=0.9
    )
    resp = await client.post(
        f"/strategies/{sid}/versions",
        json={"exit_rules": {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 65}]},
         "change_reason": "Exit earlier"},
        headers=bearer(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["robustness_score"] is None


async def test_approval_of_old_version_does_not_count_for_new_version(client, db_session_factory):
    """A rejected (or approved) decision on v1.0 must not keep v1.1 out of the queue
    or let v1.1 activate on v1.0's approval."""
    org, user = await _researcher(db_session_factory, "requeue")
    cio = await add_user_to_org(db_session_factory, organization_id=org.id, email="cio@requeue.io", role=UserRole.CIO)
    token = await token_for(client, user.email)
    cio_token = await token_for(client, cio.email)
    sid = (await _create(client, token))["id"]

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = await session.get(Strategy, uuid.UUID(sid))
        strategy.status = StrategyStatus.CANDIDATE
        strategy.robustness_score = 0.85
        session.add(
            ApprovalRecord(
                strategy_id=strategy.id, approved_by_user_id=cio.id, action=ApprovalAction.REJECT, justification="v1.0 too loose"
            )
        )
        await session.commit()
    queue = (await client.get("/governance/approval-queue", headers=bearer(cio_token))).json()
    assert sid not in {i["id"] for i in queue["items"]}

    await asyncio.sleep(1.1)  # SQLite timestamps are second-resolution
    await client.post(
        f"/strategies/{sid}/versions",
        json={"entry_rules": _tighter(24), "change_reason": "Address CIO feedback"},
        headers=bearer(token),
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = await session.get(Strategy, uuid.UUID(sid))
        strategy.status = StrategyStatus.CANDIDATE
        strategy.robustness_score = 0.88
        await session.commit()
    queue = (await client.get("/governance/approval-queue", headers=bearer(cio_token))).json()
    assert sid in {i["id"] for i in queue["items"]}
