"""Feature-correctness spot checks against independent manual calculations."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from app.features.engineering import compute_features

from tests.data_helpers import make_synthetic_ohlcv


def test_sma20_matches_manual_mean():
    df = make_synthetic_ohlcv(n=60)
    feats = compute_features(df)
    t = df["timestamp"].iloc[-1]
    expected = df["close"].iloc[-20:].mean()
    assert math.isclose(feats.loc[t, "sma_20"], expected, rel_tol=1e-9)


def test_log_return_matches_manual():
    df = make_synthetic_ohlcv(n=30)
    feats = compute_features(df)
    closes = df["close"].to_numpy()
    expected = math.log(closes[-1] / closes[-2])
    t = df["timestamp"].iloc[-1]
    assert math.isclose(feats.loc[t, "log_return"], expected, rel_tol=1e-9)


def test_realized_vol_matches_manual_std():
    df = make_synthetic_ohlcv(n=60)
    feats = compute_features(df)
    log_ret = np.log(df["close"] / df["close"].shift(1))
    expected = log_ret.iloc[-20:].std()  # pandas sample std (ddof=1)
    t = df["timestamp"].iloc[-1]
    assert math.isclose(feats.loc[t, "realized_vol_20"], expected, rel_tol=1e-9)


def test_macd_equals_ema12_minus_ema26():
    df = make_synthetic_ohlcv(n=80)
    feats = compute_features(df)
    t = df["timestamp"].iloc[-1]
    assert math.isclose(
        feats.loc[t, "macd"],
        feats.loc[t, "ema_12"] - feats.loc[t, "ema_26"],
        rel_tol=1e-9,
    )


def test_rsi_within_bounds():
    df = make_synthetic_ohlcv(n=80)
    feats = compute_features(df)
    rsi = feats["rsi_14"].dropna()
    assert ((rsi >= 0) & (rsi <= 100)).all()


def test_warmup_rows_are_nan_not_backfilled():
    df = make_synthetic_ohlcv(n=60)
    feats = compute_features(df)
    # sma_50 needs 50 bars; the first row must be NaN (never back-filled from future).
    first_t = df["timestamp"].iloc[0]
    assert pd.isna(feats.loc[first_t, "sma_50"])
