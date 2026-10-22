"""Market Terminal data service (Batch 31, ADR 0010) — every global widget's payload.

Each function returns the cache envelope from ``app.terminal.cache`` (``data``,
``source``, ``delay_note``, ``fetched_at``, ``stale``, ``age_seconds``). Nothing here is
tenant data; nothing here writes to Postgres.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, date, datetime

from app.clients import redis_client
from app.core.config import settings
from app.providers.fred_client import FredError, fetch_latest
from app.services import market_quotes, market_screener
from app.terminal import greeks
from app.terminal.cache import SourceNotConfigured, SourceUnavailable, cached, run_blocking
from app.terminal.sources import crypto_news, fred_calendar, official, yahoo

logger = logging.getLogger(__name__)

YF = "Yahoo Finance (yfinance)"
SEC = "SEC EDGAR"


def _norm(symbol: str) -> str:
    return symbol.strip().upper()


# ----------------------------------------------------------------------------- search
async def search(query: str) -> dict:
    q = query.strip()

    def fetch() -> list[dict]:
        results = yahoo.search(q, limit=10)
        seen = {r["symbol"] for r in results}
        if official.sec_configured():
            try:
                tickers = _sec_tickers_blocking()
                ql = q.upper()
                extra = [
                    {"symbol": t, "name": v["name"], "exchange": "SEC registrant", "type": "equity"}
                    for t, v in tickers.items()
                    if (t.startswith(ql) or ql in v["name"].upper()) and t not in seen
                ]
                extra.sort(key=lambda r: (not r["symbol"].startswith(ql), len(r["symbol"])))
                results += extra[: max(0, 12 - len(results))]
            except Exception:  # noqa: BLE001 — SEC enrichment is optional
                logger.debug("SEC ticker enrichment failed", exc_info=True)
        return results

    return await cached(f"search:{q.lower()}", ttl=3600, fetch=fetch, source=YF + " + SEC company tickers",
                        delay_note="Symbol directory")


# ----------------------------------------------------------------------------- quotes
async def quotes(symbols: list[str]) -> dict:
    wanted = sorted({_norm(s) for s in symbols if s.strip()})
    return await cached("quotes:" + ",".join(wanted), ttl=15, fetch=lambda: yahoo.quotes(wanted), source=YF,
                        delay_note=yahoo.DELAY_NOTE)


async def quote_detail(symbol: str) -> dict:
    s = _norm(symbol)
    return await cached(f"quote:{s}", ttl=60, fetch=lambda: yahoo.quote_detail(s), source=YF,
                        delay_note=yahoo.DELAY_NOTE)


async def history(symbol: str, range_key: str) -> dict:
    s = _norm(symbol)
    intraday = yahoo.RANGES[range_key][2]
    return await cached(f"history:{s}:{range_key}", ttl=60 if intraday else 900,
                        fetch=lambda: yahoo.history(s, range_key), source=YF, delay_note=yahoo.DELAY_NOTE)


# ----------------------------------------------------------------------------- news
async def news(symbol: str | None, query: str | None) -> dict:
    s = _norm(symbol) if symbol else None
    key = f"news:{s or ''}:{(query or '').strip().lower()}"
    return await cached(key, ttl=300, fetch=lambda: crypto_news.news(s, query), source="Yahoo Finance RSS + Google News RSS",
                        delay_note="Headlines refreshed every 5 minutes; links open the publisher's page.")


# ----------------------------------------------------------------------------- options
async def _risk_free() -> tuple[float, str]:
    if settings.FRED_API_KEY:
        try:
            env = await cached("fred:DGS3MO", ttl=86400, fetch=lambda: _dgs3mo(), source="FRED DGS3MO",
                               delay_note="Daily")
            if env["data"] is not None:
                return float(env["data"]) / 100.0, f"FRED 3-month T-bill ({env['data']}%)"
        except Exception:  # noqa: BLE001
            logger.debug("DGS3MO unavailable", exc_info=True)
    return settings.TERMINAL_RISK_FREE_RATE, f"configured default ({settings.TERMINAL_RISK_FREE_RATE:.2%})"


def _dgs3mo() -> float | None:
    try:
        point = fetch_latest(settings.FRED_API_KEY, "DGS3MO")
    except FredError:
        return None
    return point.value if point else None


async def options(symbol: str, expiration: str | None) -> dict:
    s = _norm(symbol)
    exps = await cached(f"options:exp:{s}", ttl=3600, fetch=lambda: yahoo.option_expirations(s), source=YF,
                        delay_note=yahoo.DELAY_NOTE)
    expirations = exps["data"] or []
    if not expirations:
        raise LookupError(f"{s} has no listed options")
    chosen = expiration if expiration in expirations else expirations[0]
    env = await cached(f"options:{s}:{chosen}", ttl=60, fetch=lambda: yahoo.option_chain(s, chosen), source=YF,
                       delay_note=yahoo.DELAY_NOTE)
    rate, rate_source = await _risk_free()
    chain = env["data"]
    expiry_dt = datetime.combine(date.fromisoformat(chosen), datetime.min.time(), tzinfo=UTC).replace(hour=20)
    years = max((expiry_dt - datetime.now(UTC)).total_seconds(), 0) / (365.0 * 86400)
    spot = chain.get("underlying_price")
    for side, is_call in (("calls", True), ("puts", False)):
        for row in chain[side]:
            g = greeks.bs_greeks(spot=spot, strike=row["strike"], years=years, rate=rate,
                                 vol=row["implied_volatility"], call=is_call) if spot else None
            row["greeks"] = g.as_dict() if g else None
            row["mid"] = round((row["bid"] + row["ask"]) / 2, 4) if row["bid"] and row["ask"] else None
    env["data"] = {
        **chain,
        "expirations": expirations,
        "years_to_expiry": round(years, 6),
        "risk_free_rate": rate,
        "risk_free_source": rate_source,
        "greeks_model": "Black-Scholes (European approximation, no dividend yield) on the provider's implied volatility",
    }
    return env


# ----------------------------------------------------------------------------- crypto
CG = "CoinGecko public API"
BN = "Binance public market data (data-api.binance.vision)"


async def crypto_board() -> dict:
    try:
        return await cached("crypto:board", ttl=120, fetch=crypto_news.crypto_board, source=CG,
                            delay_note="Refreshed every 2 minutes")
    except SourceUnavailable:
        # CoinGecko throttles keyless callers; Binance tickers keep the board alive,
        # labelled as a fallback (no market cap / dominance / sparkline there).
        return await cached("crypto:board:binance", ttl=60, fetch=crypto_news.binance_board,
                            source=BN + " (fallback: CoinGecko unavailable)",
                            delay_note="Exchange tickers; market cap and dominance unavailable in fallback")


async def crypto_history(symbol: str, interval: str) -> dict:
    s = _norm(symbol)
    return await cached(f"crypto:klines:{s}:{interval}", ttl=60, fetch=lambda: crypto_news.crypto_klines(s, interval),
                        source=BN, delay_note="Exchange data, near real-time; candles cached 60s")


async def crypto_orderbook(symbol: str) -> dict:
    s = _norm(symbol)
    return await cached(f"crypto:book:{s}", ttl=5, fetch=lambda: crypto_news.crypto_orderbook(s), source=BN,
                        delay_note="Top 20 levels, cached 5s")


# ----------------------------------------------------------------------------- macro
MACRO_PROXIES: tuple[tuple[str, str, str], ...] = (
    ("^VIX", "VIX", "Volatility"),
    ("^TNX", "US 10Y yield (x10)", "Rates"),
    ("DX-Y.NYB", "US Dollar Index", "FX"),
    ("EURUSD=X", "EUR/USD", "FX"),
    ("USDJPY=X", "USD/JPY", "FX"),
    ("GC=F", "Gold", "Commodities"),
    ("SI=F", "Silver", "Commodities"),
    ("CL=F", "WTI crude", "Commodities"),
    ("NG=F", "Natural gas", "Commodities"),
    ("HG=F", "Copper", "Commodities"),
    ("BTC-USD", "Bitcoin", "Crypto"),
)


async def macro_global() -> dict:
    proxies = await quotes([p[0] for p in MACRO_PROXIES])
    by_symbol = {q["symbol"]: q for q in proxies["data"]}
    ecb_rows = []
    for key in official.ECB_SERIES:
        try:
            env = await cached(f"ecb:{key}", ttl=43200, fetch=lambda k=key: official.ecb_latest(k),
                               source="ECB Data Portal API", delay_note="Official, updated on publication")
            ecb_rows.append({**env["data"], "stale": env["stale"]})
        except Exception as exc:  # noqa: BLE001 — one series failing never blanks the widget
            _, _, label = official.ECB_SERIES[key]
            ecb_rows.append({"key": key, "label": label, "value": None, "date": None, "error": str(exc)})
    return {
        "data": {
            "proxies": [{"symbol": s, "label": label, "group": group, **by_symbol.get(s, {"status": "unavailable"})}
                        for s, label, group in MACRO_PROXIES],
            "ecb": ecb_rows,
        },
        "source": "Yahoo Finance (proxies) + ECB Data Portal API",
        "delay_note": proxies["delay_note"],
        "fetched_at": proxies["fetched_at"],
        "stale": proxies["stale"],
        "age_seconds": proxies["age_seconds"],
    }


# ----------------------------------------------------------------------------- calendars
async def economic_calendar() -> dict:
    return await cached("calendar:economic", ttl=6 * 3600, fetch=fred_calendar.economic_calendar,
                        source="FRED release dates + series", delay_note="Official schedule; no consensus forecasts",
                        timeout=90)


async def earnings_calendar(symbols: list[str]) -> dict:
    wanted = sorted({_norm(s) for s in symbols if s.strip()})[:40]

    def fetch() -> list[dict]:
        rows = []
        for s in wanted:
            try:
                rows.append(yahoo.next_earnings(s))
            except Exception as exc:  # noqa: BLE001
                rows.append({"symbol": s, "next_date": None, "error": str(exc)[:120]})
        rows.sort(key=lambda r: r.get("next_date") or "9999")
        return rows

    return await cached("calendar:earnings:" + ",".join(wanted), ttl=6 * 3600, fetch=fetch, source=YF,
                        delay_note="Company-reported dates as published", timeout=120)


async def earnings_history(symbol: str) -> dict:
    s = _norm(symbol)
    return await cached(f"earnings:history:{s}", ttl=6 * 3600, fetch=lambda: yahoo.earnings_history(s), source=YF,
                        delay_note="Reported quarters; next-session move from daily closes", timeout=60)


# ----------------------------------------------------------------------------- SEC
def _sec_tickers_blocking() -> dict:
    """Cached synchronously via a module-level memo refreshed daily (used inside worker threads)."""
    now = datetime.now(UTC)
    memo = _SEC_MEMO.get("tickers")
    if memo and (now - memo[0]).total_seconds() < 86400:
        return memo[1]
    data = official.sec_company_tickers()
    _SEC_MEMO["tickers"] = (now, data)
    return data


_SEC_MEMO: dict[str, tuple[datetime, dict]] = {}


async def insider(symbol: str) -> dict:
    s = _norm(symbol)
    if not official.sec_configured():
        raise SourceNotConfigured("SEC_EDGAR_USER_AGENT is not set, so SEC insider data is not configured.")

    def fetch() -> dict:
        info = _sec_tickers_blocking().get(s)
        if info is None:
            raise LookupError(f"{s} is not an SEC registrant (insider filings exist only for SEC filers)")
        return {"symbol": s, "cik": info["cik"], "company": info["name"],
                "transactions": official.sec_insider_transactions(info["cik"])}

    return await cached(f"insider:{s}", ttl=3600, fetch=fetch, source=SEC + " Form 4",
                        delay_note="As filed; Form 4 is due within 2 business days of the trade", timeout=90)


async def market_caps() -> dict:
    """ticker -> {market_cap, shares, shares_as_of} for the screener universe, from SEC
    shares outstanding x the screener's cached price. Refreshed daily (shares change
    only when companies file)."""
    if not official.sec_configured():
        raise SourceNotConfigured("SEC_EDGAR_USER_AGENT is not set")

    def fetch() -> dict:
        tickers = _sec_tickers_blocking()
        shares = official.sec_shares_outstanding()
        out = {}
        for u in market_screener.SCREENER_UNIVERSE:
            info = tickers.get(u.symbol)
            row = shares.get(info["cik"]) if info else None
            if row:
                out[u.symbol] = {"shares": row["shares"], "shares_as_of": row["as_of"], "shares_source": "SEC"}
                continue
            # Multi-class issuers (GOOGL, META, BRK-B, V, MA, ...) report shares per class
            # with XBRL dimensions, which the frames API omits. Yahoo's total market cap
            # divided by its price gives the implied share count across classes.
            try:
                detail = yahoo.quote_detail(u.symbol)
                if detail.get("market_cap") and detail.get("last"):
                    out[u.symbol] = {"shares": detail["market_cap"] / detail["last"], "shares_as_of": None,
                                     "shares_source": "Yahoo (implied, multi-class)"}
            except Exception:  # noqa: BLE001 — leave the cap unknown, never guessed
                logger.debug("implied shares unavailable for %s", u.symbol, exc_info=True)
        return out

    return await cached("sec:shares:universe", ttl=86400, fetch=fetch, source=SEC + " XBRL frames",
                        delay_note="Shares outstanding as last filed", timeout=120)


# ----------------------------------------------------------------------------- screener / heatmap
async def screener() -> dict:
    payload = await market_screener.get_latest()
    caps_note = None
    try:
        caps = (await market_caps())["data"]
    except SourceNotConfigured:
        caps, caps_note = {}, "Market cap needs SEC_EDGAR_USER_AGENT (SEC shares outstanding)."
    except Exception:  # noqa: BLE001
        caps, caps_note = {}, "SEC shares outstanding unavailable right now."
    rows = []
    for row in payload["rows"]:
        cap = caps.get(row["symbol"])
        price = row.get("last_price")
        rows.append({
            **row,
            "market_cap": round(cap["shares"] * price, 0) if cap and price else None,
            "shares_outstanding": cap["shares"] if cap else None,
            "shares_as_of": cap["shares_as_of"] if cap else None,
            "shares_source": cap.get("shares_source") if cap else None,
        })
    return {**payload, "rows": rows,
            "market_cap_source": "SEC shares outstanding x delayed price (Yahoo implied shares for multi-class issuers)",
            "market_cap_note": caps_note}


async def heatmap() -> dict:
    data = await screener()
    by_cap = all(r.get("market_cap") for r in data["rows"] if r["status"] == "ok") and any(
        r.get("market_cap") for r in data["rows"])
    size_key = "market_cap" if by_cap else "dollar_volume"
    sectors: dict[str, dict] = {}
    for r in data["rows"]:
        b = sectors.setdefault(r["sector"], {"sector": r["sector"], "size": 0.0, "wsum": 0.0, "tiles": []})
        size = r.get(size_key)
        b["tiles"].append({"symbol": r["symbol"], "name": r["name"], "change_pct": r.get("change_pct"),
                           "size": size, "status": r["status"]})
        if r["status"] == "ok" and size and r.get("change_pct") is not None:
            b["size"] += size
            b["wsum"] += size * r["change_pct"]
    return {
        "size_basis": size_key,
        "size_note": "Sized by market cap (SEC shares outstanding x price; Yahoo implied shares for multi-class issuers)" if by_cap
        else "Sized by today's dollar volume (market cap unavailable)",
        "universe_note": data["universe_note"],
        "data_delay_note": data["data_delay_note"],
        "generated_at": data["generated_at"],
        "sectors": [
            {"sector": b["sector"], "size": b["size"] or None,
             "change_pct": round(b["wsum"] / b["size"], 3) if b["size"] else None, "tiles": b["tiles"]}
            for b in sorted(sectors.values(), key=lambda x: -x["size"])
        ],
    }


# ----------------------------------------------------------------------------- FINRA
_FINRA_TTL = 20 * 86400


async def _finra_day(day: date) -> dict | None:
    key = f"terminal:finra:{day:%Y%m%d}"
    miss = f"terminal:finra:none:{day:%Y%m%d}"
    client = None
    try:
        client = redis_client.get_client()
        raw = await client.get(key)
        if raw:
            return json.loads(raw)
        if await client.get(miss):
            return None
    except Exception:  # noqa: BLE001
        client = None
    data = await run_blocking(official.finra_short_volume_day, day, timeout=60)
    if client is not None:
        try:
            if data is None:
                # Weekend/holiday or not yet published: remember briefly, retry later.
                await client.set(miss, "1", ex=6 * 3600)
            else:
                await client.set(key, json.dumps(data), ex=_FINRA_TTL)
        except Exception:  # noqa: BLE001
            pass
    return data


async def short_volume(symbol: str, sessions: int = 10) -> dict:
    s = _norm(symbol)
    rows = []
    for day in official.recent_business_days(sessions + 6):
        if len(rows) >= sessions:
            break
        data = await _finra_day(day)
        if not data:
            continue
        v = data.get(s)
        if v is None:
            continue
        short, exempt, total = v
        rows.append({"date": day.isoformat(), "short_volume": short, "short_exempt_volume": exempt,
                     "total_volume": total, "short_ratio_pct": round(short / total * 100, 2) if total else None})
    return {
        "data": {"symbol": s, "sessions": rows},
        "source": "FINRA Reg SHO daily short-sale volume (consolidated NMS)",
        "delay_note": "Published after each session; covers FINRA-reported off-exchange volume only.",
        "fetched_at": datetime.now(UTC).isoformat(),
        "stale": False,
        "age_seconds": 0,
    }


async def warm_finra(days: int = 12) -> int:
    """Celery warm-up so requests never wait on a multi-megabyte FINRA download."""
    loaded = 0
    for day in official.recent_business_days(days):
        try:
            if await _finra_day(day):
                loaded += 1
        except Exception:  # noqa: BLE001
            logger.warning("FINRA warm failed for %s", day, exc_info=True)
    return loaded


# ----------------------------------------------------------------------------- recap
async def recap() -> dict:
    indices = await market_quotes.get_latest()
    scr = await market_screener.get_latest()
    ok = [r for r in scr["rows"] if r["status"] == "ok" and r.get("change_pct") is not None]
    gainers = sorted(ok, key=lambda r: -r["change_pct"])[:5]
    losers = sorted(ok, key=lambda r: r["change_pct"])[:5]
    sectors = sorted(
        [s for s in market_screener.sector_heatmap(scr["rows"]) if s["avg_change_pct"] is not None],
        key=lambda s: -s["avg_change_pct"],
    )
    try:
        vix_env = await quotes(["^VIX"])
        vix = vix_env["data"][0].get("last")
    except Exception:  # noqa: BLE001
        vix = None
    try:
        headlines = (await news(None, "stock market today"))["data"][:6]
    except Exception:  # noqa: BLE001
        headlines = []
    idx_rows = indices.get("indices") or indices.get("quotes") or []
    us = [i for i in idx_rows if i.get("region") == "United States" and i.get("change_pct") is not None]
    breadth_up = sum(1 for r in ok if r["change_pct"] > 0)

    parts = []
    if us:
        moves = ", ".join(f"{i['name']} {i['change_pct']:+.2f}%" for i in us)
        parts.append(f"US indices: {moves}.")
    if ok:
        parts.append(f"{breadth_up} of {len(ok)} tracked large caps are up.")
    if sectors:
        parts.append(f"Leading sector: {sectors[0]['sector']} ({sectors[0]['avg_change_pct']:+.2f}%); "
                     f"lagging: {sectors[-1]['sector']} ({sectors[-1]['avg_change_pct']:+.2f}%).")
    if vix is not None:
        parts.append(f"VIX {vix:.2f}.")
    return {
        "summary": " ".join(parts) or "Market data has not been refreshed yet.",
        "summary_method": "Deterministic template over the cached data below — not an LLM.",
        "generated_at": datetime.now(UTC).isoformat(),
        "indices": idx_rows,
        "vix": vix,
        "gainers": gainers,
        "losers": losers,
        "sectors": [{"sector": s["sector"], "change_pct": s["avg_change_pct"]} for s in sectors],
        "headlines": headlines,
        "universe_note": scr["universe_note"],
    }


# ----------------------------------------------------------------------------- status / TV
DEFAULT_TV_CHANNELS = [
    {"label": "Bloomberg Television", "youtube_channel_id": "UCIALMKvObZNtJ6AmdCLP7Lg"},
    {"label": "Yahoo Finance", "youtube_channel_id": "UCEAZeUIeJs0IjQiqTCdVSIg"},
    {"label": "CNBC Television", "youtube_channel_id": "UCrp_UI8XtuYfpiqluWLD7Lw"},
]


def tv_channels() -> list[dict]:
    raw = (settings.TERMINAL_TV_CHANNELS or "").strip()
    if not raw:
        return DEFAULT_TV_CHANNELS
    try:
        parsed = json.loads(raw)
        return [c for c in parsed if isinstance(c, dict) and c.get("label") and c.get("youtube_channel_id")]
    except ValueError:
        logger.warning("TERMINAL_TV_CHANNELS is not valid JSON; using defaults")
        return DEFAULT_TV_CHANNELS


def status() -> dict:
    return {
        "sources": {
            "yahoo": {"configured": True, "note": yahoo.DELAY_NOTE},
            "sec_edgar": {"configured": official.sec_configured(),
                          "note": None if official.sec_configured() else "Set SEC_EDGAR_USER_AGENT for insider data and market caps."},
            "fred": {"configured": bool(settings.FRED_API_KEY),
                     "note": None if settings.FRED_API_KEY else "Set FRED_API_KEY for the economic calendar and yield curve."},
            "coingecko": {"configured": True, "note": None},
            "binance": {"configured": True, "note": None},
            "finra": {"configured": True, "note": None},
            "ecb": {"configured": True, "note": None},
            "news_rss": {"configured": True, "note": None},
        },
        "history_ranges": list(yahoo.RANGES),
        "tv_channels": tv_channels(),
        "risk_free_fallback": settings.TERMINAL_RISK_FREE_RATE,
    }
