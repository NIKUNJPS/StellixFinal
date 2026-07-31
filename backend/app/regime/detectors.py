"""The four independent regime detectors. Established libraries only — no hand-rolled math.

Each returns a per-period taxonomy label Series aligned to the input index:
- HMM   : hmmlearn GaussianHMM (4 states) on [log_return, realized_vol].
- PELT  : ruptures PELT change-points on the volatility series → per-segment labels.
- GMM   : sklearn GaussianMixture (4 components) on [log_return, realized_vol].
- GARCH : arch GARCH(1,1) conditional volatility → vol regime + Crisis flag, classified
          relative to the conditional-vol distribution (not a flat price threshold).
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import ruptures as rpt
from arch import arch_model
from hmmlearn.hmm import GaussianHMM
from sklearn.mixture import GaussianMixture

from app.regime.taxonomy import RegimeLabel, classify_by_stats, map_states_to_taxonomy

_OBS_COLUMNS = ["log_return", "realized_vol"]


def _standardize(matrix: np.ndarray) -> np.ndarray:
    """Column z-score; zero-variance columns become zeros (avoids divide-by-zero)."""
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0)
    std_safe = np.where(std > 0, std, 1.0)
    return (matrix - mean) / std_safe


def _state_stats(df: pd.DataFrame, states: np.ndarray) -> dict[int, tuple[float, float]]:
    """Per-state (mean_return, mean_vol) from the ORIGINAL (unscaled) observations."""
    stats: dict[int, tuple[float, float]] = {}
    for state in np.unique(states):
        mask = states == state
        stats[int(state)] = (
            float(df["log_return"].to_numpy()[mask].mean()),
            float(df["realized_vol"].to_numpy()[mask].mean()),
        )
    return stats


# --------------------------------------------------------------------------- #
def run_hmm(df: pd.DataFrame, *, random_state: int = 42) -> tuple[pd.Series, list, dict]:
    """GaussianHMM (4 states). Returns (labels, transition_matrix, state→label map)."""
    obs = df[_OBS_COLUMNS].to_numpy(dtype=float)
    scaled = _standardize(obs)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = GaussianHMM(
            n_components=4, covariance_type="full", n_iter=200, random_state=random_state
        )
        model.fit(scaled)
        states = model.predict(scaled)

    mapping = map_states_to_taxonomy(_state_stats(df, states))
    labels = pd.Series([mapping[int(s)].value for s in states], index=df.index, name="hmm")
    transition = model.transmat_.tolist()
    state_label_map = {int(s): lbl.value for s, lbl in mapping.items()}
    return labels, transition, state_label_map


def run_gmm(df: pd.DataFrame, *, random_state: int = 42) -> pd.Series:
    """GaussianMixture (4 components) — an independent cross-check of the HMM."""
    obs = df[_OBS_COLUMNS].to_numpy(dtype=float)
    scaled = _standardize(obs)
    gmm = GaussianMixture(
        n_components=4, covariance_type="full", n_init=3, random_state=random_state
    )
    gmm.fit(scaled)
    components = gmm.predict(scaled)

    mapping = map_states_to_taxonomy(_state_stats(df, components))
    return pd.Series(
        [mapping[int(c)].value for c in components], index=df.index, name="gmm"
    )


def run_pelt(df: pd.DataFrame, *, pen_scale: float = 3.0) -> pd.Series:
    """PELT change-point detection on volatility → per-segment taxonomy labels."""
    vol = df["realized_vol"].to_numpy(dtype=float)
    ret = df["log_return"].to_numpy(dtype=float)
    n = len(vol)

    signal = _standardize(vol.reshape(-1, 1))
    penalty = pen_scale * np.log(max(n, 2))
    algo = rpt.Pelt(model="l2", min_size=10, jump=1).fit(signal)
    breakpoints = algo.predict(pen=penalty)  # segment END indices, last == n

    vol_high = float(np.percentile(vol, 66))
    vol_low = float(np.percentile(vol, 33))
    return_eps = max(1e-4, 0.2 * float(np.std(ret)))

    labels = np.empty(n, dtype=object)
    start = 0
    for end in breakpoints:
        seg = slice(start, end)
        label = classify_by_stats(
            float(ret[seg].mean()),
            float(vol[seg].mean()),
            vol_high=vol_high,
            vol_low=vol_low,
            return_eps=return_eps,
        )
        labels[seg] = label.value
        start = end
    return pd.Series(labels, index=df.index, name="pelt")


def run_garch(
    df: pd.DataFrame, *, crisis_percentile: float = 95.0, high_percentile: float = 60.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """GARCH(1,1) conditional volatility → (labels, crisis_mask, conditional_vol).

    Vol regime is classified relative to the conditional-vol distribution itself:
    Crisis at/above ``crisis_percentile``, High-Volatility at/above ``high_percentile``,
    else Low-Volatility. Crisis is deliberately fast-triggering.
    """
    returns_pct = df["log_return"].to_numpy(dtype=float) * 100.0
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = arch_model(
                returns_pct, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False
            )
            res = model.fit(disp="off", show_warning=False)
        cond_vol = np.asarray(res.conditional_volatility, dtype=float)
    except Exception:  # noqa: BLE001 - fall back to realized vol if GARCH won't converge
        cond_vol = df["realized_vol"].to_numpy(dtype=float)

    crisis_thr = float(np.percentile(cond_vol, crisis_percentile))
    high_thr = float(np.percentile(cond_vol, high_percentile))

    labels = np.where(
        cond_vol >= crisis_thr,
        RegimeLabel.CRISIS.value,
        np.where(cond_vol >= high_thr, RegimeLabel.HIGH_VOLATILITY.value, RegimeLabel.LOW_VOLATILITY.value),
    )
    crisis_mask = cond_vol >= crisis_thr
    return (
        pd.Series(labels, index=df.index, name="garch"),
        pd.Series(crisis_mask, index=df.index, name="crisis"),
        pd.Series(cond_vol, index=df.index, name="cond_vol"),
    )
