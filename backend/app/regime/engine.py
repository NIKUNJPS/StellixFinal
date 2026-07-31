"""Regime detection orchestration: run the four detectors, then ensemble.

``detect_regimes`` is a pure function over a feature frame — no DB, no I/O — so it is
directly unit-testable on synthetic data.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.core.config import settings
from app.regime import detectors
from app.regime.ensemble import ensemble_vote

MODEL_NAMES = ["hmm", "pelt", "gmm", "garch"]


class InsufficientDataError(ValueError):
    """Raised when there are too few clean periods to fit the ensemble."""


@dataclass
class RegimeResult:
    """Per-period regime labels + provenance.

    ``frame`` columns: regime_label, confidence, hmm, pelt, gmm, garch (indexed by
    timestamp). ``transition_probs`` is the HMM 4×4 matrix; ``hmm_state_labels`` maps
    raw HMM state index → taxonomy label.
    """

    frame: pd.DataFrame
    transition_probs: list[list[float]]
    hmm_state_labels: dict[int, str]


def detect_regimes(
    features: pd.DataFrame,
    *,
    min_periods: int | None = None,
    crisis_percentile: float | None = None,
    high_percentile: float | None = None,
    weight_window: int | None = None,
    pen_scale: float | None = None,
    random_state: int | None = None,
) -> RegimeResult:
    """Run HMM + PELT + GMM + GARCH and ensemble them into a single labeled timeline.

    Args:
        features: DataFrame with columns ``log_return`` and ``realized_vol`` indexed by
            timestamp (ascending). Warm-up/NaN rows are dropped.
    """
    min_periods = min_periods or settings.REGIME_MIN_PERIODS
    crisis_percentile = crisis_percentile or settings.REGIME_CRISIS_PERCENTILE
    high_percentile = high_percentile or settings.REGIME_HIGH_VOL_PERCENTILE
    weight_window = weight_window or settings.REGIME_WEIGHT_WINDOW
    pen_scale = pen_scale or settings.REGIME_PELT_PEN_SCALE
    random_state = settings.REGIME_RANDOM_STATE if random_state is None else random_state

    df = features.loc[:, ["log_return", "realized_vol"]].dropna().sort_index()
    if len(df) < min_periods:
        raise InsufficientDataError(
            f"Need >= {min_periods} clean periods, got {len(df)}"
        )

    hmm_labels, transition_probs, hmm_state_labels = detectors.run_hmm(
        df, random_state=random_state
    )
    pelt_labels = detectors.run_pelt(df, pen_scale=pen_scale)
    gmm_labels = detectors.run_gmm(df, random_state=random_state)
    garch_labels, crisis_mask, _cond_vol = detectors.run_garch(
        df, crisis_percentile=crisis_percentile, high_percentile=high_percentile
    )

    votes = pd.DataFrame(
        {
            "hmm": hmm_labels,
            "pelt": pelt_labels,
            "gmm": gmm_labels,
            "garch": garch_labels,
        }
    )
    final, confidence = ensemble_vote(votes, crisis_mask, weight_window=weight_window)

    frame = votes.copy()
    frame.insert(0, "regime_label", final)
    frame.insert(1, "confidence", confidence)
    return RegimeResult(
        frame=frame,
        transition_probs=transition_probs,
        hmm_state_labels=hmm_state_labels,
    )
