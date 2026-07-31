"""Regime-aware backtesting engine (vectorbt).

Pipeline (SRC §5.2 / RAQRIA step 5):
1. Evaluate the entry/exit rule DSL over all rows (2-row window for crosses_*) to get
   boolean signal arrays.
2. Run ``vectorbt.Portfolio.from_signals`` with the risk_constraints applied.
3. Partition each trade's return by the regime label at that trade's ENTRY timestamp
   (joined on timestamp, not positional index).
4. Compute per-regime + aggregate metrics (Sharpe, max drawdown, win rate, profit
   factor, Calmar, trade count).
5. Derive a robustness_score in [0, 1] used by the candidate→active gate.

Metric definitions are deliberately explicit so they are reproducible and testable:
- Sharpe        = mean(trade_returns) / std(trade_returns, ddof=1)   (per-trade)
- Sortino       = mean(trade_returns) / std(losing trade_returns, ddof=1)  (Batch 12)
- max_drawdown  = min peak-to-trough of cumprod(1+returns) - 1       (≤ 0)
- win_rate      = fraction of trades with return > 0
- profit_factor = Σ gains / |Σ losses|  (None if there are no losses)
- Calmar        = total_return / |max_drawdown|
- Beta          = cov(per-bar portfolio returns, benchmark returns) / var(benchmark
  returns) (Batch 12; aggregate-only, per-bar not per-trade — see compute_beta)
- Annualized return / volatility (Batch 12) = also per-bar (see compute_bar_level_metrics),
  using a fixed 252-trading-day/year convention (TRADING_DAYS_PER_YEAR)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.strategy.dsl import generate_signals

DEFAULT_INIT_CASH = 100_000.0
DEFAULT_FEES = 0.001
# Standard daily-bar equities convention; this platform only ingests daily OHLCV
# (see app/services/ingestion.py), so a single fixed constant is appropriate here
# rather than a per-symbol inferred value.
TRADING_DAYS_PER_YEAR = 252
ROLLING_SHARPE_WINDOW = 20


@dataclass
class BacktestResult:
    per_regime: dict[str, dict] = field(default_factory=dict)
    aggregate: dict = field(default_factory=dict)
    regime_compatibility: dict[str, float | None] = field(default_factory=dict)
    robustness_score: float = 0.0
    trades: pd.DataFrame = field(default_factory=pd.DataFrame)
    period_start: pd.Timestamp | None = None
    period_end: pd.Timestamp | None = None
    # Batch 12: aggregate-only (not per-regime — needs per-BAR portfolio returns,
    # not the per-trade returns the rest of this dataclass is built from). Same
    # per-bar basis as Beta, and for the same reason.
    beta_vs_benchmark: float | None = None
    annualized_return: float | None = None
    volatility: float | None = None
    # Per-bar chart series for the Backtest Results page (Batch 12) — kept as
    # pd.Series (not persisted to Postgres; cached in Redis by the caller, see
    # app/services/backtest_cache.py) since this is ~1 row/trading day for the
    # backtest's whole window, not snapshot- or trade-shaped data.
    equity_curve: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    drawdown_series: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))
    rolling_sharpe: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))


def compute_trade_metrics(returns: np.ndarray) -> dict[str, Any]:
    """Metrics from a 1-D array of per-trade returns (fractions)."""
    returns = np.asarray(returns, dtype=float)
    n = int(len(returns))
    if n == 0:
        return {
            "sharpe_ratio": None,
            "sortino_ratio": None,
            "max_drawdown": None,
            "win_rate": None,
            "profit_factor": None,
            "calmar_ratio": None,
            "trade_count": 0,
        }

    win_rate = float(np.mean(returns > 0))
    gains = returns[returns > 0].sum()
    losses = returns[returns < 0].sum()
    profit_factor = float(gains / abs(losses)) if losses < 0 else None

    sharpe = None
    if n >= 2:
        std = returns.std(ddof=1)
        if std > 0:
            sharpe = float(returns.mean() / std)

    # Sortino: same shape as Sharpe, but the denominator is downside deviation
    # (std of only the losing trades) rather than total volatility — a
    # strategy with big, consistent wins and small, rare losses should not be
    # penalized by upside variance the way Sharpe penalizes it.
    sortino = None
    downside = returns[returns < 0]
    if len(downside) >= 2:
        downside_std = downside.std(ddof=1)
        if downside_std > 0:
            sortino = float(returns.mean() / downside_std)

    equity = np.cumprod(1.0 + returns)
    peak = np.maximum.accumulate(equity)
    drawdown = equity / peak - 1.0
    max_drawdown = float(drawdown.min())  # ≤ 0
    total_return = float(equity[-1] - 1.0)
    calmar = float(total_return / abs(max_drawdown)) if max_drawdown < 0 else None

    return {
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "max_drawdown": max_drawdown,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "calmar_ratio": calmar,
        "trade_count": n,
    }


def _robustness_score(aggregate: dict, per_regime: dict[str, dict]) -> float:
    """Composite in [0, 1]: 60% aggregate-Sharpe component + 40% regime consistency."""
    agg_sharpe = aggregate.get("sharpe_ratio") or 0.0
    sharpe_component = float(np.clip(agg_sharpe / 2.0, 0.0, 1.0))  # Sharpe 2.0 → 1.0

    traded = [m for m in per_regime.values() if m["trade_count"] > 0 and m["sharpe_ratio"] is not None]
    if traded:
        consistency = float(np.mean([1.0 if m["sharpe_ratio"] > 0 else 0.0 for m in traded]))
    else:
        consistency = 0.0
    return round(0.6 * sharpe_component + 0.4 * consistency, 4)


def compute_beta(portfolio_returns: pd.Series, benchmark_close: pd.Series | None) -> float | None:
    """Beta vs. a benchmark (Batch 12): cov(strategy, benchmark) / var(benchmark),
    using per-BAR returns for both series over their overlapping window — NOT
    the per-trade returns the rest of this module uses for Sharpe/Sortino/etc,
    which have irregular spacing (a 3-day trade and a 30-day trade aren't
    comparable return observations for a covariance calc the way two
    consecutive daily bars are). None when there's no benchmark data covering
    the backtest's period — never computed against a resampled/interpolated
    proxy."""
    if benchmark_close is None or benchmark_close.empty:
        return None
    benchmark_returns = benchmark_close.sort_index().astype(float).pct_change().dropna()
    aligned = pd.concat(
        [portfolio_returns.rename("strategy"), benchmark_returns.rename("benchmark")],
        axis=1,
        join="inner",
    ).dropna()
    if len(aligned) < 2:
        return None
    variance = aligned["benchmark"].var(ddof=1)
    if not variance or pd.isna(variance):
        return None
    covariance = aligned["strategy"].cov(aligned["benchmark"])
    return float(covariance / variance)


def compute_bar_level_metrics(portfolio_returns: pd.Series) -> dict[str, float | None]:
    """Annualized return + annualized volatility (Batch 12) from per-BAR
    portfolio returns — same basis as Beta, and for the same reason: a strategy
    that trades rarely has irregularly-spaced per-trade returns that aren't
    valid observations for a time-annualized statistic the way regularly
    spaced daily bars are."""
    n = int(len(portfolio_returns))
    if n < 2:
        return {"annualized_return": None, "volatility": None}
    total_return = float((1.0 + portfolio_returns).prod() - 1.0)
    years = n / TRADING_DAYS_PER_YEAR
    annualized_return = float((1.0 + total_return) ** (1.0 / years) - 1.0) if years > 0 else None
    std = portfolio_returns.std(ddof=1)
    volatility = float(std * np.sqrt(TRADING_DAYS_PER_YEAR)) if pd.notna(std) else None
    return {"annualized_return": annualized_return, "volatility": volatility}


def _rolling_sharpe(portfolio_returns: pd.Series, window: int = ROLLING_SHARPE_WINDOW) -> pd.Series:
    """Rolling `window`-bar Sharpe (annualized), for the Backtest Results page's
    "rolling Sharpe" chart. NaN for the warm-up window (no partial-window
    values — a rolling stat over fewer than `window` bars isn't the same
    statistic, don't let a chart imply otherwise)."""
    rolling_mean = portfolio_returns.rolling(window).mean()
    rolling_std = portfolio_returns.rolling(window).std(ddof=1)
    return (rolling_mean / rolling_std) * np.sqrt(TRADING_DAYS_PER_YEAR)


def run_regime_aware_backtest(
    strategy: dict,
    feature_matrix_df: pd.DataFrame,
    regime_labels_df: pd.DataFrame,
    benchmark_close: pd.Series | None = None,
) -> BacktestResult:
    """Run the backtest. ``feature_matrix_df`` must contain ``close`` + indicators
    indexed by timestamp; ``regime_labels_df`` maps timestamp → regime_label.
    ``benchmark_close`` (Batch 12, optional) is the benchmark symbol's own
    close-price series over the same window, used only for Beta — omit it
    (e.g. for the evolution engine's per-generation fitness evaluation, where
    loading extra benchmark data on every individual would slow the GA loop
    for a metric that isn't displayed there) to skip the Beta calculation."""
    import vectorbt as vbt  # heavy import kept local to the worker

    df = feature_matrix_df.sort_index()
    if "close" not in df.columns:
        raise ValueError("feature_matrix_df must include a 'close' column")

    entries = generate_signals(strategy.get("entry_rules") or {}, df)
    exits = generate_signals(strategy.get("exit_rules") or {}, df)

    risk = strategy.get("risk_constraints") or {}
    sl_stop = None
    if risk.get("stop_loss_pct") is not None:
        sl_stop = float(risk["stop_loss_pct"]) / 100.0
    size = None
    if risk.get("max_position_size_pct") is not None:
        size = float(risk["max_position_size_pct"]) / 100.0

    close = df["close"].astype(float)
    freq = pd.infer_freq(df.index) or "1D"

    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        init_cash=DEFAULT_INIT_CASH,
        fees=DEFAULT_FEES,
        sl_stop=sl_stop,
        size=size,
        size_type="percent" if size is not None else "amount",
        freq=freq,
    )

    result = BacktestResult(period_start=df.index.min(), period_end=df.index.max())

    # Per-bar series (Batch 12): well-defined even with zero trades (a flat
    # equity curve at init_cash), so compute these before the trade-count
    # branch below rather than duplicating the calls in both branches.
    portfolio_returns = pf.returns()
    result.equity_curve = pf.value()
    result.drawdown_series = pf.drawdown()
    result.rolling_sharpe = _rolling_sharpe(portfolio_returns)
    result.beta_vs_benchmark = compute_beta(portfolio_returns, benchmark_close)
    bar_metrics = compute_bar_level_metrics(portfolio_returns)
    result.annualized_return = bar_metrics["annualized_return"]
    result.volatility = bar_metrics["volatility"]

    trades = pf.trades.records_readable
    if len(trades) == 0:
        result.aggregate = compute_trade_metrics(np.array([]))
        return result

    # Regime at each trade's entry timestamp (join on timestamp).
    regime_series = (
        regime_labels_df.set_index("timestamp")["regime_label"]
        if "timestamp" in regime_labels_df.columns
        else regime_labels_df["regime_label"]
    )
    entry_ts = pd.to_datetime(trades["Entry Timestamp"], utc=True)
    exit_ts = pd.to_datetime(trades["Exit Timestamp"], utc=True)
    labels = [regime_series.get(ts) for ts in entry_ts]

    # Bar positions + holding period (bars), used by walk-forward slicing and the
    # persistence random-entry benchmark (same holding-period distribution).
    pos_by_ts = {ts: i for i, ts in enumerate(df.index)}
    entry_pos = [pos_by_ts.get(ts) for ts in entry_ts]
    exit_pos = [pos_by_ts.get(ts) for ts in exit_ts]
    holding_bars = [
        max(int(ep - en), 1) if (en is not None and ep is not None) else 1
        for en, ep in zip(entry_pos, exit_pos, strict=False)
    ]

    trades_out = pd.DataFrame(
        {
            "entry_timestamp": entry_ts.to_numpy(),
            "exit_timestamp": exit_ts.to_numpy(),
            "entry_pos": entry_pos,
            "holding_bars": holding_bars,
            "return": trades["Return"].to_numpy(),
            "regime": labels,
            # Batch 12: for TradeRecord (the Backtest Results page's trade log).
            "direction": trades["Direction"].to_numpy(),
            "entry_price": trades["Avg Entry Price"].to_numpy(),
            "exit_price": trades["Avg Exit Price"].to_numpy(),
            "pnl": trades["PnL"].to_numpy(),
        }
    )
    result.trades = trades_out

    # Per-regime metrics.
    for label, group in trades_out.dropna(subset=["regime"]).groupby("regime"):
        metrics = compute_trade_metrics(group["return"].to_numpy())
        result.per_regime[str(label)] = metrics
        result.regime_compatibility[str(label)] = metrics["sharpe_ratio"]

    # Aggregate over all trades.
    result.aggregate = compute_trade_metrics(trades_out["return"].to_numpy())
    result.robustness_score = _robustness_score(result.aggregate, result.per_regime)
    return result
