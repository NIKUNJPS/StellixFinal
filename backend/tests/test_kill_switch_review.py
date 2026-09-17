"""Batch 25 Task 8: dual-approval kill switch.

The kill is always instant. A risk_manager (or admin) kill owes a CIO review within
14 days; a CIO kill is self-reviewed. Overdue reviews are flagged, never expired, and a
killed strategy stays visible for at least the review window."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.db.tenant import bind_organization
from app.models.audit_log import AuditEventType, AuditLog
from app.models.kill_switch_review import KillSwitchReview
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import UserRole
from sqlalchemy import select, update

from tests.data_helpers import seed_strategy
from tests.helpers import add_user_to_org, bearer, create_org_user, token_for


async def _governance_org(maker, tag: str):
    org, risk = await create_org_user(
        maker, org_name=f"Kill {tag}", slug=f"kill-{tag}", email=f"risk@{tag}.io", role=UserRole.RISK_MANAGER
    )
    cio = await add_user_to_org(maker, organization_id=org.id, email=f"cio@{tag}.io", role=UserRole.CIO, full_name="Jo Whitfield")
    return org, risk, cio


async def _active(maker, org_id, name="Momentum Core") -> uuid.UUID:
    return await seed_strategy(
        maker, organization_id=org_id, name=name, status=StrategyStatus.ACTIVE, valid_rules=True, robustness_score=0.9
    )


async def _reviews(maker, org_id) -> list[KillSwitchReview]:
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        return list((await session.execute(select(KillSwitchReview))).scalars().all())


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def test_risk_manager_kill_is_instant_and_owes_a_cio_review(client, db_session_factory):
    org, risk, _ = await _governance_org(db_session_factory, "rm")
    sid = await _active(db_session_factory, org.id)

    resp = await client.post(
        f"/governance/kill-switch/{sid}",
        json={"reason": "Drawdown far outside tolerance"},
        headers=bearer(await token_for(client, risk.email)),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "retired"  # instant — no waiting on the CIO

    [review] = await _reviews(db_session_factory, org.id)
    assert review.triggered_by_user_id == risk.id
    assert review.triggered_by_role == "risk_manager"
    assert review.reason == "Drawdown far outside tolerance"
    assert review.status_before_kill == "active"
    assert review.reviewed_by_user_id is None
    assert review.reviewed_at is None
    assert review.is_self_reviewed is False
    assert _aware(review.review_deadline) - _aware(review.triggered_at) == timedelta(days=14)


async def test_cio_kill_is_self_reviewed(client, db_session_factory):
    org, _, cio = await _governance_org(db_session_factory, "cio")
    sid = await _active(db_session_factory, org.id)

    resp = await client.post(
        f"/governance/kill-switch/{sid}", json={"reason": "Mandate breach"}, headers=bearer(await token_for(client, cio.email))
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "retired"
    [review] = await _reviews(db_session_factory, org.id)
    assert review.is_self_reviewed is True
    assert review.reviewed_by_user_id == cio.id
    assert review.reviewed_at is not None

    listing = await client.get(
        "/governance/kill-switch/reviews?review_state=awaiting", headers=bearer(await token_for(client, cio.email))
    )
    assert listing.json()["total"] == 0


async def test_cio_sees_and_acknowledges_pending_risk_manager_kill(client, db_session_factory):
    org, risk, cio = await _governance_org(db_session_factory, "ack")
    sid = await _active(db_session_factory, org.id, name="Gold Trend")
    risk_token = await token_for(client, risk.email)
    cio_token = await token_for(client, cio.email)
    await client.post(f"/governance/kill-switch/{sid}", json={"reason": "Liquidity gap"}, headers=bearer(risk_token))

    queue = (await client.get("/governance/kill-switch/reviews?review_state=awaiting", headers=bearer(cio_token))).json()
    assert queue["awaiting_review_count"] == 1
    [item] = queue["items"]
    assert item["strategy_name"] == "Gold Trend"
    assert item["review_state"] == "pending"
    assert item["triggered_by"]["email"] == risk.email
    assert item["triggered_by"]["role"] == "risk_manager"

    # The risk manager cannot sign off on their own kill.
    denied = await client.post(
        f"/governance/kill-switch/reviews/{item['id']}/acknowledge", json={"note": "fine"}, headers=bearer(risk_token)
    )
    assert denied.status_code == 403

    ack = await client.post(
        f"/governance/kill-switch/reviews/{item['id']}/acknowledge",
        json={"note": "Reviewed with risk — kill was warranted"},
        headers=bearer(cio_token),
    )
    assert ack.status_code == 200, ack.text
    body = ack.json()
    assert body["review_state"] == "reviewed"
    assert body["reviewed_by"]["email"] == cio.email
    assert body["strategy_status"] == "retired"  # acknowledging never reverses the kill

    again = await client.post(
        f"/governance/kill-switch/reviews/{item['id']}/acknowledge", json={"note": "twice"}, headers=bearer(cio_token)
    )
    assert again.status_code == 409

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = await session.get(Strategy, sid)
        assert strategy.status == StrategyStatus.RETIRED


async def test_overdue_review_is_flagged_not_hidden(client, db_session_factory):
    org, risk, cio = await _governance_org(db_session_factory, "overdue")
    sid = await _active(db_session_factory, org.id)
    await client.post(
        f"/governance/kill-switch/{sid}", json={"reason": "stop"}, headers=bearer(await token_for(client, risk.email))
    )
    long_ago = datetime.now(UTC) - timedelta(days=20)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        await session.execute(
            update(KillSwitchReview).values(triggered_at=long_ago, review_deadline=long_ago + timedelta(days=14))
        )
        await session.commit()

    cio_token = await token_for(client, cio.email)
    queue = (await client.get("/governance/kill-switch/reviews?review_state=awaiting", headers=bearer(cio_token))).json()
    assert queue["overdue_count"] == 1
    assert queue["items"][0]["review_state"] == "overdue"
    ack = await client.post(
        f"/governance/kill-switch/reviews/{queue['items'][0]['id']}/acknowledge",
        json={"note": "Late review"},
        headers=bearer(cio_token),
    )
    assert ack.status_code == 200


async def test_killed_strategy_is_still_visible_thirteen_days_later(client, db_session_factory):
    org, risk, cio = await _governance_org(db_session_factory, "visible")
    sid = await _active(db_session_factory, org.id, name="Visible Thirteen")
    await client.post(
        f"/governance/kill-switch/{sid}", json={"reason": "stop"}, headers=bearer(await token_for(client, risk.email))
    )
    thirteen_days_ago = datetime.now(UTC) - timedelta(days=13)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        await session.execute(
            update(KillSwitchReview).values(
                triggered_at=thirteen_days_ago, review_deadline=thirteen_days_ago + timedelta(days=14)
            )
        )
        await session.execute(update(Strategy).where(Strategy.id == sid).values(updated_at=thirteen_days_ago))
        await session.commit()

    for email in (risk.email, cio.email):
        token = await token_for(client, email)
        listing = (await client.get("/strategies", headers=bearer(token))).json()
        assert str(sid) in {i["id"] for i in listing["items"]}
        assert (await client.get(f"/strategies/{sid}", headers=bearer(token))).status_code == 200
        controls = (await client.get("/governance/strategy-controls", headers=bearer(token))).json()
        assert str(sid) in {i["id"] for i in controls["items"]}
        reviews = (await client.get("/governance/kill-switch/reviews?since_days=14", headers=bearer(token))).json()
        assert reviews["items"][0]["strategy_name"] == "Visible Thirteen"
        assert reviews["items"][0]["review_state"] == "pending"


async def test_both_kill_types_are_audited_with_actor_identity(client, db_session_factory):
    org, risk, cio = await _governance_org(db_session_factory, "audit")
    first = await _active(db_session_factory, org.id, name="Killed By Risk")
    second = await _active(db_session_factory, org.id, name="Killed By CIO")
    await client.post(f"/governance/kill-switch/{first}", json={"reason": "r1"}, headers=bearer(await token_for(client, risk.email)))
    await client.post(f"/governance/kill-switch/{second}", json={"reason": "r2"}, headers=bearer(await token_for(client, cio.email)))

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        rows = (
            await session.execute(select(AuditLog).where(AuditLog.event_type == AuditEventType.KILL_SWITCH_ACTIVATED))
        ).scalars().all()
    by_strategy = {row.entity_name: row for row in rows}
    assert by_strategy["Killed By Risk"].actor_email == risk.email
    assert by_strategy["Killed By Risk"].actor_role == "risk_manager"
    assert "CIO review due by" in by_strategy["Killed By Risk"].description
    assert by_strategy["Killed By CIO"].actor_email == cio.email
    assert by_strategy["Killed By CIO"].actor_role == "cio"
    assert by_strategy["Killed By CIO"].actor_name == "Jo Whitfield"
    assert "Self-reviewed" in by_strategy["Killed By CIO"].description


async def test_risk_manager_review_list_is_limited_to_their_own_kills(client, db_session_factory):
    org, risk, cio = await _governance_org(db_session_factory, "ownkills")
    other_risk = await add_user_to_org(db_session_factory, organization_id=org.id, email="risk2@ownkills.io", role=UserRole.RISK_MANAGER)
    mine = await _active(db_session_factory, org.id, name="Mine")
    theirs = await _active(db_session_factory, org.id, name="Theirs")
    await client.post(f"/governance/kill-switch/{mine}", json={"reason": "a"}, headers=bearer(await token_for(client, risk.email)))
    await client.post(f"/governance/kill-switch/{theirs}", json={"reason": "b"}, headers=bearer(await token_for(client, other_risk.email)))

    mine_view = (await client.get("/governance/kill-switch/reviews", headers=bearer(await token_for(client, risk.email)))).json()
    assert [i["strategy_name"] for i in mine_view["items"]] == ["Mine"]
    cio_view = (await client.get("/governance/kill-switch/reviews", headers=bearer(await token_for(client, cio.email)))).json()
    assert {i["strategy_name"] for i in cio_view["items"]} == {"Mine", "Theirs"}


async def test_researcher_cannot_see_reviews(client, db_session_factory):
    org, _, _ = await _governance_org(db_session_factory, "research")
    researcher = await add_user_to_org(db_session_factory, organization_id=org.id, email="r@research.io", role=UserRole.RESEARCHER)
    resp = await client.get("/governance/kill-switch/reviews", headers=bearer(await token_for(client, researcher.email)))
    assert resp.status_code == 403
