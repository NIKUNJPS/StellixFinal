"""yfinance-backed provider — free, no API key. Default for demo/dev.

Good for equities, indices, and crypto pairs (e.g. "AAPL", "^GSPC", "BTC-USD").
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import yfinance as yf

from app.providers.base import OHLCV_COLUMNS, MarketDataProvider, ProviderError


class YFinanceProvider(MarketDataProvider):
    name = "yfinance"

    def fetch_ohlcv(
        self, symbol: str, start: date, end: date, interval: str
    ) -> pd.DataFrame:
        ticker = yf.Ticker(symbol)
        try:
            hist = ticker.history(
                start=str(start),
                end=str(end),
                interval=interval,
                auto_adjust=False,  # keep raw OHLC so values match finance sites
            )
        except Exception as exc:  # noqa: BLE001 - normalize any client error
            raise ProviderError(f"yfinance fetch failed for {symbol!r}: {exc}") from exc

        if hist is None or hist.empty:
            raise ProviderError(f"yfinance returned no data for {symbol!r} in range")

        hist = hist.reset_index()
        # Daily data has a 'Date' column; intraday has 'Datetime'.
        ts_col = "Datetime" if "Datetime" in hist.columns else "Date"
        out = pd.DataFrame(
            {
                "timestamp": pd.to_datetime(hist[ts_col], utc=True),
                "open": hist["Open"],
                "high": hist["High"],
                "low": hist["Low"],
                "close": hist["Close"],
                "volume": hist["Volume"],
            }
        )
        return self._normalize(out.loc[:, OHLCV_COLUMNS])
