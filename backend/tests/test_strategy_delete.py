"""Batch 25 Task 1: a researcher can discard their OWN unsubmitted draft — and nothing
else. Anything that reached review, or carries failure/approval history, is permanent
research memory (Pillars 2 and 3) and must be retired, never deleted."""

from __future__ import annotations

import uuid

from app.db.tenant import bind_organization
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.audit_log import AuditEventType, AuditLog
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import UserRole
from sqlalchemy import select

from tests.data_helpers import seed_failure, seed_strategy
from tests.helpers import add_user_to_org, bearer, create_org_user, token_for

_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


async def _org_with_researchers(maker, tag: str):
    org, alice = await create_org_user(
        maker, org_name=f"Delete {tag}", slug=f"delete-{tag}", email=f"alice@{tag}.io", role=UserRole.RESEARCHER
    )
    bob = await add_user_to_org(maker, organization_id=org.id, email=f"bob@{tag}.io", role=UserRole.RESEARCHER)
    return org, alice, bob


async def _create_via_api(client, token: str, name: str = "Draft RSI") -> str:
    resp = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": name, "entry_rules": _ENTRY, "exit_rules": _EXIT, "risk_constraints": _RISK},
        headers=bearer(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_researcher_deletes_own_draft_and_it_is_gone(client, db_session_factory, fake_graph_repo):
    org, alice, _ = await _org_with_researchers(db_session_factory, "own")
    token = await token_for(client, alice.email)
    sid = await _create_via_api(client, token)
    assert await fake_graph_repo.get_node(str(org.id), node_type="Strategy", node_id=sid) is not None

    resp = await client.delete(f"/strategies/{sid}", headers=bearer(token))
    assert resp.status_code == 204

    listing = await client.get("/strategies", headers=bearer(token))
    assert sid not in {item["id"] for item in listing.json()["items"]}
    assert (await client.get(f"/strategies/{sid}", headers=bearer(token))).status_code == 404
    # The knowledge graph must not keep an orphan node for the discarded draft.
    assert await fake_graph_repo.get_node(str(org.id), node_type="Strategy", node_id=sid) is None

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        rows = (
            await session.execute(select(AuditLog).where(AuditLog.event_type == AuditEventType.STRATEGY_DELETED))
        ).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.actor_user_id == alice.id
    assert row.actor_email == alice.email
    assert row.actor_role == "researcher"
    assert row.entity_name == "Draft RSI"
    # The snapshot of what was discarded survives the delete.
    assert row.before_state["entry_rules"] == _ENTRY


async def test_researcher_cannot_delete_someone_elses_draft(client, db_session_factory):
    _, alice, bob = await _org_with_researchers(db_session_factory, "other")
    sid = await _create_via_api(client, await token_for(client, alice.email))

    resp = await client.delete(f"/strategies/{sid}", headers=bearer(await token_for(client, bob.email)))
    assert resp.status_code == 403
    alice_token = await token_for(client, alice.email)
    assert (await client.get(f"/strategies/{sid}", headers=bearer(alice_token))).status_code == 200


async def test_admin_can_delete_a_researchers_draft(client, db_session_factory):
    org, alice, _ = await _org_with_researchers(db_session_factory, "admindel")
    admin = await add_user_to_org(db_session_factory, organization_id=org.id, email="admin@admindel.io", role=UserRole.ADMIN)
    sid = await _create_via_api(client, await token_for(client, alice.email))

    resp = await client.delete(f"/strategies/{sid}", headers=bearer(await token_for(client, admin.email)))
    assert resp.status_code == 204


async def test_candidate_and_active_strategies_cannot_be_deleted_even_by_creator_or_admin(client, db_session_factory):
    org, alice, _ = await _org_with_researchers(db_session_factory, "nondraft")
    admin = await add_user_to_org(db_session_factory, organization_id=org.id, email="admin@nondraft.io", role=UserRole.ADMIN)
    for status in (StrategyStatus.CANDIDATE, StrategyStatus.ACTIVE, StrategyStatus.FAILED, StrategyStatus.RETIRED):
        sid = await seed_strategy(
            db_session_factory, organization_id=org.id, status=status, valid_rules=True, created_by_user_id=alice.id
        )
        for email in (alice.email, admin.email):
            resp = await client.delete(f"/strategies/{sid}", headers=bearer(await token_for(client, email)))
            assert resp.status_code == 409, (status, email, resp.text)
            assert "retire" in resp.json()["detail"].lower()


async def test_draft_with_failure_or_approval_history_is_preserved(client, db_session_factory):
    org, alice, _ = await _org_with_researchers(db_session_factory, "history")
    token = await token_for(client, alice.email)

    with_failure = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.DRAFT, created_by_user_id=alice.id
    )
    await seed_failure(
        db_session_factory, organization_id=org.id, strategy_id=with_failure,
        regime="Bear", trigger="drawdown_breach", top_features=["rsi_14"],
    )
    with_approval = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.DRAFT, created_by_user_id=alice.id
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        session.add(
            ApprovalRecord(
                strategy_id=with_approval, approved_by_user_id=alice.id,
                action=ApprovalAction.REJECT, justification="needs work",
            )
        )
        await session.commit()

    for sid in (with_failure, with_approval):
        resp = await client.delete(f"/strategies/{sid}", headers=bearer(token))
        assert resp.status_code == 409
        assert "preserved" in resp.json()["detail"]


async def test_cannot_delete_another_organizations_draft(client, db_session_factory):
    _, alice, _ = await _org_with_researchers(db_session_factory, "tenant-a")
    _, mallory, _ = await _org_with_researchers(db_session_factory, "tenant-b")
    sid = await _create_via_api(client, await token_for(client, alice.email))

    resp = await client.delete(f"/strategies/{sid}", headers=bearer(await token_for(client, mallory.email)))
    assert resp.status_code == 404
    async with db_session_factory() as session:
        from app.db.tenant import mark_session_unscoped

        mark_session_unscoped(session.sync_session)
        assert await session.get(Strategy, uuid.UUID(sid)) is not None
