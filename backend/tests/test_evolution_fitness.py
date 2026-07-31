"""Test 3 (required order): hand-compute expected fitness for a strategy with known
per-regime Sharpes and robustness_score, assert it matches exactly."""

from __future__ import annotations

from app.evolution.fitness import compute_fitness


def test_fitness_matches_hand_computed_worked_example():
    # From the docstring in app/evolution/fitness.py.
    per_regime = {
        "Bull": {"sharpe_ratio": 1.2, "trade_count": 10},
        "Bear": {"sharpe_ratio": 0.4, "trade_count": 5},
    }
    robustness_score = 0.8

    weighted_avg_sharpe = (1.2 * 10 + 0.4 * 5) / (10 + 5)
    expected = weighted_avg_sharpe + 0.3 * robustness_score

    fitness = compute_fitness(per_regime, robustness_score)
    assert abs(fitness - expected) < 1e-9
    assert abs(fitness - 1.1733333333333333) < 1e-9


def test_fitness_weights_by_trade_count_not_flat_mean():
    # A flat (unweighted) mean of [1.2, 0.4] would be 0.8 — different from the
    # trade-count-weighted 0.9333..., proving the weighting actually matters.
    per_regime = {
        "Bull": {"sharpe_ratio": 1.2, "trade_count": 10},
        "Bear": {"sharpe_ratio": 0.4, "trade_count": 5},
    }
    fitness = compute_fitness(per_regime, robustness_score=0.0)
    flat_mean = (1.2 + 0.4) / 2
    assert abs(fitness - flat_mean) > 0.05
    assert abs(fitness - (14.0 / 15.0)) < 1e-9


def test_fitness_ignores_regimes_with_zero_trades_or_null_sharpe():
    per_regime = {
        "Bull": {"sharpe_ratio": 1.0, "trade_count": 10},
        "Sideways": {"sharpe_ratio": None, "trade_count": 0},
        "Crisis": {"sharpe_ratio": 2.0, "trade_count": 0},  # zero trades despite a Sharpe value
    }
    fitness = compute_fitness(per_regime, robustness_score=0.0)
    assert abs(fitness - 1.0) < 1e-9  # only Bull counts


def test_fitness_handles_no_regime_data_gracefully():
    fitness = compute_fitness({}, robustness_score=0.5)
    assert fitness == 0.3 * 0.5


def test_fitness_handles_none_robustness_score():
    per_regime = {"Bull": {"sharpe_ratio": 1.0, "trade_count": 10}}
    fitness = compute_fitness(per_regime, robustness_score=None)
    assert fitness == 1.0
