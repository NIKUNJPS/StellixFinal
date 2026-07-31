"""Failure heatmap (Batch 12, Main Dashboard): constructed fixture with known
expected output — strategy x regime failure counts."""

from __future__ import annotations

from tests.data_helpers import seed_failure, seed_strategy
from tests.helpers import bearer, register_org


async def test_failure_heatmap_known_fixture(client, db_session_factory):
    token, org = await register_org(client, org_name="HeatmapCo", email="hm@heatmapco.com")

    strat_a = await seed_strategy(db_session_factory, organization_id=org, name="Strategy A")
    strat_b = await seed_strategy(db_session_factory, organization_id=org, name="Strategy B")

    # Strategy A: 2 failures in Bear, 1 in Crisis.
    await seed_failure(db_session_factory, organization_id=org, strategy_id=strat_a, regime="Bear", trigger="drawdown_breach", top_features=["rsi_14"], day=1)
    await seed_failure(db_session_factory, organization_id=org, strategy_id=strat_a, regime="Bear", trigger="sharpe_decline", top_features=["rsi_14"], day=2)
    await seed_failure(db_session_factory, organization_id=org, strategy_id=strat_a, regime="Crisis", trigger="drawdown_breach", top_features=["rsi_14"], day=3)
    # Strategy B: 1 failure in Bear.
    await seed_failure(db_session_factory, organization_id=org, strategy_id=strat_b, regime="Bear", trigger="drawdown_breach", top_features=["rsi_14"], day=1)

    resp = await client.get("/failures/heatmap", headers=bearer(token))
    assert resp.status_code == 200
    cells = {(c["strategy_name"], c["regime_at_failure"]): c["count"] for c in resp.json()["cells"]}

    assert cells[("Strategy A", "Bear")] == 2
    assert cells[("Strategy A", "Crisis")] == 1
    assert cells[("Strategy B", "Bear")] == 1
    assert len(cells) == 3


async def test_failure_heatmap_empty_when_no_failures(client):
    token, _org = await register_org(client, org_name="NoFailuresCo", email="nf@nofailuresco.com")
    resp = await client.get("/failures/heatmap", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json()["cells"] == []


async def test_failure_heatmap_is_tenant_scoped(client, db_session_factory):
    token_a, org_a = await register_org(client, org_name="HeatmapA", email="a@heatmapa.com")
    _token_b, org_b = await register_org(client, org_name="HeatmapB", email="b@heatmapb.com")

    strat_b = await seed_strategy(db_session_factory, organization_id=org_b, name="Org B Strategy")
    await seed_failure(db_session_factory, organization_id=org_b, strategy_id=strat_b, regime="Bear", trigger="drawdown_breach", top_features=["rsi_14"])

    resp = await client.get("/failures/heatmap", headers=bearer(token_a))
    assert resp.status_code == 200
    assert resp.json()["cells"] == []
