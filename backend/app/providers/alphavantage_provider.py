"""Alpha Vantage provider — free tier, user supplies their own key (ALPHA_VANTAGE_API_KEY).

A second concrete implementation proving the ``MarketDataProvider`` abstraction holds.
Implements daily and intraday series; raises ``ProviderError`` when no key is set.
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import requests

from app.providers.base import OHLCV_COLUMNS, MarketDataProvider, ProviderError

_INTRADAY = {"1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "60min", "60m": "60min"}


class AlphaVantageProvider(MarketDataProvider):
    name = "alphavantage"
    BASE_URL = "https://www.alphavantage.co/query"

    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key

    def fetch_ohlcv(
        self, symbol: str, start: date, end: date, interval: str
    ) -> pd.DataFrame:
        if not self.api_key:
            raise ProviderError(
                "ALPHA_VANTAGE_API_KEY is not set; cannot use the Alpha Vantage provider"
            )

        if interval in _INTRADAY:
            params = {
                "function": "TIME_SERIES_INTRADAY",
                "symbol": symbol,
                "interval": _INTRADAY[interval],
                "outputsize": "full",
                "apikey": self.api_key,
            }
            series_key = f"Time Series ({_INTRADAY[interval]})"
        elif interval == "1d":
            params = {
                "function": "TIME_SERIES_DAILY",
                "symbol": symbol,
                "outputsize": "full",
                "apikey": self.api_key,
            }
            series_key = "Time Series (Daily)"
        else:
            raise ProviderError(f"Alpha Vantage provider does not support interval {interval!r}")

        try:
            resp = requests.get(self.BASE_URL, params=params, timeout=30)
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"Alpha Vantage request failed for {symbol!r}: {exc}") from exc

        series = payload.get(series_key)
        if not series:
            # AV returns 'Note' (rate limit) or 'Error Message' (bad symbol/key).
            reason = payload.get("Note") or payload.get("Error Message") or "no series returned"
            raise ProviderError(f"Alpha Vantage error for {symbol!r}: {reason}")

        records = []
        for ts, row in series.items():
            records.append(
                {
                    "timestamp": ts,
                    "open": row["1. open"],
                    "high": row["2. high"],
                    "low": row["3. low"],
                    "close": row["4. close"],
                    "volume": row["5. volume"],
                }
            )
        frame = pd.DataFrame.from_records(records)
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)

        # Filter to the requested window [start, end).
        start_ts = pd.Timestamp(start, tz="UTC")
        end_ts = pd.Timestamp(end, tz="UTC")
        frame = frame[(frame["timestamp"] >= start_ts) & (frame["timestamp"] < end_ts)]
        if frame.empty:
            raise ProviderError(f"Alpha Vantage returned no rows for {symbol!r} in range")

        return self._normalize(frame.loc[:, OHLCV_COLUMNS])
