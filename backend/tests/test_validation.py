"""Validation engine tests: composite weighting, classification boundaries, and each
of the 5 methods on controlled data with known expected outcomes."""

from __future__ import annotations

import numpy as np
import pandas as pd
from app.validation import methods
from app.validation.composite import (
    ValidationClassification,
    classify,
    compute_composite,
)


# --------------------------------------------------------------------------- #
# Composite weighting (exact) + classification boundaries + stress N/A
# --------------------------------------------------------------------------- #
def test_composite_exact_weighting():
    sub = {
        "walk_forward": 1.0,
        "regime_cv": 0.5,
        "monte_carlo": 0.8,
        "persistence": 0.0,
        "stress_test": 1.0,
    }
    # 0.30*1 + 0.30*0.5 + 0.20*0.8 + 0.10*0 + 0.10*1 = 0.71
    assert compute_composite(sub) == 0.71


def test_composite_stress_na_renormalizes():
    all_one = {
        "walk_forward": 1.0, "regime_cv": 1.0, "monte_carlo": 1.0,
        "persistence": 1.0, "stress_test": None,
    }
    assert compute_composite(all_one) == 1.0  # renormalized 0.9 → 1.0

    only_wf = {
        "walk_forward": 1.0, "regime_cv": 0.0, "monte_carlo": 0.0,
        "persistence": 0.0, "stress_test": None,
    }
    # 0.30/0.90 = 0.3333 (weights renormalize over the 4 present methods)
    assert compute_composite(only_wf) == round(0.30 / 0.90, 4)


def test_classification_boundaries():
    assert classify(0.4999) == ValidationClassification.AUTO_FAIL
    assert classify(0.50) == ValidationClassification.CANDIDATE      # 0.50 inclusive
    assert classify(0.70) == ValidationClassification.CANDIDATE      # 0.70 inclusive
    assert classify(0.7001) == ValidationClassification.ELIGIBLE_ACTIVE
    assert classify(0.0) == ValidationClassification.AUTO_FAIL
    assert classify(1.0) == ValidationClassification.ELIGIBLE_ACTIVE


# --------------------------------------------------------------------------- #
# 2. Regime CV
# --------------------------------------------------------------------------- #
def test_regime_cv_two_positive_regimes_passes():
    per = {
        "Bull": {"trade_count": 5, "sharpe_ratio": 0.8},
        "Bear": {"trade_count": 3, "sharpe_ratio": -0.2},
        "High-Volatility": {"trade_count": 4, "sharpe_ratio": 0.3},
        "Low-Volatility": {"trade_count": 0, "sharpe_ratio": None},
    }
    sub, passed, _ = methods.regime_cv(per)
    assert passed is True
    assert sub == 0.5  # 2 of 4 primary regimes positive


def test_regime_cv_one_positive_regime_fails():
    per = {
        "Bull": {"trade_count": 5, "sharpe_ratio": 0.8},
        "Bear": {"trade_count": 3, "sharpe_ratio": -0.5},
        "High-Volatility": {"trade_count": 4, "sharpe_ratio": -0.1},
        "Low-Volatility": {"trade_count": 2, "sharpe_ratio": -0.3},
    }
    sub, passed, _ = methods.regime_cv(per)
    assert passed is False
    assert sub == 0.25


# --------------------------------------------------------------------------- #
# 3. Monte Carlo
# --------------------------------------------------------------------------- #
def test_monte_carlo_low_variance_passes():
    trades = pd.DataFrame({"return": [0.02] * 20, "regime": ["Bull"] * 20})
    sub, passed, det = methods.monte_carlo(trades, tolerance=0.30, n_sims=500, seed=1)
    assert passed is True
    assert sub == 1.0
    assert det["p95_drawdown"] == 0.0  # constant returns → no drawdown


def test_monte_carlo_deep_drawdown_fails():
    trades = pd.DataFrame({"return": [-0.05] * 30, "regime": ["Bull"] * 30})
    sub, passed, det = methods.monte_carlo(trades, tolerance=0.30, n_sims=500, seed=1)
    assert passed is False
    assert det["p95_drawdown"] > 0.30
    assert sub < 0.5


