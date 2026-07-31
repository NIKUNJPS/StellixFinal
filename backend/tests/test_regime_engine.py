"""Synthetic regime-change test: the ensemble must find the engineered breakpoint.

We build a series that is low-vol/flat for 200 days then high-vol/trending for 200
days, and assert (a) a regime transition occurs within ±10 days of day 200, and
(b) the dominant label before the break differs from the dominant label after it.
Exact-day matching is intentionally NOT required for this class of model.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from app.regime.engine import detect_regimes

BREAKPOINT = 200
TOLERANCE = 10


def _engineered_series() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    low = rng.normal(0.0002, 0.005, BREAKPOINT)     # calm
    high = rng.normal(0.0015, 0.030, BREAKPOINT)    # volatile, trending up
    ret = np.concatenate([low, high])
    idx = pd.date_range("2022-01-01", periods=len(ret), freq="D", tz="UTC")
    realized_vol = pd.Series(ret, index=idx).rolling(20).std()
    return pd.DataFrame(
        {"log_return": ret, "realized_vol": realized_vol.to_numpy()}, index=idx
    )


def test_ensemble_detects_engineered_regime_change():
    result = detect_regimes(_engineered_series())
    labels = result.frame["regime_label"].reset_index(drop=True)

    # (a) A transition near the engineered breakpoint (±10 days).
    changes = [i for i in range(1, len(labels)) if labels.iloc[i] != labels.iloc[i - 1]]
    near = [c for c in changes if abs(c - BREAKPOINT) <= TOLERANCE]
    assert near, f"no regime transition within ±{TOLERANCE} of day {BREAKPOINT}; changes={changes}"

    # (b) The dominant regime actually changed across the break.
    before = labels.iloc[: BREAKPOINT - 20].mode().iloc[0]
    after = labels.iloc[BREAKPOINT + 20 :].mode().iloc[0]
    assert before != after, f"dominant label unchanged: {before} -> {after}"


def test_engine_outputs_are_coherent():
    result = detect_regimes(_engineered_series())
    frame = result.frame
    # One coherent label + confidence per period; votes present for all 4 models.
    assert set(["regime_label", "confidence", "hmm", "pelt", "gmm", "garch"]).issubset(frame.columns)
    assert frame["confidence"].between(0.0, 1.0).all()
    assert len(result.transition_probs) == 4  # HMM 4×4
    assert all(len(row) == 4 for row in result.transition_probs)
