"""Failure detection orchestration: run backtest → evaluate triggers → build context."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from app.failure.triggers import (
    check_drawdown_breach,
    check_regime_mismatch,
    check_sharpe_decline,
)
from app.models.failure import FailureTrigger

# Indicators captured in the market-context snapshot at failure time.
_CONTEXT_KEYS = ["realized_vol_20", "rsi_14", "atr_14", "macd", "sma_50", "close"]


@dataclass
class FailureAssessment:
    trigger: FailureTrigger
    performance_metrics: dict = field(default_factory=dict)
    regime_at_failure: str = ""
    market_context: dict = field(default_factory=dict)
    feature_attribution: list | None = None
    failure_timestamp: pd.Timestamp | None = None


def _f(value) -> float | None:
    if value is None:
        return None
    v = float(value)
    return None if math.isnan(v) else v


def _detect_trigger(
    strategy: dict,
    regime_compatibility: dict | None,
    full_backtest,
    recent_sharpe: float | None,
    current_regime: str | None,
) -> FailureTrigger | None:
    agg = full_backtest.aggregate
    max_dd = agg.get("max_drawdown")
    max_dd_pct = (strategy.get("risk_constraints") or {}).get("max_drawdown_pct")

    if check_drawdown_breach(max_dd, max_dd_pct):
        return FailureTrigger.DRAWDOWN_BREACH
    if check_sharpe_decline(recent_sharpe):
        return FailureTrigger.SHARPE_DECLINE
    if check_regime_mismatch(current_regime, regime_compatibility):
        return FailureTrigger.REGIME_MISMATCH
    return None


def assess(
    strategy: dict,
    regime_compatibility: dict | None,
    feature_df: pd.DataFrame,
    regime_df: pd.DataFrame,
    *,
    recent_bars: int = 30,
    force_trigger: FailureTrigger | None = None,
) -> FailureAssessment | None:
    """Assess a strategy for failure. Returns an assessment when a trigger fires (or
    when ``force_trigger`` is given, for a manual flag), else ``None``."""
    from app.failure.shap_attribution import compute_feature_attribution
    from app.strategy.backtest import run_regime_aware_backtest

    full = run_regime_aware_backtest(strategy, feature_df, regime_df)

    recent = feature_df.iloc[-recent_bars:]
    recent_regime = regime_df[regime_df["timestamp"] >= recent.index.min()]
    recent_sharpe = run_regime_aware_backtest(strategy, recent, recent_regime).aggregate.get("sharpe_ratio")

    current_regime = str(regime_df["regime_label"].iloc[-1]) if len(regime_df) else None

    trigger = force_trigger or _detect_trigger(
        strategy, regime_compatibility, full, recent_sharpe, current_regime
    )
    if trigger is None:
        return None

    last = feature_df.iloc[-1]
    market_context = {k: _f(last.get(k)) for k in _CONTEXT_KEYS}
    market_context["volatility_level"] = _f(last.get("realized_vol_20"))

    return FailureAssessment(
        trigger=trigger,
        performance_metrics={
            "sharpe": full.aggregate.get("sharpe_ratio"),
            "max_drawdown": full.aggregate.get("max_drawdown"),
            "win_rate": full.aggregate.get("win_rate"),
            "recent_sharpe": recent_sharpe,
        },
        regime_at_failure=current_regime or "Unknown",
        market_context=market_context,
        feature_attribution=compute_feature_attribution(full.trades, feature_df),
        failure_timestamp=feature_df.index[-1],
    )
