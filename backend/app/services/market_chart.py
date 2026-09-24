"""Enhanced candlestick charting — Batch 28 Task 4.

On-demand (not cached/broadcast like the other Batch 28 widgets): a chart request is
parameterized by symbol + interval + range, an unbounded combination unlike the fixed
screener universe or the fixed index list, so it fetches fresh on each request rather
than maintaining a background cache for every possible query.

Reuses the REAL feature-engineering computation (``app.features.engineering.
compute_features``) already used for strategy backtesting/validation — SMA/EMA/RSI/
MACD/Bollinger are computed exactly once, by exactly one function, never a second,
divergent way. VWAP is NOT part of that shared function (it isn't used by
backtesting), so it's computed here, additively, as a rolling N-bar volume-weighted
average price — explicitly labeled as such (not a true intraday session VWAP, which
requires intraday bars this chart does not offer).

Timeframes offered are limited to what the provider can honestly serve reliably:
Daily, Weekly, Monthly. yfinance's intraday intervals have short, source-imposed
lookback windows (Yahoo enforces this, not a Stellix limitation) that would make
"1 Hour" or finer look supported when it silently truncates history — so this batch
does not offer them. A future batch can add intraday once that limit is surfaced
honestly in the UI.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta

import pandas as pd

from app.core.config import settings
from app.features.engineering import compute_features
from app.providers import ProviderError, get_provider

# Only intervals the provider can honestly serve over a meaningful range. Intraday
# intervals are deliberately excluded — see module docstring.
SUPPORTED_INTERVALS: dict[str, str] = {"1d": "1d", "1wk": "1wk", "1mo": "1mo"}
_RANGE_DAYS: dict[str, int] = {"6mo": 182, "1y": 365, "2y": 730, "5y": 1825}
_VWAP_WINDOW = 20


class ChartRequestError(Exception):
    """Raised for an invalid symbol/interval/range combination."""


def _vwap(df: pd.DataFrame, window: int = _VWAP_WINDOW) -> pd.Series:
    """Rolling N-bar volume-weighted average price — an honest label for a daily-bar
    chart, distinct from a true intraday session VWAP this chart cannot compute."""
    typical_price = (df["high"] + df["low"] + df["close"]) / 3.0
    pv = typical_price * df["volume"]
    return pv.rolling(window=window).sum() / df["volume"].rolling(window=window).sum()


async def get_chart(symbol: str, interval: str, range_key: str) -> dict:
    if interval not in SUPPORTED_INTERVALS:
        raise ChartRequestError(
            f"interval must be one of {sorted(SUPPORTED_INTERVALS)} (intraday isn't offered — see chart docs)"
        )
    if range_key not in _RANGE_DAYS:
        raise ChartRequestError(f"range must be one of {sorted(_RANGE_DAYS)}")

    end = date.today() + timedelta(days=1)  # yfinance's `end` is exclusive
    start = end - timedelta(days=_RANGE_DAYS[range_key])

    provider = get_provider(settings.MARKET_QUOTES_PROVIDER)
    try:
        ohlcv = await asyncio.to_thread(provider.fetch_ohlcv, symbol, start, end, SUPPORTED_INTERVALS[interval])
    except ProviderError as exc:
        raise ChartRequestError(str(exc)) from exc

    indicators = compute_features(ohlcv)
    vwap = _vwap(ohlcv.set_index("timestamp"))

    candles = [
        {
            "timestamp": row.timestamp.isoformat(),
            "open": round(float(row.open), 4),
            "high": round(float(row.high), 4),
            "low": round(float(row.low), 4),
            "close": round(float(row.close), 4),
            "volume": float(row.volume),
        }
        for row in ohlcv.itertuples()
    ]

    def _series(col: pd.Series) -> list[dict]:
        return [
            {"timestamp": ts.isoformat(), "value": round(float(v), 4)}
            for ts, v in col.items()
            if pd.notna(v)
        ]

    return {
        "symbol": symbol,
        "interval": interval,
        "range": range_key,
        "provider": provider.name,
        "data_delay_note": "Delayed OHLCV, refreshed on request — not real-time.",
        "candles": candles,
        "indicators": {
            "sma_20": _series(indicators["sma_20"]),
            "sma_50": _series(indicators["sma_50"]),
            "ema_12": _series(indicators["ema_12"]),
            "ema_26": _series(indicators["ema_26"]),
            "rsi_14": _series(indicators["rsi_14"]),
            "macd": _series(indicators["macd"]),
            "macd_signal": _series(indicators["macd_signal"]),
            "bollinger_upper": _series(indicators["bollinger_upper"]),
            "bollinger_lower": _series(indicators["bollinger_lower"]),
            "vwap_20": _series(vwap),
        },
    }
