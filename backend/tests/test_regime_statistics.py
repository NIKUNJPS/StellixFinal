"""Regime statistics + strategy compatibility alerts (Batch 12): constructed
fixtures with known expected output, per the batch's own DoD wording."""

from __future__ import annotations

from datetime import UTC, datetime

from app.db.tenant import bind_organization
from app.features.engineering import FEATURE_COLUMNS
from app.models.feature_matrix import FeatureMatrix
from app.models.market_data import MarketData
from app.models.regime_label import RegimeLabelRecord
from app.models.strategy import StrategyStatus
from app.regime.taxonomy import RegimeLabel
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org


async def _seed_bar(
    maker: async_sessionmaker, *, organization_id, symbol: str, day: int, close: float,
    vol_20: float, label: str,
) -> None:
    ts = datetime(2024, 1, day, tzinfo=UTC)
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        session.add(
            MarketData(
                symbol=symbol, timestamp=ts, open=close, high=close + 1, low=close - 1,
                close=close, volume=1_000_000.0, source="test",
            )
        )
        await session.flush()
        fm_kwargs = {col: None for col in FEATURE_COLUMNS}
        fm_kwargs["realized_vol_20"] = vol_20
        session.add(FeatureMatrix(symbol=symbol, timestamp=ts, features={}, **fm_kwargs))
        await session.flush()
        session.add(
            RegimeLabelRecord(
                symbol=symbol, timestamp=ts, regime_label=RegimeLabel(label), confidence_score=0.9,
                model_votes={"hmm": label, "pelt": label, "gmm": label, "garch": label},
            )
        )
        await session.commit()


async def test_regime_statistics_known_fixture(client, db_session_factory):
    token, org = await register_org(client, org_name="RegimeStatsCo", email="rs@statsco.com")

    # Bull: day1 close=100 (first bar, no return yet), day2 close=110 (+10%).
    await _seed_bar(db_session_factory, organization_id=org, symbol="AAPL", day=1, close=100.0, vol_20=0.01, label="Bull")
    await _seed_bar(db_session_factory, organization_id=org, symbol="AAPL", day=2, close=110.0, vol_20=0.02, label="Bull")
    # Bear: day3 close=99 (-10% from day2).
    await _seed_bar(db_session_factory, organization_id=org, symbol="AAPL", day=3, close=99.0, vol_20=0.05, label="Bear")

    resp = await client.get("/regimes/statistics?symbol=AAPL", headers=bearer(token))
    assert resp.status_code == 200
    items = {i["regime_label"]: i for i in resp.json()["items"]}

    assert set(items.keys()) == {"Bull", "Bear"}  # no bars for the other 4 taxonomy labels
    assert items["Bull"]["duration_days"] == 2
    assert abs(items["Bull"]["avg_volatility"] - 0.015) < 1e-9  # mean(0.01, 0.02)
    assert abs(items["Bull"]["avg_return"] - 0.10) < 1e-9  # day1's return is undefined (first bar), only day2 counts

    assert items["Bear"]["duration_days"] == 1
    assert abs(items["Bear"]["avg_volatility"] - 0.05) < 1e-9
    assert items["Bear"]["avg_return"] < 0  # (99 - 110) / 110


async def test_regime_statistics_empty_when_no_data(client):
    token, _org = await register_org(client, org_name="NoDataCo", email="nd@nodataco.com")
    resp = await client.get("/regimes/statistics?symbol=ZZZZ", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json()["items"] == []


async def test_compatibility_alerts_flags_incompatible_active_strategy(client, db_session_factory):
    token, org = await register_org(client, org_name="CompatCo", email="c@compatco.com")
    await _seed_bar(db_session_factory, organization_id=org, symbol="AAPL", day=1, close=100.0, vol_20=0.01, label="Crisis")

    # Compatible: ACTIVE, positive Sharpe recorded for Crisis -> no alert.
    await seed_strategy(
        db_session_factory, organization_id=org, name="Compatible", status=StrategyStatus.ACTIVE,
        robustness_score=0.8, regime_compatibility={"Crisis": 1.2, "Bull": 0.9},
    )
    # Incompatible #1: ACTIVE but regime_compatibility has no entry for Crisis at all.
    await seed_strategy(
        db_session_factory, organization_id=org, name="Missing Regime", status=StrategyStatus.ACTIVE,
        robustness_score=0.8, regime_compatibility={"Bull": 0.9},
    )
    # Incompatible #2: ACTIVE with a NEGATIVE Sharpe for Crisis specifically.
    await seed_strategy(
        db_session_factory, organization_id=org, name="Negative Sharpe", status=StrategyStatus.ACTIVE,
        robustness_score=0.8, regime_compatibility={"Crisis": -0.3},
    )
    # Not flagged: DRAFT status (not active), even though its data would otherwise qualify.
    await seed_strategy(
        db_session_factory, organization_id=org, name="Draft Strategy", status=StrategyStatus.DRAFT,
        regime_compatibility={},
    )

    resp = await client.get("/regimes/compatibility-alerts?symbol=AAPL", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_regime"] == "Crisis"
    flagged_names = {a["strategy_name"] for a in body["alerts"]}
    assert flagged_names == {"Missing Regime", "Negative Sharpe"}


async def test_compatibility_alerts_no_current_regime(client):
    token, _org = await register_org(client, org_name="NoRegimeCo", email="nr@noregimeco.com")
    resp = await client.get("/regimes/compatibility-alerts?symbol=ZZZZ", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_regime"] is None
    assert body["alerts"] == []
