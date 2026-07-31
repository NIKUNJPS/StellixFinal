"""Portfolio cross-strategy analytics (Batch 20).

Aggregates the org's ACTIVE strategies into a portfolio view: equal-weighted
Sharpe, worst drawdown, dominant-regime distribution, concentration, correlation,
and derived risk alerts.

Data sources — both REAL, neither fabricated:
  * Aggregate metrics (Sharpe, max drawdown) — the ``regime_label == "ALL"`` row of
    PerformanceSnapshot (Postgres), i.e. the same numbers the Backtest Results page
    shows.
  * Daily-return correlation — the real vectorbt equity curves persisted per
    strategy in Redis (``backtest:charts:{id}``, see app/services/backtest_cache.py).
    Correlation is computed with pandas on daily returns of those curves.

If a strategy has no stored metrics or no equity curve, it is reported as excluded
rather than padded with zeros or synthetic returns — a fabricated return in a
correlation matrix is exactly the failure this batch's constraints forbid.
"""

from __future__ import annotations

import uuid

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.performance_snapshot import AGGREGATE_LABEL, PerformanceSnapshot
from app.models.strategy import Strategy, StrategyStatus
from app.schemas.portfolio import (
    ConcentrationItem,
    CorrelationResponse,
    EquityPoint,
    PortfolioOverviewResponse,
    RegimeExposureItem,
    RiskAlert,
)
from app.services.backtest_cache import get_backtest_charts

# Thresholds for derived risk alerts (spec'd values).
_CONCENTRATION_PCT = 40.0
_CORRELATION_THRESHOLD = 0.8
_DRAWDOWN_ALERT = 0.20  # 20% portfolio max drawdown
# Fewer aligned daily-return observations than this and a correlation is noise, not
# signal — the strategy is excluded from the matrix rather than reported spuriously.
_MIN_CORRELATION_DAYS = 30
_CORRELATION_WINDOW_DAYS = 90


async def _active_strategies(session: AsyncSession, organization_id: uuid.UUID) -> list[Strategy]:
    """All ACTIVE strategies for the org. Tenant scoping is enforced by the
    session's org binding (TenantScopedModel); the explicit org filter is
    belt-and-suspenders and makes the query self-documenting."""
    rows = (
        await session.execute(
            select(Strategy)
            .where(Strategy.organization_id == organization_id)
            .where(Strategy.status == StrategyStatus.ACTIVE)
            .order_by(Strategy.name.asc())
        )
    ).scalars().all()
    return list(rows)


async def _aggregate_metrics(
    session: AsyncSession, strategy_id: uuid.UUID
) -> PerformanceSnapshot | None:
    """The strategy's ALL-regime aggregate snapshot, or None if never backtested."""
    return (
        await session.execute(
            select(PerformanceSnapshot)
            .where(PerformanceSnapshot.strategy_id == strategy_id)
            .where(PerformanceSnapshot.regime_label == AGGREGATE_LABEL)
        )
    ).scalar_one_or_none()


def _dominant_regime(regime_compatibility: dict | None) -> str | None:
    """The regime a strategy scores highest in (argmax of its real compatibility
    scores). None values (regime not evaluated) are ignored."""
    if not regime_compatibility:
        return None
    scored = {k: v for k, v in regime_compatibility.items() if isinstance(v, (int, float))}
    if not scored:
        return None
    return max(scored, key=scored.__getitem__)


async def _equity_series(strategy_id: uuid.UUID) -> pd.Series | None:
    """A strategy's REAL stored equity curve as a date-indexed Series, or None."""
    charts = await get_backtest_charts(strategy_id)
    if not charts:
        return None
    points = charts.get("equity_curve") or []
    rows = [(p["timestamp"], p["value"]) for p in points if p.get("value") is not None]
    if len(rows) < 2:
        return None
    idx = pd.to_datetime([ts for ts, _ in rows])
    return pd.Series([v for _, v in rows], index=idx).sort_index()


