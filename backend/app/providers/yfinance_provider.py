"""yfinance-backed provider — free, no API key. Default for demo/dev.

Good for equities, indices, and crypto pairs (e.g. "AAPL", "^GSPC", "BTC-USD").
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import yfinance as yf

from app.providers.base import (
    OHLCV_COLUMNS,
    LatestQuote,
    MarketDataProvider,
    ProviderError,
    ScreenerQuote,
)


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

    def fetch_latest_quotes(self, symbols: list[str]) -> list[LatestQuote]:
        """One batched download of the last 5 daily bars per symbol.

        For a session in progress, Yahoo's newest daily bar carries the latest
        DELAYED price; the bar before it is the previous close. A 5-day window
        covers weekends and single-market holidays. Symbols with fewer than two
        priced bars get an error instead of a fabricated change.
        """
        if not symbols:
            return []
        try:
            frame = yf.download(
                tickers=list(symbols),
                period="5d",
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                progress=False,
                threads=True,
            )
        except Exception as exc:  # noqa: BLE001 - normalize any client error
            raise ProviderError(f"yfinance quote download failed: {exc}") from exc
        if frame is None or frame.empty:
            raise ProviderError("yfinance returned no quote data")

        quotes: list[LatestQuote] = []
        for symbol in symbols:
            try:
                bars = frame[symbol] if isinstance(frame.columns, pd.MultiIndex) else frame
                closes = bars["Close"].dropna()
            except KeyError:
                quotes.append(LatestQuote(symbol=symbol, error="No data returned for this symbol"))
                continue
            if len(closes) < 2:
                quotes.append(LatestQuote(symbol=symbol, error="Not enough recent sessions to compute a change"))
                continue
            quotes.append(
                LatestQuote(
                    symbol=symbol,
                    last_price=float(closes.iloc[-1]),
                    previous_close=float(closes.iloc[-2]),
                    session_date=pd.Timestamp(closes.index[-1]).date(),
                )
            )
        return quotes

    def fetch_screener_snapshot(self, symbols: list[str]) -> list[ScreenerQuote]:
        """Batch 28: same batched download as ``fetch_latest_quotes``, plus volume —
        one HTTP round trip for the whole screener universe, not one per symbol."""
        if not symbols:
            return []
        try:
            frame = yf.download(
                tickers=list(symbols),
                period="5d",
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                progress=False,
                threads=True,
            )
        except Exception as exc:  # noqa: BLE001 - normalize any client error
            raise ProviderError(f"yfinance screener download failed: {exc}") from exc
        if frame is None or frame.empty:
            raise ProviderError("yfinance returned no screener data")

        quotes: list[ScreenerQuote] = []
        for symbol in symbols:
            try:
                bars = frame[symbol] if isinstance(frame.columns, pd.MultiIndex) else frame
                closes = bars["Close"].dropna()
                volumes = bars["Volume"].dropna()
            except KeyError:
                quotes.append(ScreenerQuote(symbol=symbol, error="No data returned for this symbol"))
                continue
            if len(closes) < 2:
                quotes.append(ScreenerQuote(symbol=symbol, error="Not enough recent sessions to compute a change"))
                continue
            quotes.append(
                ScreenerQuote(
                    symbol=symbol,
                    last_price=float(closes.iloc[-1]),
                    previous_close=float(closes.iloc[-2]),
                    volume=float(volumes.iloc[-1]) if len(volumes) else None,
                    session_date=pd.Timestamp(closes.index[-1]).date(),
                )
            )
        return quotes
