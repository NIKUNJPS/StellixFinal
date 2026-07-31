"""The 6-label regime taxonomy (SRC report §5.1) and state→label mapping.

Taxonomy: Bull | Bear | High-Volatility | Low-Volatility | Sideways | Crisis.

The mapping from a model's raw state/component index to a taxonomy label is an
explicit, documented design decision — NOT a placeholder. It is driven by each
state's characteristic **mean return** and **mean volatility**:

- For discrete-state models (HMM, GMM) we have a fixed set of states. The highest-vol
  state → High-Volatility, the lowest-vol state → Low-Volatility, and the remaining
  states are Bull / Bear / Sideways by the sign/magnitude of their mean return. This
  is permutation-invariant: relabeling raw state indices never changes the taxonomy
  outcome, so results are stable across fits.
- For segment/threshold models (PELT) we classify each segment against *global*
  volatility/return thresholds via ``classify_by_stats``.
"""

from __future__ import annotations

import enum

import numpy as np


class RegimeLabel(str, enum.Enum):
    BULL = "Bull"
    BEAR = "Bear"
    HIGH_VOLATILITY = "High-Volatility"
    LOW_VOLATILITY = "Low-Volatility"
    SIDEWAYS = "Sideways"
    CRISIS = "Crisis"


# Deterministic tie-break priority when votes are tied (crisis handled separately).
VOTE_PRIORITY: list[RegimeLabel] = [
    RegimeLabel.CRISIS,
    RegimeLabel.HIGH_VOLATILITY,
    RegimeLabel.BEAR,
    RegimeLabel.BULL,
    RegimeLabel.SIDEWAYS,
    RegimeLabel.LOW_VOLATILITY,
]


def classify_by_stats(
    mean_return: float,
    mean_vol: float,
    *,
    vol_high: float,
    vol_low: float,
    return_eps: float,
) -> RegimeLabel:
    """Classify a single (mean_return, mean_vol) point against vol/return thresholds."""
    if mean_vol >= vol_high:
        return RegimeLabel.HIGH_VOLATILITY
    if mean_vol <= vol_low:
        return RegimeLabel.LOW_VOLATILITY
    if mean_return > return_eps:
        return RegimeLabel.BULL
    if mean_return < -return_eps:
        return RegimeLabel.BEAR
    return RegimeLabel.SIDEWAYS


def map_states_to_taxonomy(
    state_stats: dict[int, tuple[float, float]],
) -> dict[int, RegimeLabel]:
    """Map discrete model states (HMM/GMM) to taxonomy labels by their characteristics.

    Args:
        state_stats: {state_index: (mean_return, mean_volatility)}.

    Returns:
        {state_index: RegimeLabel}. Highest-vol state → High-Volatility, lowest-vol →
        Low-Volatility, remaining by mean-return sign → Bull/Bear/Sideways.
    """
    if not state_stats:
        return {}

    vols = {s: v for s, (_r, v) in state_stats.items()}
    hi_state = max(vols, key=lambda s: vols[s])
    lo_state = min(vols, key=lambda s: vols[s])

    returns = np.array([r for (r, _v) in state_stats.values()])
    # Sideways band: a state's mean return must clearly differ from zero (relative to
    # the spread across states) to be called Bull/Bear.
    return_eps = max(1e-4, 0.2 * float(np.std(returns)))

    mapping: dict[int, RegimeLabel] = {}
    for state, (mean_ret, _mean_vol) in state_stats.items():
        if state == hi_state:
            mapping[state] = RegimeLabel.HIGH_VOLATILITY
        elif state == lo_state:
            mapping[state] = RegimeLabel.LOW_VOLATILITY
        elif mean_ret > return_eps:
            mapping[state] = RegimeLabel.BULL
        elif mean_ret < -return_eps:
            mapping[state] = RegimeLabel.BEAR
        else:
            mapping[state] = RegimeLabel.SIDEWAYS
    return mapping
