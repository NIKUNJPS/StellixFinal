"""yfinance-backed terminal data: search, quotes, quote detail, history, options, earnings.

yfinance is already the platform-wide market-data provider (constitution / ADR-FINAL).
All functions are blocking and return plain JSON-safe structures; the cache layer runs
them in worker threads. Missing or non-finite numbers are always ``None`` — never 0.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd
import yfinance as yf

from app.features.engineering import compute_features

DELAY_NOTE = "Yahoo Finance via yfinance — typically delayed ~15 min for equities; not execution-grade."


def num(value: Any, digits: int | None = None) -> float | None:
    """A finite float or None (NaN/inf/None/strings all become None)."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return round(f, digits) if digits is not None else f


# ----------------------------------------------------------------------------- search
def search(query: str, limit: int = 10) -> list[dict]:
    result = yf.Search(query, max_results=limit, news_count=0)
    out = []
    for q in result.quotes or []:
        symbol = q.get("symbol")
        if not symbol:
            continue
        out.append(
            {
                "symbol": symbol,
                "name": q.get("shortname") or q.get("longname") or symbol,
                "exchange": q.get("exchDisp") or q.get("exchange"),
                "type": (q.get("quoteType") or "").lower() or None,
            }
        )
    return out[:limit]


# ----------------------------------------------------------------------------- quotes
def quotes(symbols: list[str]) -> list[dict]:
    """Latest price + change for many symbols in two batched downloads (intraday last
    print + daily previous close). A symbol with no data gets ``status: unavailable``."""
    daily = yf.download(symbols, period="5d", interval="1d", group_by="ticker", auto_adjust=False,
                        progress=False, threads=True)
    intraday = yf.download(symbols, period="1d", interval="1m", group_by="ticker", auto_adjust=False,
                           progress=False, threads=True)

    def _frame(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
        if frame is None or frame.empty:
            return pd.DataFrame()
        if isinstance(frame.columns, pd.MultiIndex):
            if symbol not in frame.columns.get_level_values(0):
                return pd.DataFrame()
            frame = frame[symbol]
        return frame.dropna(how="all")

    out = []
    for symbol in symbols:
        d = _frame(daily, symbol)
        i = _frame(intraday, symbol)
        if d.empty:
            out.append({"symbol": symbol, "status": "unavailable"})
            continue
        last_daily_date = d.index[-1].date()
        last = num(i["Close"].iloc[-1]) if not i.empty else num(d["Close"].iloc[-1])
        last_time = i.index[-1] if not i.empty else d.index[-1]
        # previous close = the close of the session BEFORE the one `last` belongs to
        session = last_time.date()
        prior = d[[ts.date() < session for ts in d.index]]
        prev = num(prior["Close"].iloc[-1]) if not prior.empty else None
        change = (last - prev) if last is not None and prev is not None else None
        out.append(
            {
                "symbol": symbol,
                "status": "ok" if last is not None else "unavailable",
                "last": num(last, 4),
                "previous_close": num(prev, 4),
                "change": num(change, 4),
                "change_pct": num(change / prev * 100, 3) if change is not None and prev else None,
                "volume": num(d["Volume"].iloc[-1]) if last_daily_date == session else None,
                "day_high": num(d["High"].iloc[-1], 4) if last_daily_date == session else None,
                "day_low": num(d["Low"].iloc[-1], 4) if last_daily_date == session else None,
                "as_of": pd.Timestamp(last_time).isoformat(),
            }
        )
    return out


_INFO_FIELDS = {
    "name": "longName",
    "currency": "currency",
    "exchange": "fullExchangeName",
    "quote_type": "quoteType",
    "sector": "sector",
    "industry": "industry",
    "last": "currentPrice",
    "bid": "bid",
    "ask": "ask",
    "bid_size": "bidSize",
    "ask_size": "askSize",
    "open": "open",
    "day_high": "dayHigh",
    "day_low": "dayLow",
    "previous_close": "previousClose",
    "volume": "volume",
    "average_volume": "averageVolume",
    "market_cap": "marketCap",
    "pe_ratio": "trailingPE",
    "forward_pe": "forwardPE",
    "eps": "trailingEps",
    "dividend_yield_pct": "dividendYield",
    "fifty_two_week_low": "fiftyTwoWeekLow",
    "fifty_two_week_high": "fiftyTwoWeekHigh",
    "beta": "beta",
    "shares_outstanding": "sharesOutstanding",
    "website": "website",
}
_TEXT_FIELDS = {"name", "currency", "exchange", "quote_type", "sector", "industry", "website"}


def quote_detail(symbol: str) -> dict:
    ticker = yf.Ticker(symbol)
    info = ticker.info or {}
    if not info or (info.get("regularMarketPrice") is None and info.get("currentPrice") is None
                    and info.get("previousClose") is None):
        raise LookupError(f"no quote for {symbol}")
    out: dict[str, Any] = {"symbol": symbol}
    for key, src in _INFO_FIELDS.items():
        value = info.get(src)
        out[key] = (value or None) if key in _TEXT_FIELDS else num(value)
    if out["last"] is None:
        out["last"] = num(info.get("regularMarketPrice"))
    if out["last"] is None:
        # Yahoo's info payload omits both fields for some ETFs/indices at times; the
        # last trade from fast_info is the same price, fetched from the chart API.
        try:
            out["last"] = num(ticker.fast_info.get("lastPrice"))
        except Exception:  # noqa: BLE001
            out["last"] = None
    if out["previous_close"] is None:
        out["previous_close"] = num(info.get("regularMarketPreviousClose"))
    if out["open"] is None or out["day_high"] is None or out["volume"] is None:
        # The info payload drops intraday fields at times; the session's own daily bar has them.
        try:
            bar = ticker.history(period="1d", interval="1d", auto_adjust=False)
            if bar is not None and not bar.empty:
                row = bar.iloc[-1]
                out["open"] = out["open"] if out["open"] is not None else num(row["Open"])
                out["day_high"] = out["day_high"] if out["day_high"] is not None else num(row["High"])
                out["day_low"] = out["day_low"] if out["day_low"] is not None else num(row["Low"])
                out["volume"] = out["volume"] if out["volume"] is not None else num(row["Volume"])
        except Exception:  # noqa: BLE001 — leave them empty rather than guess
            pass
    if out["market_cap"] is None:
        # ETFs have no market cap; their size is total net assets (labelled as such).
        out["total_assets"] = num(info.get("totalAssets"))
    # yfinance reports a zero bid/ask outside market hours: that is "no quote", not 0.
    for k in ("bid", "ask", "bid_size", "ask_size"):
        if out[k] == 0:
            out[k] = None
    prev = out["previous_close"]
    out["change"] = num(out["last"] - prev, 4) if out["last"] is not None and prev else None
    out["change_pct"] = num(out["change"] / prev * 100, 3) if out["change"] is not None and prev else None
    out["summary"] = (info.get("longBusinessSummary") or "")[:1200] or None
    return out


# ----------------------------------------------------------------------------- history
# range -> (yfinance period, interval, intraday?)
RANGES: dict[str, tuple[str, str, bool]] = {
    "1D": ("1d", "5m", True),
    "5D": ("5d", "15m", True),
    "1M": ("1mo", "60m", True),
    "3M": ("3mo", "1d", False),
    "6M": ("6mo", "1d", False),
    "1Y": ("1y", "1d", False),
    "5Y": ("5y", "1wk", False),
    "MAX": ("max", "1mo", False),
}
_ROLLING_VWAP = 20


def history(symbol: str, range_key: str) -> dict:
    period, interval, intraday = RANGES[range_key]
    raw = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False, prepost=False)
    if raw is None or raw.empty:
        raise LookupError(f"no history for {symbol}")
    frame = raw.reset_index().rename(columns=str.lower)
    frame = frame.rename(columns={frame.columns[0]: "timestamp"})
    frame = frame[["timestamp", "open", "high", "low", "close", "volume"]].dropna(subset=["close"])
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)

    feats = compute_features(frame)  # the same indicator function strategies use
    indexed = frame.set_index("timestamp")
    typical = (indexed["high"] + indexed["low"] + indexed["close"]) / 3.0
    pv = typical * indexed["volume"]
    if intraday:
        # True session VWAP: cumulative within each exchange trading day.
        day = indexed.index.tz_convert("America/New_York").date
        vwap = pv.groupby(day).cumsum() / indexed["volume"].groupby(day).cumsum()
        vwap_label = "Session VWAP"
    else:
        vwap = pv.rolling(_ROLLING_VWAP).sum() / indexed["volume"].rolling(_ROLLING_VWAP).sum()
        vwap_label = f"Rolling {_ROLLING_VWAP}-bar VWAP"

    def series(col: pd.Series) -> list[dict]:
        return [{"t": int(ts.timestamp()), "v": round(float(v), 4)} for ts, v in col.items() if pd.notna(v)]

    candles = [
        {"t": int(r.timestamp.timestamp()), "o": num(r.open, 4), "h": num(r.high, 4), "l": num(r.low, 4),
         "c": num(r.close, 4), "v": num(r.volume)}
        for r in frame.itertuples()
    ]
    return {
        "symbol": symbol,
        "range": range_key,
        "interval": interval,
        "intraday": intraday,
        "candles": candles,
        "indicators": {
            "sma_20": series(feats["sma_20"]),
            "sma_50": series(feats["sma_50"]),
            "ema_12": series(feats["ema_12"]),
            "ema_26": series(feats["ema_26"]),
            "bollinger_upper": series(feats["bollinger_upper"]),
            "bollinger_lower": series(feats["bollinger_lower"]),
            "rsi_14": series(feats["rsi_14"]),
            "macd": series(feats["macd"]),
            "macd_signal": series(feats["macd_signal"]),
            "vwap": series(vwap),
        },
        "vwap_label": vwap_label,
    }


