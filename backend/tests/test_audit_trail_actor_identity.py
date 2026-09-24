"""Batch 25 Task 9/10: every meaningful action writes an audit row carrying the real
actor's identity (id, email, role at the time) and a readable description; the
governance audit log returns them by name, is searchable, and is scoped by role; the
member directory lets a compliance officer map people to ids without admin powers."""

from __future__ import annotations

import uuid

from app.core.config import settings
from app.db.tenant import bind_organization
from app.models.audit_log import AuditEventType, AuditLog
from app.models.llm_audit_log import LLMAuditLog
from app.models.strategy import StrategyStatus
from app.models.user import UserRole
from sqlalchemy import select

from tests.data_helpers import seed_strategy
from tests.helpers import add_user_to_org, bearer, create_org_user, token_for

_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


async def _team(maker, tag: str):
    org, compliance = await create_org_user(
        maker, org_name=f"Audit {tag}", slug=f"audit-{tag}", email=f"ao@{tag}.io", role=UserRole.COMPLIANCE_OFFICER
    )
    researcher = await add_user_to_org(
        maker, organization_id=org.id, email=f"dpark@{tag}.io", role=UserRole.RESEARCHER, full_name="Dana Park"
    )
    risk = await add_user_to_org(maker, organization_id=org.id, email=f"risk@{tag}.io", role=UserRole.RISK_MANAGER)
    cio = await add_user_to_org(maker, organization_id=org.id, email=f"cio@{tag}.io", role=UserRole.CIO)
    return org, compliance, researcher, risk, cio


async def _rows(maker, org_id) -> list[AuditLog]:
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        return list((await session.execute(select(AuditLog))).scalars().all())


async def test_research_actions_are_audited_with_real_actor(client, db_session_factory):
    org, _, researcher, _, _ = await _team(db_session_factory, "actions")
    token = await token_for(client, researcher.email)

    created = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": "Audited Strategy", "entry_rules": _ENTRY, "exit_rules": _EXIT, "risk_constraints": _RISK},
        headers=bearer(token),
    )
    sid = created.json()["id"]
    await client.post(
        f"/strategies/{sid}/versions",
        json={"entry_rules": {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 25}]},
              "change_reason": "tighten"},
        headers=bearer(token),
    )
    submitted = await client.post(f"/strategies/{sid}/submit", headers=bearer(token))
    assert submitted.status_code == 200
    throwaway = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": "Throwaway", "entry_rules": _ENTRY, "exit_rules": _EXIT, "risk_constraints": _RISK},
        headers=bearer(token),
    )
    await client.delete(f"/strategies/{throwaway.json()['id']}", headers=bearer(token))
    await client.post("/auth/logout", headers=bearer(token))

    rows = await _rows(db_session_factory, org.id)
    by_type: dict[AuditEventType, list[AuditLog]] = {}
    for row in rows:
        by_type.setdefault(row.event_type, []).append(row)

    for event in (
        AuditEventType.LOGIN,
        AuditEventType.STRATEGY_CREATED,
        AuditEventType.STRATEGY_VERSION_SAVED,
        AuditEventType.STRATEGY_STATUS_CHANGE,
        AuditEventType.STRATEGY_DELETED,
        AuditEventType.LOGOUT,
    ):
        assert event in by_type, f"no {event.value} row"
        for row in by_type[event]:
            assert row.actor_user_id == researcher.id
            assert row.actor_email == researcher.email
            assert row.actor_role == "researcher"
            assert row.description and "Dana Park" in row.description

    status_row = by_type[AuditEventType.STRATEGY_STATUS_CHANGE][0]
    assert status_row.before_state == {"status": "draft"} and status_row.after_state == {"status": "candidate"}
    assert status_row.entity_name == "Audited Strategy"