async def _equity_returns(strategy_id: uuid.UUID) -> pd.Series | None:
    """Daily returns from a strategy's REAL stored equity curve, or None if there is
    no usable curve. Never synthesises returns."""
    equity = await _equity_series(strategy_id)
    if equity is None:
        return None
    returns = equity.pct_change().dropna()
    return returns if not returns.empty else None


async def _combined_equity_curve(strategies: list[Strategy]) -> list[EquityPoint]:
    """Equal-weighted portfolio equity curve from REAL per-strategy curves.

    Each curve is normalised to a base of 1.0 (so strategies with different capital
    bases weight equally), aligned on shared dates, and averaged. Nothing is
    synthesised — a strategy with no stored curve simply isn't in the average.
    Empty list when no curve is available.
    """
    normalised: dict[str, pd.Series] = {}
    for strat in strategies:
        equity = await _equity_series(strat.id)
        if equity is None or equity.iloc[0] == 0:
            continue
        normalised[str(strat.id)] = equity / equity.iloc[0]
    if not normalised:
        return []
    frame = pd.DataFrame(normalised).dropna()  # shared dates only
    if frame.empty:
        return []
    combined = frame.mean(axis=1)
    return [
        EquityPoint(timestamp=pd.Timestamp(ts).isoformat(), value=round(float(v), 6))
        for ts, v in combined.items()
    ]


async def compute_overview(
    session: AsyncSession, organization_id: uuid.UUID
) -> PortfolioOverviewResponse:
    strategies = await _active_strategies(session, organization_id)
    n = len(strategies)

    sharpes: list[float] = []
    drawdowns: list[float] = []
    without_metrics: list[str] = []
    regime_counts: dict[str, int] = {}

    for strat in strategies:
        snap = await _aggregate_metrics(session, strat.id)
        if snap is None or snap.sharpe_ratio is None:
            without_metrics.append(strat.name)
        else:
            sharpes.append(snap.sharpe_ratio)
            if snap.max_drawdown is not None:
                drawdowns.append(snap.max_drawdown)

        dom = _dominant_regime(strat.regime_compatibility)
        if dom is not None:
            regime_counts[dom] = regime_counts.get(dom, 0) + 1

    portfolio_sharpe = round(sum(sharpes) / len(sharpes), 4) if sharpes else None
    # "Worst single strategy max drawdown" — drawdowns are stored negative, so the
    # worst is the minimum.
    portfolio_max_drawdown = round(min(drawdowns), 4) if drawdowns else None

    # Equal-weight allocation: 100/N each (the only honest default with no stored
    # weights). concentration = top 3 by weight; with equal weights that is the
    # first 3 alphabetically, all at the same weight.
    weight = round(100.0 / n, 2) if n else 0.0
    concentration = [
        ConcentrationItem(strategy_id=str(s.id), name=s.name, weight_pct=weight)
        for s in strategies[:3]
    ]

    regime_exposure = [
        RegimeExposureItem(
            regime=regime,
            count=count,
            pct=round(100.0 * count / n, 1) if n else 0.0,
        )
        for regime, count in sorted(regime_counts.items(), key=lambda kv: -kv[1])
    ]

    alerts = _risk_alerts(
        strategies=strategies,
        weight=weight,
        portfolio_max_drawdown=portfolio_max_drawdown,
        correlation=await compute_correlation(session, organization_id),
    )

    return PortfolioOverviewResponse(
        total_active_strategies=n,
        portfolio_sharpe=portfolio_sharpe,
        portfolio_max_drawdown=portfolio_max_drawdown,
        regime_exposure=regime_exposure,
        concentration=concentration,
        risk_alerts=alerts,
        combined_equity_curve=await _combined_equity_curve(strategies),
        strategies_without_metrics=without_metrics,
    )


