"""Approval gate: candidate→active requires BOTH robustness>=0.70 AND an approve record."""

from __future__ import annotations

from app.models.strategy import StrategyStatus
from app.models.user import UserRole

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, create_org_user, login, register_org


async def test_activate_fails_without_approval_record(client, db_session_factory):
    # Robustness is fine (0.9) but no approve record → generic transition to active → 409.
    token, org = await register_org(client, org_name="Gate A", email="a@gate.io")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.CANDIDATE,
        valid_rules=True, robustness_score=0.9,
    )
    resp = await client.post(
        f"/strategies/{sid}/transition", json={"target_status": "active"}, headers=bearer(token)
    )
    assert resp.status_code == 409


async def test_activate_fails_with_record_but_low_score(client, db_session_factory):
    token, org = await register_org(client, org_name="Gate B", email="b@gate.io")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.CANDIDATE,
        valid_rules=True, robustness_score=0.5,
    )
    resp = await client.post(
        f"/strategies/{sid}/approve",
        json={"action": "approve", "justification": "looks ok"},
        headers=bearer(token),
    )
    assert resp.status_code == 409  # approve record created, but score < 0.70


async def test_activate_passes_when_both_conditions_met(client, db_session_factory):
    token, org = await register_org(client, org_name="Gate C", email="c@gate.io")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.CANDIDATE,
        valid_rules=True, robustness_score=0.8,
    )
    resp = await client.post(
        f"/strategies/{sid}/approve",
        json={"action": "approve", "justification": "robust across regimes"},
        headers=bearer(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


async def test_researcher_cannot_approve(client, db_session_factory):
    _org, researcher = await create_org_user(
        db_session_factory, org_name="RBAC Approve", slug="rbac-approve",
        email="researcher@appr.io", role=UserRole.RESEARCHER,
    )
    token = (await login(client, email="researcher@appr.io")).json()["access_token"]
    sid = await seed_strategy(
        db_session_factory, organization_id=researcher.organization_id,
        status=StrategyStatus.CANDIDATE, valid_rules=True, robustness_score=0.9,
    )
    resp = await client.post(
        f"/strategies/{sid}/approve",
        json={"action": "approve", "justification": "x"},
        headers=bearer(token),
    )
    assert resp.status_code == 403  # researcher is not a governance role
