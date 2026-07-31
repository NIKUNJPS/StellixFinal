"""LOOK-AHEAD BIAS INVARIANT — the most important test in Batch 2.

Every feature at timestamp T must depend only on data at T and earlier. We prove this
by computing features on the full series and on the series with the final (future) bar
removed, then asserting that every feature value at the last COMMON timestamp is
identical. If any indicator peeked at the future bar, the value would differ.
"""

from __future__ import annotations

import math

import pandas as pd
from app.features.engineering import FEATURE_COLUMNS, compute_features

from tests.data_helpers import make_synthetic_ohlcv


def test_no_lookahead_appending_future_bar_does_not_change_past_features():
    df = make_synthetic_ohlcv(n=120)

    full = compute_features(df)            # includes the final (future) bar
    truncated = compute_features(df.iloc[:-1])  # that bar removed

    t = df["timestamp"].iloc[-2]  # last timestamp present in BOTH computations

    # Guard: the comparison must be meaningful — these are warmed up (non-NaN) at t.
    for warm in ("sma_50", "rsi_14", "macd", "atr_14", "realized_vol_20"):
        assert not pd.isna(full.loc[t, warm]), f"{warm} unexpectedly NaN at t"

    for col in FEATURE_COLUMNS:
        a = full.loc[t, col]
        b = truncated.loc[t, col]
        if pd.isna(a) and pd.isna(b):
            continue
        assert not (pd.isna(a) ^ pd.isna(b)), f"{col}: NaN mismatch ({a} vs {b})"
        assert math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12), (
            f"LOOK-AHEAD LEAK in {col}: value at T changed when a future bar was added "
            f"({a} -> {b})"
        )


def test_no_lookahead_holds_across_many_anchor_points():
    """Stronger: for several interior anchors, future bars never change the past."""
    df = make_synthetic_ohlcv(n=140)
    full = compute_features(df)

    for cut in (70, 90, 110, 130):
        partial = compute_features(df.iloc[:cut])
        t = df["timestamp"].iloc[cut - 1]
        for col in FEATURE_COLUMNS:
            a, b = full.loc[t, col], partial.loc[t, col]
            if pd.isna(a) and pd.isna(b):
                continue
            assert math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12), f"{col} leaked at cut={cut}"