# --------------------------------------------------------------------------- #
# 4. Persistence
# --------------------------------------------------------------------------- #
def _flat_market(n=200, seed=3):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2021-01-01", periods=n, freq="D", tz="UTC")
    close = 100 + np.cumsum(rng.normal(0, 0.2, n))  # near-flat random walk
    df = pd.DataFrame({"close": close}, index=idx)
    regime_df = pd.DataFrame({"timestamp": idx, "regime_label": ["Bull"] * n})
    return df, regime_df


def test_persistence_strong_edge_is_significant():
    df, regime_df = _flat_market()
    trades = pd.DataFrame(
        {"return": [0.08] * 12, "regime": ["Bull"] * 12, "holding_bars": [5] * 12,
         "entry_pos": list(range(10, 130, 10))}
    )
    sub, passed, det = methods.persistence(trades, df, regime_df, seed=7)
    assert passed is True
    assert det["regimes"]["Bull"]["p_value"] < 0.05
    assert sub > 0.5


def test_persistence_random_entries_not_significant():
    df, regime_df = _flat_market()
    close = df["close"].to_numpy()
    rng = np.random.default_rng(11)
    positions = rng.integers(0, len(close) - 6, size=15)
    trades = pd.DataFrame(
        {
            "return": [close[p + 5] / close[p] - 1 for p in positions],  # genuine random entries
            "regime": ["Bull"] * 15,
            "holding_bars": [5] * 15,
            "entry_pos": positions.tolist(),
        }
    )
    sub, passed, _ = methods.persistence(trades, df, regime_df, seed=7)
    assert passed is False  # a random strategy has no significant edge


# --------------------------------------------------------------------------- #
# 5. Stress test (applicable + N/A renormalization)
# --------------------------------------------------------------------------- #
def _series(start, periods):
    idx = pd.date_range(start, periods=periods, freq="D", tz="UTC")
    t = np.arange(periods)
    close = 100 + 5 * np.sin(t / 6.0)
    df = pd.DataFrame({"close": close}, index=idx)
    df["sma_20"] = df["close"].rolling(20).mean()
    regime_df = pd.DataFrame({"timestamp": idx, "regime_label": ["Bull"] * periods})
    return df, regime_df


_STRAT = {
    "entry_rules": {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_20"},
    "exit_rules": {"indicator": "close", "comparator": "crosses_below", "value_ref": "sma_20"},
    "risk_constraints": {"stop_loss_pct": 50, "max_position_size_pct": 100},
}


def test_stress_test_not_applicable_when_no_window_covered():
    df, regime_df = _series("2017-01-01", 200)  # covers no known stress window
    sub, passed, det = methods.stress_test(_STRAT, df, regime_df, tolerance=0.30)
    assert sub is None and passed is None
    assert det["applicable"] is False


def test_stress_test_applicable_over_covid_window():
    df, regime_df = _series("2020-01-01", 160)  # spans 2020-02-15..2020-04-30
    sub, passed, det = methods.stress_test(_STRAT, df, regime_df, tolerance=0.30)
    assert det["applicable"] is True
    assert sub is not None and 0.0 <= sub <= 1.0
    assert any(w["name"] == "covid_2020" for w in det["windows"])


# --------------------------------------------------------------------------- #
# 1. Walk-forward (structure + determinism)
# --------------------------------------------------------------------------- #
def test_walk_forward_structure_and_determinism():
    idx = pd.date_range("2021-01-01", periods=250, freq="D", tz="UTC")
    t = np.arange(250)
    close = 100 + 0.3 * t + 8 * np.sin(t / 5.0)  # rising, oscillating
    df = pd.DataFrame({"close": close}, index=idx)
    df["sma_20"] = df["close"].rolling(20).mean()
    regime_df = pd.DataFrame({"timestamp": idx, "regime_label": ["Bull"] * 250})

    sub1, passed1, det1 = methods.walk_forward(_STRAT, df, regime_df, n_folds=5)
    sub2, _p2, _d2 = methods.walk_forward(_STRAT, df, regime_df, n_folds=5)

    assert det1["test_folds"] == 4  # folds 1..4
    assert len(det1["folds"]) == 4
    assert all("oos_sharpe" in f and "passed" in f for f in det1["folds"])
    assert 0.0 <= sub1 <= 1.0
    assert sub1 == sub2  # deterministic
