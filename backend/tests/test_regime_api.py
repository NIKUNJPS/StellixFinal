"""Regime API tests: current/history + tenant isolation."""

from __future__ import annotations

from tests.data_helpers import seed_regime_labels
from tests.helpers import bearer, register_org


async def test_current_and_history(client, db_session_factory):
    token, org = await register_org(client, org_name="Regime Co", email="r@regime.io")
    await seed_regime_labels(
        db_session_factory,
        organization_id=org,
        symbol="AAPL",
        labels=[("Low-Volatility", 1.0), ("High-Volatility", 0.75), ("Crisis", 0.5)],
    )

    current = await client.get("/regimes/current?symbol=AAPL", headers=bearer(token))
    assert current.status_code == 200
    body = current.json()
    assert body["regime_label"] == "Crisis"  # most recent
    assert body["confidence_score"] == 0.5
    assert "transition_probs" in body

    history = await client.get("/regimes/history?symbol=AAPL", headers=bearer(token))
    assert history.status_code == 200
    hist = history.json()
    assert hist["count"] == 3
    assert [p["regime_label"] for p in hist["points"]] == [
        "Low-Volatility",
        "High-Volatility",
        "Crisis",
    ]


async def test_regime_data_is_tenant_scoped(client, db_session_factory):
    token_a, org_a = await register_org(client, org_name="RA", email="a@ra.io")
    _token_b, org_b = await register_org(client, org_name="RB", email="b@rb.io")

    await seed_regime_labels(
        db_session_factory, organization_id=org_b, symbol="AAPL", labels=[("Bull", 1.0)]
    )

    # Org A has no regime data for AAPL — must not see org B's.
    current = await client.get("/regimes/current?symbol=AAPL", headers=bearer(token_a))
    assert current.status_code == 404
    history = await client.get("/regimes/history?symbol=AAPL", headers=bearer(token_a))
    assert history.json()["count"] == 0
