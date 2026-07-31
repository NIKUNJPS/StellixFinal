"""The Batch 8 fitness function — regime-weighted Sharpe + robustness composite.

    fitness = weighted_avg_sharpe + 0.3 * robustness_score

    weighted_avg_sharpe = sum(sharpe_r * trade_count_r) / sum(trade_count_r)
                          over every regime r with trade_count_r > 0

This is a genuine *weighted* average (not a flat mean across regime labels): a
regime a strategy only traded twice contributes far less certainty than one it
traded 200 times, so it's weighted by trade count — the amount of evidence behind
that regime's Sharpe estimate. ``per_regime`` is exactly the dict
``BacktestResult.per_regime`` already produces (Batch 4) — no extra computation, no
hand-rolled statistics beyond the weighted-average arithmetic itself.

``robustness_score`` is Batch 4's own single-backtest composite
(``BacktestResult.robustness_score``, 60% aggregate-Sharpe + 40% regime-consistency)
— NOT the expensive Batch 5 5-method validation suite. Running the full suite for
every individual in every generation would be prohibitively slow; that suite only
runs once, on final surviving candidates (see app/services/evolution.py).

Worked example (used verbatim in tests/test_evolution_fitness.py):
    per_regime = {
        "Bull": {"sharpe_ratio": 1.2, "trade_count": 10},
        "Bear": {"sharpe_ratio": 0.4, "trade_count": 5},
    }
    robustness_score = 0.8
    weighted_avg_sharpe = (1.2*10 + 0.4*5) / (10+5) = 14.0 / 15 = 0.93333...
    fitness = 0.93333... + 0.3*0.8 = 0.93333... + 0.24 = 1.17333...
"""

from __future__ import annotations

from typing import Any


def compute_fitness(per_regime: dict[str, dict[str, Any]], robustness_score: float | None) -> float:
    weighted_sum = 0.0
    total_trades = 0
    for metrics in per_regime.values():
        trade_count = metrics.get("trade_count") or 0
        sharpe = metrics.get("sharpe_ratio")
        if trade_count <= 0 or sharpe is None:
            continue
        weighted_sum += sharpe * trade_count
        total_trades += trade_count

    weighted_avg_sharpe = (weighted_sum / total_trades) if total_trades > 0 else 0.0
    return weighted_avg_sharpe + 0.3 * (robustness_score or 0.0)
