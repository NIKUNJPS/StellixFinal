"""Portfolio cross-strategy view schemas (Batch 20).

Every number in these responses is derived from REAL stored data — aggregate
PerformanceSnapshot rows (Postgres) and real vectorbt equity curves (Redis cache,
`backtest:charts:{id}`). Nothing is synthesized to fill a chart. Where a metric
cannot be honestly computed (see RegimeExposureItem), it is labelled for what it
actually is rather than faked.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class RiskAlert(BaseModel):
    severity: str = Field(description="'critical' | 'warning' | 'info'")
    kind: str = Field(description="'concentration' | 'correlation' | 'drawdown'")
    message: str


class ConcentrationItem(BaseModel):
    strategy_id: str
    name: str
    weight_pct: float = Field(description="Equal-weight allocation, 100/N per active strategy")


class RegimeExposureItem(BaseModel):
    """Count of active strategies whose DOMINANT regime (argmax of the strategy's
    stored regime_compatibility) is this regime.

    This is regime *specialisation*, not live "currently trading in regime X" —
    strategies do not persist a symbol, so there is no honest symbol->current-regime
    join to make. Built from real regime_compatibility scores; see the route docstring.
    """

    regime: str
    count: int
    pct: float


class EquityPoint(BaseModel):
    timestamp: str
    value: float


class PortfolioOverviewResponse(BaseModel):
    total_active_strategies: int
    # None when no active strategy has an aggregate Sharpe yet (never backtested).
    portfolio_sharpe: float | None
    portfolio_max_drawdown: float | None
    regime_exposure: list[RegimeExposureItem]
    concentration: list[ConcentrationItem]
    risk_alerts: list[RiskAlert]
    # Equal-weighted portfolio equity curve: each active strategy's REAL curve
    # normalised to a base of 1.0, aligned on shared dates, averaged. Empty when
    # fewer than one curve is available. Never synthesised.
    combined_equity_curve: list[EquityPoint]
    # Strategies counted as active but with no stored backtest metrics — surfaced,
    # not silently dropped, so the KPIs are honest about their basis.
    strategies_without_metrics: list[str]


class CorrelationResponse(BaseModel):
    labels: list[str] = Field(description="Strategy names, row/column order of the matrix")
    matrix: list[list[float]] = Field(description="Pairwise daily-return correlation")
    # Active strategies dropped from the matrix because they lacked enough overlapping
    # equity-curve history — named, never padded with zeros.
    excluded: list[str]
    days_used: int = Field(description="Number of aligned daily-return observations used")
