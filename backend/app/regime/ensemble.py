"""Ensemble voting layer.

Combines the four detectors' per-period labels into one final label + confidence:

1. **Crisis override** (fast, conservative): if GARCH flags Crisis for a period, the
   final label is Crisis regardless of the other models — a late crisis flag is far
   costlier than a false positive.

2. **Self-consistency weighted majority**: with no ground truth, each model is weighted
   by its *trailing agreement with the ensemble's own prior decisions* over the last N
   periods ("ensemble self-consistency weighting" — a legitimate real-world technique).
   We first form a provisional unweighted majority, then weight each model by how often
   it matched that provisional label in the trailing window, then take the weighted
   majority.

3. **Confidence** = fraction of the 4 models whose vote equals the final label (0.0–1.0).
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
import pandas as pd

from app.regime.taxonomy import VOTE_PRIORITY, RegimeLabel

_PRIORITY_INDEX = {label.value: i for i, label in enumerate(VOTE_PRIORITY)}


def _weighted_winner(labels: list[str], weights: list[float]) -> str:
    """Weighted majority with a deterministic priority tie-break."""
    tally: dict[str, float] = defaultdict(float)
    for label, weight in zip(labels, weights, strict=False):
        tally[label] += weight
    if not tally or max(tally.values()) <= 0:
        # Degenerate (all-zero weights): fall back to unweighted counts.
        tally = defaultdict(float)
        for label in labels:
            tally[label] += 1.0
    best = max(tally.values())
    winners = [lbl for lbl, w in tally.items() if w == best]
    return min(winners, key=lambda lbl: _PRIORITY_INDEX.get(lbl, len(_PRIORITY_INDEX)))


def ensemble_vote(
    votes: pd.DataFrame,
    crisis_mask: pd.Series | np.ndarray,
    *,
    weight_window: int = 50,
) -> tuple[pd.Series, pd.Series]:
    """Return (final_label, confidence) Series aligned to ``votes.index``.

    Args:
        votes: columns are model names (e.g. hmm/pelt/gmm/garch), values are label
            strings, one row per period.
        crisis_mask: bool per period (True → GARCH crisis override).
        weight_window: N periods of trailing history for self-consistency weights.
    """
    models = list(votes.columns)
    n = len(votes)
    crisis = np.asarray(crisis_mask, dtype=bool)
    vote_arrays = {m: votes[m].to_numpy() for m in models}

    # Pass 1: provisional unweighted majority (with crisis override).
    provisional: list[str] = []
    for i in range(n):
        if crisis[i]:
            provisional.append(RegimeLabel.CRISIS.value)
        else:
            row = [vote_arrays[m][i] for m in models]
            provisional.append(_weighted_winner(row, [1.0] * len(models)))

    # Pass 2: weighted majority using trailing self-consistency weights.
    final: list[str] = []
    confidence: list[float] = []
    for i in range(n):
        if crisis[i]:
            label = RegimeLabel.CRISIS.value
        else:
            lo = max(0, i - weight_window)
            if i - lo == 0:
                weights = [1.0] * len(models)
            else:
                weights = [
                    float(
                        np.mean(
                            [vote_arrays[m][j] == provisional[j] for j in range(lo, i)]
                        )
                    )
                    for m in models
                ]
            row = [vote_arrays[m][i] for m in models]
            label = _weighted_winner(row, weights)
        final.append(label)
        agree = sum(vote_arrays[m][i] == label for m in models)
        confidence.append(agree / len(models))

    return (
        pd.Series(final, index=votes.index, name="regime_label"),
        pd.Series(confidence, index=votes.index, name="confidence"),
    )