def _risk_alerts(
    *,
    strategies: list[Strategy],
    weight: float,
    portfolio_max_drawdown: float | None,
    correlation: CorrelationResponse,
) -> list[RiskAlert]:
    alerts: list[RiskAlert] = []

    # Concentration: any strategy above the weight threshold. With equal weighting
    # this fires when the book is small enough that 100/N exceeds the threshold
    # (N <= 2 for a 40% bar).
    if weight > _CONCENTRATION_PCT:
        for s in strategies:
            alerts.append(
                RiskAlert(
                    severity="warning",
                    kind="concentration",
                    message=f"Concentration: {s.name} at {weight:.0f}% of the book",
                )
            )

    # Pairwise correlation over the real equity curves.
    labels = correlation.labels
    for i in range(len(labels)):
        for j in range(i + 1, len(labels)):
            corr = correlation.matrix[i][j]
            if corr > _CORRELATION_THRESHOLD:
                alerts.append(
                    RiskAlert(
                        severity="warning",
                        kind="correlation",
                        message=f"High correlation: {labels[i]} + {labels[j]} ({corr:.2f})",
                    )
                )

    # Portfolio drawdown (stored negative; compare magnitude).
    if portfolio_max_drawdown is not None and portfolio_max_drawdown < -_DRAWDOWN_ALERT:
        alerts.append(
            RiskAlert(
                severity="critical",
                kind="drawdown",
                message=f"Drawdown alert: worst strategy at {portfolio_max_drawdown * 100:.1f}%",
            )
        )

    return alerts


async def compute_correlation(
    session: AsyncSession, organization_id: uuid.UUID
) -> CorrelationResponse:
    """Daily-return correlation across active strategies' REAL equity curves.

    Aligns each strategy's returns on shared dates, uses the trailing
    ``_CORRELATION_WINDOW_DAYS`` of the overlap (or all of it, whichever is
    shorter), and drops any strategy with fewer than ``_MIN_CORRELATION_DAYS``
    aligned observations — named in ``excluded``, never zero-padded.
    """
    strategies = await _active_strategies(session, organization_id)

    series: dict[str, pd.Series] = {}
    excluded: list[str] = []
    for strat in strategies:
        returns = await _equity_returns(strat.id)
        if returns is None:
            excluded.append(strat.name)
        else:
            # Guard against two strategies sharing a name in the matrix columns.
            key = strat.name
            suffix = 2
            while key in series:
                key = f"{strat.name} ({suffix})"
                suffix += 1
            series[key] = returns

    if len(series) < 2:
        # Not enough curves to correlate anything. Honest empty result — the
        # frontend renders "not enough backtest history yet".
        return CorrelationResponse(
            labels=list(series.keys()), matrix=[], excluded=excluded, days_used=0
        )

    frame = pd.DataFrame(series).dropna()  # inner-join on shared dates
    if len(frame) > _CORRELATION_WINDOW_DAYS:
        frame = frame.iloc[-_CORRELATION_WINDOW_DAYS:]

    # A strategy whose overlap with the others is too thin is unreliable — exclude
    # it and recompute on the remainder rather than report a noisy coefficient.
    if len(frame) < _MIN_CORRELATION_DAYS:
        return CorrelationResponse(
            labels=list(series.keys()),
            matrix=[],
            excluded=excluded + [f"{k} (insufficient overlap)" for k in series],
            days_used=len(frame),
        )

    # A strategy with zero-variance returns over the window (flat equity curve —
    # e.g. it hasn't traded) has an undefined correlation against anything:
    # pandas reports NaN, which is neither a real number nor honestly "excluded"
    # if left in — and the API must never emit it (FastAPI serializes NaN as JSON
    # null, which crashes any consumer expecting a float). Drop it and recompute.
    zero_variance = [col for col in frame.columns if frame[col].std(ddof=0) == 0]
    if zero_variance:
        excluded = excluded + [f"{c} (no return variance)" for c in zero_variance]
        frame = frame.drop(columns=zero_variance)

    if len(frame.columns) < 2:
        return CorrelationResponse(
            labels=list(frame.columns), matrix=[], excluded=excluded, days_used=len(frame)
        )

    corr = frame.corr()
    labels = list(corr.columns)
    matrix = [
        [round(float(corr.iloc[i, j]), 4) for j in range(len(labels))]
        for i in range(len(labels))
    ]
    return CorrelationResponse(
        labels=labels, matrix=matrix, excluded=excluded, days_used=len(frame)
    )