async def test_governance_audit_log_shows_all_event_types_with_names(client, db_session_factory):
    org, compliance, researcher, risk, cio = await _team(db_session_factory, "view")
    r_token = await token_for(client, researcher.email)
    await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": "Visible In Log", "entry_rules": _ENTRY, "exit_rules": _EXIT, "risk_constraints": _RISK},
        headers=bearer(r_token),
    )
    active = await seed_strategy(
        db_session_factory, organization_id=org.id, name="To Kill", status=StrategyStatus.ACTIVE, valid_rules=True, robustness_score=0.9
    )
    await client.post(f"/governance/kill-switch/{active}", json={"reason": "stop"}, headers=bearer(await token_for(client, risk.email)))
    await client.post(
        "/governance/export",
        json={"start_date": "2026-01-01", "end_date": "2026-12-31", "export_format": "json"},
        headers=bearer(await token_for(client, compliance.email)),
    )

    c_token = await token_for(client, compliance.email)
    log = (await client.get("/governance/audit-log?limit=200", headers=bearer(c_token))).json()
    assert log["scope"] == "organization"
    event_types = {item["event_type"] for item in log["items"]}
    assert {"login", "strategy_created", "kill_switch_activated", "data_export"} <= event_types
    for item in log["items"]:
        assert item["actor_identity_source"] == "recorded"
        assert item["actor_email"]
        assert item["description"]
    kill = next(i for i in log["items"] if i["event_type"] == "kill_switch_activated")
    assert kill["actor_email"] == risk.email and kill["actor_role"] == "risk_manager"
    assert kill["entity_name"] == "To Kill"

    by_name = (await client.get("/governance/audit-log?q=dana", headers=bearer(c_token))).json()
    assert by_name["total"] >= 2
    assert {i["actor_email"] for i in by_name["items"]} == {researcher.email}
    by_strategy = (await client.get("/governance/audit-log?q=visible%20in%20log", headers=bearer(c_token))).json()
    assert [i["event_type"] for i in by_strategy["items"]] == ["strategy_created"]
    by_actor = (await client.get(f"/governance/audit-log?actor_user_id={risk.id}", headers=bearer(c_token))).json()
    assert {i["actor_email"] for i in by_actor["items"]} == {risk.email}

    # CIO: risk + approval actions across the org, never logins/exports.
    cio_log = (await client.get("/governance/audit-log", headers=bearer(await token_for(client, cio.email)))).json()
    assert cio_log["scope"] == "risk_actions"
    assert {i["event_type"] for i in cio_log["items"]} == {"kill_switch_activated"}

    # Risk manager: only their own risk actions.
    other_risk = await add_user_to_org(db_session_factory, organization_id=org.id, email="risk2@view.io", role=UserRole.RISK_MANAGER)
    own = (await client.get("/governance/audit-log", headers=bearer(await token_for(client, other_risk.email)))).json()
    assert own["scope"] == "own_risk_actions"
    assert own["total"] == 0


async def test_legacy_rows_without_snapshot_resolve_current_profile(client, db_session_factory):
    org, compliance, researcher, _, _ = await _team(db_session_factory, "legacy")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        session.add(
            AuditLog(
                actor_user_id=researcher.id,
                event_type=AuditEventType.STRATEGY_APPROVED,
                entity_type="strategy",
                entity_id=uuid.uuid4(),
                justification="pre-Batch-25 row",
            )
        )
        await session.commit()
    log = (
        await client.get("/governance/audit-log?event_type=strategy_approved", headers=bearer(await token_for(client, compliance.email)))
    ).json()
    [item] = log["items"]
    assert item["actor_identity_source"] == "current_profile"
    assert item["actor_email"] == researcher.email
    assert "approved strategy" in item["description"]


async def test_member_directory_is_org_scoped_and_role_gated(client, db_session_factory):
    org, compliance, researcher, risk, cio = await _team(db_session_factory, "members")
    await create_org_user(db_session_factory, org_name="Other Org", slug="other-members", email="stranger@other.io")

    resp = await client.get("/users/members", headers=bearer(await token_for(client, compliance.email)))
    assert resp.status_code == 200
    body = resp.json()
    emails = {m["email"] for m in body["items"]}
    assert emails == {compliance.email, researcher.email, risk.email, cio.email}
    dana = next(m for m in body["items"] if m["email"] == researcher.email)
    assert dana["id"] == str(researcher.id)
    assert dana["full_name"] == "Dana Park"
    assert dana["role"] == "researcher"
    assert dana["is_active"] is True
    assert "last_login_at" in dana
    assert "hashed_password" not in dana

    searched = (await client.get("/users/members?q=park", headers=bearer(await token_for(client, compliance.email)))).json()
    assert [m["email"] for m in searched["items"]] == [researcher.email]

    for email in (researcher.email, risk.email, cio.email):
        denied = await client.get("/users/members", headers=bearer(await token_for(client, email)))
        assert denied.status_code == 403


async def test_llm_audit_log_entries_carry_readable_user(client, db_session_factory):
    org, compliance, researcher, _, _ = await _team(db_session_factory, "llmuser")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        session.add(
            LLMAuditLog(
                user_id=researcher.id, function_name="generate_hypothesis", full_prompt="p", full_response="r",
                model_used=settings.GEMINI_MODEL,
            )
        )
        session.add(
            LLMAuditLog(user_id=None, function_name="explain_failure", full_prompt="p", full_response="r", model_used="m")
        )
        await session.commit()
    token = await token_for(client, compliance.email)
    items = (await client.get("/llm/audit-log", headers=bearer(token))).json()["items"]
    by_function = {i["function_name"]: i for i in items}
    assert by_function["generate_hypothesis"]["user_email"] == researcher.email
    assert by_function["generate_hypothesis"]["user_name"] == "Dana Park"
    assert by_function["explain_failure"]["user_email"] is None
    filtered = (await client.get(f"/llm/audit-log?user_id={researcher.id}", headers=bearer(token))).json()
    assert [i["user_email"] for i in filtered["items"]] == [researcher.email]
