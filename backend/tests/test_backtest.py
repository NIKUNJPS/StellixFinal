"""Regime-aware backtest tests: determinism + regime-partition Sharpe spot-check."""

from __future__ import annotations

import numpy as np
import pandas as pd
from app.strategy.backtest import (
    TRADING_DAYS_PER_YEAR,
    compute_bar_level_metrics,
    compute_beta,
    compute_trade_metrics,
    run_regime_aware_backtest,
)

_STRATEGY = {
    "entry_rules": {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_20"},
    "exit_rules": {"indicator": "close", "comparator": "crosses_below", "value_ref": "sma_20"},
    "risk_constraints": {"stop_loss_pct": 50, "max_position_size_pct": 100},
}


def _make_data():
    idx = pd.date_range("2022-01-01", periods=200, freq="D", tz="UTC")
    t = np.arange(200)
    close = 100 + 10 * np.sin(t / 6.0)  # deterministic oscillation → many SMA crossings
    df = pd.DataFrame({"close": close}, index=idx)
    df["sma_20"] = df["close"].rolling(20).mean()
    regime_df = pd.DataFrame(
        {"timestamp": idx, "regime_label": ["Bull"] * 100 + ["Bear"] * 100}
    )
    return df, regime_df


def test_backtest_produces_trades_and_partitions_by_regime():
    df, regime_df = _make_data()
    result = run_regime_aware_backtest(_STRATEGY, df, regime_df)
    assert result.aggregate["trade_count"] > 2
    # Trades were partitioned across both engineered regimes.
    assert set(result.per_regime.keys()).issubset({"Bull", "Bear"})
    assert result.trades["regime"].notna().any()


def test_backtest_is_deterministic():
    df, regime_df = _make_data()
    r1 = run_regime_aware_backtest(_STRATEGY, df, regime_df)
    r2 = run_regime_aware_backtest(_STRATEGY, df, regime_df)
    assert r1.aggregate == r2.aggregate
    assert r1.per_regime == r2.per_regime
    assert r1.robustness_score == r2.robustness_score


def test_sortino_uses_downside_deviation_only():
    # 3 winners (no penalty) + 2 losers (only these feed the denominator).
    returns = np.array([0.05, 0.05, 0.05, -0.02, -0.04])
    metrics = compute_trade_metrics(returns)

    downside = returns[returns < 0]
    expected_sortino = returns.mean() / downside.std(ddof=1)
    assert abs(metrics["sortino_ratio"] - expected_sortino) < 1e-9
    # Sortino must differ from Sharpe here (upside variance in the winners
    # would otherwise be counted against a downside-only measure).
    assert metrics["sortino_ratio"] != metrics["sharpe_ratio"]


def test_sortino_is_none_with_fewer_than_2_losing_trades():
    assert compute_trade_metrics(np.array([0.05, 0.03, -0.01]))["sortino_ratio"] is None
    assert compute_trade_metrics(np.array([0.05, 0.03, 0.02]))["sortino_ratio"] is None


def test_beta_matches_manual_covariance_calc():
    idx = pd.date_range("2024-01-01", periods=6, freq="D", tz="UTC")
    portfolio_returns = pd.Series([0.01, -0.02, 0.03, 0.0, 0.02, -0.01], index=idx)
    benchmark_close = pd.Series([100, 102, 99, 103, 103, 106, 104], index=pd.date_range("2023-12-31", periods=7, freq="D", tz="UTC"))

    beta = compute_beta(portfolio_returns, benchmark_close)

    benchmark_returns = benchmark_close.pct_change().dropna()
    aligned = pd.concat([portfolio_returns.rename("s"), benchmark_returns.rename("b")], axis=1, join="inner").dropna()
    expected = aligned["s"].cov(aligned["b"]) / aligned["b"].var(ddof=1)
    assert abs(beta - expected) < 1e-9


def test_beta_is_none_without_benchmark_data():
    idx = pd.date_range("2024-01-01", periods=3, freq="D", tz="UTC")
    portfolio_returns = pd.Series([0.01, -0.02, 0.03], index=idx)
    assert compute_beta(portfolio_returns, None) is None
    assert compute_beta(portfolio_returns, pd.Series(dtype=float)) is None


def test_backtest_result_has_beta_only_at_aggregate_not_per_regime():
    df, regime_df = _make_data()
    benchmark_close = df["close"] * 0.5 + 10  # a plausible, distinct benchmark series
    result = run_regime_aware_backtest(_STRATEGY, df, regime_df, benchmark_close=benchmark_close)
    assert result.beta_vs_benchmark is not None
    # BacktestResult itself is aggregate-only for beta — per_regime dicts never carry it.
    for metrics in result.per_regime.values():
        assert "beta_vs_benchmark" not in metrics


def test_bar_level_metrics_match_manual_annualization():
    # A constant 0.1%/day return for 252 bars (exactly 1 year): total_return =
    # 1.001^252 - 1, and since n == TRADING_DAYS_PER_YEAR, annualized_return
    # must equal total_return exactly (years == 1, so the ^(1/years) is a no-op).
    returns = pd.Series([0.001] * TRADING_DAYS_PER_YEAR)
    metrics = compute_bar_level_metrics(returns)

    expected_total_return = 1.001**TRADING_DAYS_PER_YEAR - 1.0
    assert abs(metrics["annualized_return"] - expected_total_return) < 1e-9
    # Zero variance (every return identical) -> zero volatility.
    assert abs(metrics["volatility"]) < 1e-12


def test_bar_level_metrics_is_none_with_fewer_than_2_bars():
    assert compute_bar_level_metrics(pd.Series([0.01]))["annualized_return"] is None
    assert compute_bar_level_metrics(pd.Series([], dtype=float))["volatility"] is None


def test_backtest_result_has_bar_level_chart_series():
    df, regime_df = _make_data()
    benchmark_close = df["close"] * 0.5 + 10
    result = run_regime_aware_backtest(_STRATEGY, df, regime_df, benchmark_close=benchmark_close)

    assert len(result.equity_curve) == len(df)
    assert len(result.drawdown_series) == len(df)
    assert len(result.rolling_sharpe) == len(df)
    # Warm-up window (< ROLLING_SHARPE_WINDOW bars) must be NaN, not a fabricated value.
    assert result.rolling_sharpe.iloc[:5].isna().all()
    assert result.annualized_return is not None
    assert result.volatility is not None and result.volatility >= 0


def test_bar_level_series_present_even_with_zero_trades():
    df, regime_df = _make_data()
    # close crossing above itself can never fire -> guaranteed zero trades.
    never_fires = {
        "entry_rules": {"indicator": "close", "comparator": "crosses_above", "value_ref": "close"},
        "exit_rules": {"indicator": "close", "comparator": "crosses_below", "value_ref": "close"},
        "risk_constraints": {},
    }
    result = run_regime_aware_backtest(never_fires, df, regime_df)

    assert result.aggregate["trade_count"] == 0
    # Even with no trades, the equity curve is well-defined (flat at init_cash).
    assert len(result.equity_curve) == len(df)
    assert (result.equity_curve == result.equity_curve.iloc[0]).all()


def test_regime_partition_sharpe_matches_manual():
    df, regime_df = _make_data()
    result = run_regime_aware_backtest(_STRATEGY, df, regime_df)

    checked = 0
    for label, metrics in result.per_regime.items():
        regime_returns = result.trades[result.trades["regime"] == label]["return"].to_numpy()
        if len(regime_returns) >= 2 and metrics["sharpe_ratio"] is not None:
            manual_sharpe = float(regime_returns.mean() / regime_returns.std(ddof=1))
            assert abs(manual_sharpe - metrics["sharpe_ratio"]) < 1e-9, label
            # win_rate cross-check too
            manual_win = float(np.mean(regime_returns > 0))
            assert abs(manual_win - metrics["win_rate"]) < 1e-9, label
            checked += 1
    assert checked >= 1, "expected at least one regime with >=2 trades to spot-check"