def daily_closes(symbol: str, start: date, end: date) -> pd.Series:
    raw = yf.Ticker(symbol).history(start=start.isoformat(), end=end.isoformat(), interval="1d", auto_adjust=False)
    if raw is None or raw.empty:
        return pd.Series(dtype=float)
    closes = raw["Close"].dropna()
    closes.index = [ts.date() for ts in closes.index]
    return closes


# ----------------------------------------------------------------------------- options
def option_expirations(symbol: str) -> list[str]:
    return list(yf.Ticker(symbol).options or [])


def option_chain(symbol: str, expiration: str) -> dict:
    ticker = yf.Ticker(symbol)
    chain = ticker.option_chain(expiration)
    spot = num(ticker.fast_info.get("lastPrice"))

    def rows(frame: pd.DataFrame) -> list[dict]:
        out = []
        for r in frame.itertuples():
            bid, ask = num(r.bid), num(r.ask)
            out.append(
                {
                    "contract": r.contractSymbol,
                    "strike": num(r.strike, 4),
                    "last": num(r.lastPrice, 4),
                    # 0/0 from the provider means no live quote — shown as "no quote".
                    "bid": bid if bid else None,
                    "ask": ask if ask else None,
                    "volume": num(r.volume),
                    "open_interest": num(r.openInterest),
                    "implied_volatility": num(r.impliedVolatility),
                    "in_the_money": bool(r.inTheMoney),
                    "last_trade": pd.Timestamp(r.lastTradeDate).isoformat() if pd.notna(r.lastTradeDate) else None,
                }
            )
        return out

    return {"symbol": symbol, "expiration": expiration, "underlying_price": spot,
            "calls": rows(chain.calls), "puts": rows(chain.puts)}


