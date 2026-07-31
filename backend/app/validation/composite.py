"""Composite robustness score + classification (SRC report §11.2).

Exact method weights:
    Walk-Forward 30% · Regime Cross-Validation 30% · Monte Carlo 20% ·
    Persistence 10% · Stress Test 10%

Each method contributes a 0–1 sub-score. If the Stress Test is Not Applicable (the
ingested data covers no known stress window), it is EXCLUDED and the remaining four
weights are renormalized proportionally (so they still sum to 1) — the strategy is not
penalized for data it cannot be blamed for lacking.

Classification thresholds (SRC report §11): the boundaries are
    composite < 0.50            → auto_fail
    0.50 <= composite <= 0.70   → candidate (needs enhanced review)
    composite > 0.70            → eligible_active (pending human approval, Batch 4 gate)
"""

from __future__ import annotations

import enum

# Method name → weight. Order is documentation-only.
WEIGHTS: dict[str, float] = {
    "walk_forward": 0.30,
    "regime_cv": 0.30,
    "monte_carlo": 0.20,
    "persistence": 0.10,
    "stress_test": 0.10,
}

FAIL_THRESHOLD = 0.50
ACTIVE_THRESHOLD = 0.70


class ValidationClassification(str, enum.Enum):
    AUTO_FAIL = "auto_fail"
    CANDIDATE = "candidate"
    ELIGIBLE_ACTIVE = "eligible_active"


def compute_composite(sub_scores: dict[str, float | None]) -> float:
    """Weighted average of the sub-scores, renormalizing over the present methods.

    A ``None`` sub-score (only the stress test may be N/A) is dropped and its weight is
    redistributed proportionally across the remaining methods.
    """
    active = {k: v for k, v in sub_scores.items() if v is not None}
    total_weight = sum(WEIGHTS[k] for k in active)
    if total_weight == 0:
        return 0.0
    weighted = sum(WEIGHTS[k] * float(active[k]) for k in active)
    return round(weighted / total_weight, 4)


def classify(composite: float) -> ValidationClassification:
    if composite < FAIL_THRESHOLD:
        return ValidationClassification.AUTO_FAIL
    if composite <= ACTIVE_THRESHOLD:
        return ValidationClassification.CANDIDATE
    return ValidationClassification.ELIGIBLE_ACTIVE
