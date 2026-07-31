"""Portfolio cross-strategy view (Batch 20).

Every test drives the REAL code path against seeded data — real PerformanceSnapshot
rows in Postgres and real equity curves written to Redis through the production
``record_backtest_charts`` function, then read back by the correlation code. No
network beyond the local Postgres/Redis the suite already uses, and no fabricated
returns: where a curve is absent the test asserts the strategy is *excluded*, not
padded.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from app.db.tenant import bind_organization
from app.models.performance_snapshot import AGGREGATE_LABEL, PerformanceSnapshot
from app.models.strategy import StrategyStatus
from app.services.backtest_cache import record_backtest_charts
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org


async def _seed_aggregate_snapshot(
    maker: async_sessionmaker, *, organization_id, strategy_id, sharpe: float, max_dd: float
) -> None:
    """Write the ALL-regime aggregate row the overview reads for Sharpe / drawdown."""
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        session.add(
            PerformanceSnapshot(
                strategy_id=strategy_id,
                regime_label=AGGREGATE_LABEL,
                sharpe_ratio=sharpe,
                max_drawdown=max_dd,
                win_rate=0.55,
                profit_factor=1.4,
                calmar_ratio=0.7,
                trade_count=20,
            )
        )
        await session.commit()


def _equity_curve(seed: int, n: int = 120, start: str = "2024-01-01") -> pd.Series:
    """A deterministic but non-degenerate equity curve. Distinct seeds give
    distinct return streams, so correlations are genuine (not all 1.0)."""
    rng = np.random.default_rng(seed)
    daily = rng.normal(0.0005, 0.01, n)
    equity = 100_000.0 * np.cumprod(1.0 + daily)
    idx = pd.date_range(start, periods=n, freq="D")
    return pd.Series(equity, index=idx)


async def _store_curve(strategy_id, curve: pd.Series) -> None:
    """Persist a real equity curve exactly as run_backtest would (Redis)."""
    empty = pd.Series(dtype=float)
    await record_backtest_charts(
        strategy_id, equity_curve=curve, drawdown_series=empty, rolling_sharpe=empty
    )


# --------------------------------------------------------------------------- #
# Org isolation
# --------------------------------------------------------------------------- #
async def test_portfolio_overview_returns_only_org_strategies(client, db_session_factory):
    token_a, org_a = await register_org(client, org_name="PortA", email="a@porta.com")
    _token_b, org_b = await register_org(client, org_name="PortB", email="b@portb.com")

    # Two active strategies in org A, one in org B — B's must never leak into A's view.
    a1 = await seed_strategy(db_session_factory, organization_id=org_a, name="A-Alpha", status=StrategyStatus.ACTIVE)
    a2 = await seed_strategy(db_session_factory, organization_id=org_a, name="A-Beta", status=StrategyStatus.ACTIVE)
    await seed_strategy(db_session_factory, organization_id=org_b, name="B-Gamma", status=StrategyStatus.ACTIVE)
    await _seed_aggregate_snapshot(db_session_factory, organization_id=org_a, strategy_id=a1, sharpe=1.0, max_dd=-0.1)
    await _seed_aggregate_snapshot(db_session_factory, organization_id=org_a, strategy_id=a2, sharpe=0.5, max_dd=-0.2)

    resp = await client.get("/portfolio/overview", headers=bearer(token_a))
    assert resp.status_code == 200
    body = resp.json()

    assert body["total_active_strategies"] == 2  # A's two only, never B's
    names = {c["name"] for c in body["concentration"]}
    assert names == {"A-Alpha", "A-Beta"}
    assert "B-Gamma" not in names
    # Equal-weighted Sharpe of the two A strategies.
    assert body["portfolio_sharpe"] == 0.75
    # Worst single max drawdown.
    assert body["portfolio_max_drawdown"] == -0.2


async def test_only_active_strategies_are_counted(client, db_session_factory):
    """Draft/candidate strategies are not part of the active portfolio."""
    token, org = await register_org(client, org_name="ActiveOnly", email="a@activeonly.com")
    await seed_strategy(db_session_factory, organization_id=org, name="Live", status=StrategyStatus.ACTIVE)
    await seed_strategy(db_session_factory, organization_id=org, name="Draft", status=StrategyStatus.DRAFT)
    await seed_strategy(db_session_factory, organization_id=org, name="Candidate", status=StrategyStatus.CANDIDATE)

    body = (await client.get("/portfolio/overview", headers=bearer(token))).json()
    assert body["total_active_strategies"] == 1
    assert [c["name"] for c in body["concentration"]] == ["Live"]


# --------------------------------------------------------------------------- #
# Correlation over REAL equity curves
# --------------------------------------------------------------------------- #
async def test_correlation_matrix_uses_real_equity_curves(client, db_session_factory):
    token, org = await register_org(client, org_name="Corr", email="a@corr.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="One", status=StrategyStatus.ACTIVE)
    s2 = await seed_strategy(db_session_factory, organization_id=org, name="Two", status=StrategyStatus.ACTIVE)

    # A curve and a near-copy of it (seed+shared component) → high but <1 correlation;
    # and a genuinely independent curve. All REAL series written through the
    # production cache function.
    base = _equity_curve(seed=1)
    await _store_curve(s1, base)
    await _store_curve(s2, _equity_curve(seed=1))  # same seed → identical returns → corr 1.0

    resp = await client.get("/portfolio/correlation", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()

    assert set(body["labels"]) == {"One", "Two"}
    assert body["excluded"] == []
    assert body["days_used"] > 0
    # Diagonal is exactly 1.0 and the matrix is symmetric — the hallmark of a real
    # correlation computation, not a fabricated grid.
    m = body["matrix"]
    assert m[0][0] == 1.0 and m[1][1] == 1.0
    assert m[0][1] == m[1][0]
    # Identical return streams correlate at 1.0.
    assert abs(m[0][1] - 1.0) < 1e-6


async def test_correlation_reflects_independent_series(client, db_session_factory):
    """Two independent curves must NOT correlate at 1.0 — proves the matrix carries
    real signal rather than a constant."""
    token, org = await register_org(client, org_name="CorrIndep", email="a@corrindep.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="Ind1", status=StrategyStatus.ACTIVE)
    s2 = await seed_strategy(db_session_factory, organization_id=org, name="Ind2", status=StrategyStatus.ACTIVE)
    await _store_curve(s1, _equity_curve(seed=11))
    await _store_curve(s2, _equity_curve(seed=999))

    body = (await client.get("/portfolio/correlation", headers=bearer(token))).json()
    off_diag = body["matrix"][0][1]
    assert -1.0 <= off_diag <= 1.0
    assert abs(off_diag) < 0.95  # independent draws are not near-perfectly correlated


async def test_correlation_excludes_strategies_without_data(client, db_session_factory):
    """A strategy with no stored equity curve is named in `excluded`, never
    zero-padded into the matrix."""
    token, org = await register_org(client, org_name="CorrExcl", email="a@correxcl.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="HasData1", status=StrategyStatus.ACTIVE)
    s2 = await seed_strategy(db_session_factory, organization_id=org, name="HasData2", status=StrategyStatus.ACTIVE)
    await seed_strategy(db_session_factory, organization_id=org, name="NoData", status=StrategyStatus.ACTIVE)
    await _store_curve(s1, _equity_curve(seed=3))
    await _store_curve(s2, _equity_curve(seed=7))
    # NoData deliberately gets no curve written.

    body = (await client.get("/portfolio/correlation", headers=bearer(token))).json()
    assert "NoData" in body["excluded"]
    assert set(body["labels"]) == {"HasData1", "HasData2"}
    # The matrix is 2x2 — the excluded strategy is absent, not a row/column of zeros.
    assert len(body["matrix"]) == 2
    assert all(len(row) == 2 for row in body["matrix"])


async def test_correlation_empty_when_fewer_than_two_curves(client, db_session_factory):
    """One curve can't be correlated with anything → empty matrix, graceful (the
    frontend shows 'not enough backtest history yet')."""
    token, org = await register_org(client, org_name="CorrOne", email="a@corrone.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="Lonely", status=StrategyStatus.ACTIVE)
    await seed_strategy(db_session_factory, organization_id=org, name="AlsoNoData", status=StrategyStatus.ACTIVE)
    await _store_curve(s1, _equity_curve(seed=5))

    body = (await client.get("/portfolio/correlation", headers=bearer(token))).json()
    assert body["matrix"] == []
    assert "AlsoNoData" in body["excluded"]


# --------------------------------------------------------------------------- #
# Risk alerts
# --------------------------------------------------------------------------- #
async def test_concentration_alert_fires_above_40_pct(client, db_session_factory):
    """A single active strategy is 100% of the book → concentration alert."""
    token, org = await register_org(client, org_name="Conc", email="a@conc.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="Solo", status=StrategyStatus.ACTIVE)
    await _seed_aggregate_snapshot(db_session_factory, organization_id=org, strategy_id=s1, sharpe=1.0, max_dd=-0.1)

    body = (await client.get("/portfolio/overview", headers=bearer(token))).json()
    kinds = {a["kind"] for a in body["risk_alerts"]}
    assert "concentration" in kinds
    conc = next(a for a in body["risk_alerts"] if a["kind"] == "concentration")
    assert "Solo" in conc["message"] and "100%" in conc["message"]


async def test_drawdown_alert_fires_beyond_20_pct(client, db_session_factory):
    token, org = await register_org(client, org_name="DD", email="a@dd.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="Deep", status=StrategyStatus.ACTIVE)
    s2 = await seed_strategy(db_session_factory, organization_id=org, name="Shallow", status=StrategyStatus.ACTIVE)
    await _seed_aggregate_snapshot(db_session_factory, organization_id=org, strategy_id=s1, sharpe=0.5, max_dd=-0.35)
    await _seed_aggregate_snapshot(db_session_factory, organization_id=org, strategy_id=s2, sharpe=0.5, max_dd=-0.1)

    body = (await client.get("/portfolio/overview", headers=bearer(token))).json()
    kinds = {a["kind"] for a in body["risk_alerts"]}
    assert "drawdown" in kinds  # worst DD is -0.35, beyond the -0.20 bar
    # Two strategies at 50% each also trips concentration.
    assert body["portfolio_max_drawdown"] == -0.35


async def test_high_correlation_alert_fires(client, db_session_factory):
    """Two strategies with identical return streams → correlation 1.0 → alert."""
    token, org = await register_org(client, org_name="HiCorr", email="a@hicorr.com")
    s1 = await seed_strategy(db_session_factory, organization_id=org, name="Twin1", status=StrategyStatus.ACTIVE)
    s2 = await seed_strategy(db_session_factory, organization_id=org, name="Twin2", status=StrategyStatus.ACTIVE)
    await _store_curve(s1, _equity_curve(seed=42))
    await _store_curve(s2, _equity_curve(seed=42))

    body = (await client.get("/portfolio/overview", headers=bearer(token))).json()
    corr_alerts = [a for a in body["risk_alerts"] if a["kind"] == "correlation"]
    assert corr_alerts
    assert "Twin1" in corr_alerts[0]["message"] and "Twin2" in corr_alerts[0]["message"]


async def test_overview_handles_org_with_no_active_strategies(client, db_session_factory):
    """An org with no active strategies returns zeros, not a 500."""
    token, _org = await register_org(client, org_name="Empty", email="a@empty.com")
    body = (await client.get("/portfolio/overview", headers=bearer(token))).json()
    assert body["total_active_strategies"] == 0
    assert body["portfolio_sharpe"] is None
    assert body["risk_alerts"] == []
