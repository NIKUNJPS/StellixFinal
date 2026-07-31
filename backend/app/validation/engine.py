"""Validation orchestration: run the 5 methods → composite → classification."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from app.validation import methods
from app.validation.composite import (
    WEIGHTS,
    ValidationClassification,
    classify,
    compute_composite,
)


@dataclass
class ValidationReport:
    sub_scores: dict[str, float | None] = field(default_factory=dict)
    passes: dict[str, bool | None] = field(default_factory=dict)
    composite_score: float = 0.0
    classification: ValidationClassification = ValidationClassification.AUTO_FAIL
    method_details: dict = field(default_factory=dict)


def run_validation(
    strategy: dict,
    feature_df: pd.DataFrame,
    regime_df: pd.DataFrame,
    full_backtest,
    *,
    risk_tolerance: float,
    n_folds: int = 5,
    n_sims: int = 1000,
    seed: int = 42,
    alpha: float = 0.05,
) -> ValidationReport:
    """Run all five methods and combine. ``risk_tolerance`` is a max-drawdown fraction
    (e.g. 0.30). ``full_backtest`` is the whole-period BacktestResult (Batch 4)."""
    wf_sub, wf_pass, wf_det = methods.walk_forward(strategy, feature_df, regime_df, n_folds=n_folds)
    cv_sub, cv_pass, cv_det = methods.regime_cv(full_backtest.per_regime)
    mc_sub, mc_pass, mc_det = methods.monte_carlo(
        full_backtest.trades, tolerance=risk_tolerance, n_sims=n_sims, seed=seed
    )
    pe_sub, pe_pass, pe_det = methods.persistence(
        full_backtest.trades, feature_df, regime_df, seed=seed, alpha=alpha
    )
    st_sub, st_pass, st_det = methods.stress_test(
        strategy, feature_df, regime_df, tolerance=risk_tolerance
    )

    sub_scores: dict[str, float | None] = {
        "walk_forward": wf_sub,
        "regime_cv": cv_sub,
        "monte_carlo": mc_sub,
        "persistence": pe_sub,
        "stress_test": st_sub,  # may be None (N/A)
    }
    passes: dict[str, bool | None] = {
        "walk_forward": wf_pass,
        "regime_cv": cv_pass,
        "monte_carlo": mc_pass,
        "persistence": pe_pass,
        "stress_test": st_pass,
    }
    composite = compute_composite(sub_scores)
    classification = classify(composite)

    # Effective weights (renormalized if stress test is N/A) for UI transparency.
    active = {k: v for k, v in sub_scores.items() if v is not None}
    total_w = sum(WEIGHTS[k] for k in active)
    effective_weights = {k: round(WEIGHTS[k] / total_w, 4) for k in active}

    method_details = {
        "walk_forward": wf_det,
        "regime_cv": cv_det,
        "monte_carlo": mc_det,
        "persistence": pe_det,
        "stress_test": st_det,
        "sub_scores": sub_scores,
        "passes": passes,
        "weights": WEIGHTS,
        "effective_weights": effective_weights,
        "stress_test_applicable": st_sub is not None,
    }
    return ValidationReport(
        sub_scores=sub_scores,
        passes=passes,
        composite_score=composite,
        classification=classification,
        method_details=method_details,
    )
