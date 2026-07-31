"""Technical-indicator feature engineering.

TEMPORAL ISOLATION (the most important invariant in this batch):
every feature at timestamp T is computed using ONLY data from T and earlier. We use
exclusively *trailing* constructs — ``shift(1)`` for returns, trailing ``rolling``
windows, recursive ``ewm(adjust=False)``, and the ``ta`` library's trailing
indicators. There are NO centered windows and NO forward-fill from future bars.
Look-ahead bias silently invalidates every downstream regime label and backtest, so
this property is asserted by ``tests/test_lookahead.py`` (appending a future bar must
not change any feature value at an earlier bar).

Indicator math comes from the ``ta`` library — we do not hand-roll it.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD
from ta.volatility import AverageTrueRange, BollingerBands

# The real (typed) columns persisted in feature_matrix, in a stable order.
FEATURE_COLUMNS: list[str] = [
    "log_return",
    "sma_20",
    "sma_50",
    "ema_12",
    "ema_26",
    "rsi_14",
    "macd",
    "macd_signal",
    "atr_14",
    "bollinger_upper",
    "bollinger_lower",
    "realized_vol_20",
    "autocorr_5",
]

# Window parameters (documented in docs/schemas.md → feature_matrix).
_REALIZED_VOL_WINDOW = 20
_AUTOCORR_WINDOW = 30
_AUTOCORR_LAG = 5


def compute_features(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """Compute the feature matrix for an OHLCV frame.

    Args:
        ohlcv: DataFrame with columns ``timestamp, open, high, low, close, volume``,
            sorted ascending by timestamp (the provider contract).

    Returns:
        DataFrame indexed by ``timestamp`` with the columns in ``FEATURE_COLUMNS``.
        Warm-up rows (insufficient history) are ``NaN`` — never back-filled.
    """
    df = ohlcv.sort_values("timestamp").reset_index(drop=True)
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)

    out = pd.DataFrame(index=pd.Index(df["timestamp"], name="timestamp"))

    # Returns — strictly trailing (uses the prior bar only).
    log_return = np.log(close / close.shift(1))
    out["log_return"] = log_return.to_numpy()

    # Moving averages — trailing rolling / recursive EWM.
    out["sma_20"] = close.rolling(window=20).mean().to_numpy()
    out["sma_50"] = close.rolling(window=50).mean().to_numpy()
    out["ema_12"] = close.ewm(span=12, adjust=False).mean().to_numpy()
    out["ema_26"] = close.ewm(span=26, adjust=False).mean().to_numpy()

    # RSI / MACD / ATR / Bollinger — ta library (all trailing).
    out["rsi_14"] = RSIIndicator(close=close, window=14, fillna=False).rsi().to_numpy()
    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9, fillna=False)
    out["macd"] = macd.macd().to_numpy()
    out["macd_signal"] = macd.macd_signal().to_numpy()
    out["atr_14"] = (
        AverageTrueRange(high=high, low=low, close=close, window=14, fillna=False)
        .average_true_range()
        .to_numpy()
    )
    bb = BollingerBands(close=close, window=20, window_dev=2, fillna=False)
    out["bollinger_upper"] = bb.bollinger_hband().to_numpy()
    out["bollinger_lower"] = bb.bollinger_lband().to_numpy()

    # Rolling realized volatility (std of trailing log returns).
    out["realized_vol_20"] = (
        log_return.rolling(window=_REALIZED_VOL_WINDOW).std().to_numpy()
    )

    # Rolling lag-5 autocorrelation of log returns over a trailing window.
    out["autocorr_5"] = (
        log_return.rolling(window=_AUTOCORR_WINDOW)
        .apply(lambda s: pd.Series(s).autocorr(lag=_AUTOCORR_LAG), raw=False)
        .to_numpy()
    )

    return out[FEATURE_COLUMNS]
