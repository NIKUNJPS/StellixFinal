"""Cross-asset regime divergence (Batch 22).

Every regime in the response must trace to a REAL stored regime_labels row — a
symbol that was never detected simply doesn't appear (no fabricated regimes).
Divergences only fire on real detected combinations.
"""

from __future__ import annotations

from app.api.routes.regimes import compute_regime_divergences

from tests.data_helpers import seed_regime_labels
from tests.helpers import bearer, register_org


async def test_cross_asset_uses_only_real_stored_regimes(client, db_session_factory):
    token, org_id = await register_org(client, org_name="CrossCo", email="x@cross.co")
    # SPY's latest regime is Bull; QQQ's latest is Bear. GLD has NO data.
    await seed_regime_labels(
        db_session_factory, organization_id=org_id, symbol="SPY", labels=[("Sideways", 0.5), ("Bull", 0.82)]
    )
    await seed_regime_labels(
        db_session_factory, organization_id=org_id, symbol="QQQ", labels=[("Bull", 0.6), ("Bear", 0.74)]
    )

    resp = await client.get("/regimes/cross-asset?symbols=SPY,QQQ,GLD", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()

    # Only the two symbols with real stored data appear — GLD (never detected) is absent.
    assert set(body["assets"].keys()) == {"SPY", "QQQ"}
    assert body["assets"]["SPY"]["regime"] == "Bull"      # matches the seeded latest row
    assert body["assets"]["QQQ"]["regime"] == "Bear"
    assert body["insufficient_data"] is False

    # Every regime string in the response is one we actually seeded — nothing invented.
    seen = {a["regime"] for a in body["assets"].values()}
    assert seen <= {"Bull", "Bear"}

    # Bull vs Bear is a real divergence, so it fires.
    types = {d["type"] for d in body["divergences"]}
    assert "regime_divergence" in types


async def test_cross_asset_insufficient_data_when_fewer_than_two(client, db_session_factory):
    token, org_id = await register_org(client, org_name="CrossThin", email="t@cross.co")
    await seed_regime_labels(
        db_session_factory, organization_id=org_id, symbol="SPY", labels=[("Bull", 0.8)]
    )
    resp = await client.get("/regimes/cross-asset?symbols=SPY,QQQ,GLD", headers=bearer(token))
    body = resp.json()
    assert body["insufficient_data"] is True
    assert body["divergences"] == []
    assert set(body["assets"].keys()) == {"SPY"}  # no fabricated QQQ/GLD


def test_divergence_rules_are_pure_and_honest():
    # Bull + Crisis -> both a regime divergence AND isolated stress.
    divs, sync = compute_regime_divergences({"SPY": "Bull", "BTC-USD": "Crisis"})
    kinds = {d["type"] for d in divs}
    assert "regime_divergence" in kinds
    assert "isolated_stress" in kinds
    assert sync is False

    # All identical -> synchronized, no divergences (not forced).
    divs2, sync2 = compute_regime_divergences({"SPY": "Bull", "QQQ": "Bull", "GLD": "Bull"})
    assert divs2 == []
    assert sync2 is True
