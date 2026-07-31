"""Manual /fail endpoint (role + reason) and failure API tenant isolation."""

from __future__ import annotations

from app.models.strategy import StrategyStatus
from app.models.user import UserRole

from tests.data_helpers import seed_failure, seed_strategy
from tests.helpers import bearer, create_org_user, login, register_org


async def test_manual_fail_requires_reason(client, db_session_factory):
    token, org = await register_org(client, org_name="MF Reason", email="mf@r.io")  # admin
    sid = await seed_strategy(db_session_factory, organization_id=org, status=StrategyStatus.ACTIVE)
    resp = await client.post(f"/strategies/{sid}/fail", json={"symbol": "SPY"}, headers=bearer(token))
    assert resp.status_code == 422  # reason required


async def test_manual_fail_requires_governance_role(client, db_session_factory):
    _org, researcher = await create_org_user(
        db_session_factory, org_name="MF Role", slug="mf-role", email="researcher@mf.io",
        role=UserRole.RESEARCHER,
    )
    token = (await login(client, email="researcher@mf.io")).json()["access_token"]
    sid = await seed_strategy(
        db_session_factory, organization_id=researcher.organization_id, status=StrategyStatus.ACTIVE
    )
    resp = await client.post(
        f"/strategies/{sid}/fail", json={"symbol": "SPY", "reason": "gut feeling"}, headers=bearer(token)
    )
    assert resp.status_code == 403  # researcher is not risk_manager/cio/admin


async def test_manual_fail_only_active_strategy(client, db_session_factory):
    token, org = await register_org(client, org_name="MF Active", email="mf@a.io")  # admin
    sid = await seed_strategy(db_session_factory, organization_id=org, status=StrategyStatus.DRAFT)
    resp = await client.post(
        f"/strategies/{sid}/fail", json={"symbol": "SPY", "reason": "x"}, headers=bearer(token)
    )
    assert resp.status_code == 409  # only active strategies can fail


async def test_failures_are_tenant_scoped(client, db_session_factory):
    token_a, _org_a = await register_org(client, org_name="FI A", email="a@fiapi.io")
    _org_b, user_b = await create_org_user(
        db_session_factory, org_name="FI B", slug="fi-b", email="b@fiapi.io"
    )
    sid_b = await seed_strategy(
        db_session_factory, organization_id=user_b.organization_id, status=StrategyStatus.ACTIVE
    )
    fid_b = await seed_failure(
        db_session_factory, organization_id=user_b.organization_id, strategy_id=sid_b,
        regime="Crisis", trigger="drawdown_breach", top_features=["sma_50"],
    )
    # Org A cannot read org B's failure.
    got = await client.get(f"/failures/{fid_b}", headers=bearer(token_a))
    assert got.status_code == 404
    listing = (await client.get("/failures", headers=bearer(token_a))).json()
    assert listing["count"] == 0