# ----------------------------------------------------------------------------- earnings
def next_earnings(symbol: str) -> dict:
    cal = yf.Ticker(symbol).calendar or {}
    dates = cal.get("Earnings Date") if isinstance(cal, dict) else None
    first = dates[0] if dates else None
    return {
        "symbol": symbol,
        "next_date": first.isoformat() if isinstance(first, date) else None,
        "eps_estimate": num(cal.get("Earnings Average")) if isinstance(cal, dict) else None,
        "eps_low": num(cal.get("Earnings Low")) if isinstance(cal, dict) else None,
        "eps_high": num(cal.get("Earnings High")) if isinstance(cal, dict) else None,
        "revenue_estimate": num(cal.get("Revenue Average")) if isinstance(cal, dict) else None,
    }


def earnings_history(symbol: str, limit: int = 12) -> list[dict]:
    """Reported quarters: estimate vs actual, surprise, and the REAL next-session move
    (close of the first session after the report vs the close before it)."""
    frame = yf.Ticker(symbol).get_earnings_dates(limit=limit + 8)
    if frame is None or frame.empty:
        return []
    reported = frame[frame["Reported EPS"].notna()].sort_index(ascending=False).head(limit)
    if reported.empty:
        return []
    earliest = min(ts.date() for ts in reported.index) - timedelta(days=10)
    closes = daily_closes(symbol, earliest, datetime.now(UTC).date() + timedelta(days=1))
    out = []
    for ts, row in reported.iterrows():
        when = pd.Timestamp(ts)
        # Reports after 16:00 ET react the next session; earlier ones react the same day.
        et = when.tz_convert("America/New_York") if when.tzinfo else when
        react_day = et.date() if et.hour < 16 else et.date() + timedelta(days=1)
        before = [d for d in closes.index if d < react_day]
        after = [d for d in closes.index if d >= react_day]
        move = None
        if before and after:
            move = num((closes[after[0]] - closes[before[-1]]) / closes[before[-1]] * 100, 3)
        out.append(
            {
                "date": et.isoformat(),
                "eps_estimate": num(row.get("EPS Estimate")),
                "eps_actual": num(row.get("Reported EPS")),
                "surprise_pct": num(row.get("Surprise(%)")),
                "next_session_move_pct": move,
            }
        )
    return out
