"""Market screener + sector heatmap — Batch 28 Task 2/3.

Honesty contract (same discipline as ``market_quotes.py`` / Batch 25):
* ``yfinance`` is not a full-market scanner (no bulk "scan the market" endpoint) —
  this covers a curated, BOUNDED universe of well-known, liquid US equities, stated
  explicitly to the caller (``universe_size`` in the response), never implied as
  full-market coverage.
* One batched provider call per refresh (``fetch_screener_snapshot``), not one HTTP
  request per symbol.
* A symbol the provider could not price is reported ``status: "unavailable"``, never
  a frozen or fabricated number.
* Sector is OUR OWN curated classification (stable, reviewed at definition time), not
  re-derived per-refresh from the provider — the live-refreshed fields are exactly the
  ones the provider actually gives us: price, change, volume.
* Heatmap tile size is TODAY'S DOLLAR VOLUME (price x volume) — a real, honestly-
  computed liquidity/activity proxy — NOT market capitalization. Bulk live market-cap
  data isn't reliably available from yfinance without one slow call per symbol, and
  showing a fabricated or stale market-cap number would violate this platform's
  honesty discipline. The UI labels this explicitly.

Scope: global, non-tenant data (same as market_quotes.py) — cached under a non-org
Redis key, broadcast on the realtime bridge's GLOBAL scope.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.clients import redis_client
from app.core.config import settings
from app.providers import ProviderError, ScreenerQuote, get_provider
from app.ws import events as ws_events

logger = logging.getLogger(__name__)

CACHE_KEY = "market:screener:latest"


@dataclass(frozen=True)
class UniverseSymbol:
    symbol: str
    name: str
    sector: str


# A curated, bounded universe of well-known, liquid US equities across the 11 GICS
# sectors — NOT the full market, and never presented as such (see module docstring).
# Reviewed at definition time (2026); sector membership is a stable classification
# fact, not something re-derived per-refresh.
SCREENER_UNIVERSE: tuple[UniverseSymbol, ...] = (
    # Information Technology
    UniverseSymbol("AAPL", "Apple Inc.", "Information Technology"),
    UniverseSymbol("MSFT", "Microsoft Corp.", "Information Technology"),
    UniverseSymbol("NVDA", "NVIDIA Corp.", "Information Technology"),
    UniverseSymbol("AVGO", "Broadcom Inc.", "Information Technology"),
    UniverseSymbol("ORCL", "Oracle Corp.", "Information Technology"),
    UniverseSymbol("CRM", "Salesforce Inc.", "Information Technology"),
    UniverseSymbol("ADBE", "Adobe Inc.", "Information Technology"),
    UniverseSymbol("AMD", "Advanced Micro Devices", "Information Technology"),
    # Health Care
    UniverseSymbol("LLY", "Eli Lilly and Co.", "Health Care"),
    UniverseSymbol("UNH", "UnitedHealth Group", "Health Care"),
    UniverseSymbol("JNJ", "Johnson & Johnson", "Health Care"),
    UniverseSymbol("ABBV", "AbbVie Inc.", "Health Care"),
    UniverseSymbol("MRK", "Merck & Co.", "Health Care"),
    UniverseSymbol("PFE", "Pfizer Inc.", "Health Care"),
    # Financials
    UniverseSymbol("BRK-B", "Berkshire Hathaway", "Financials"),
    UniverseSymbol("JPM", "JPMorgan Chase & Co.", "Financials"),
    UniverseSymbol("V", "Visa Inc.", "Financials"),
    UniverseSymbol("MA", "Mastercard Inc.", "Financials"),
    UniverseSymbol("BAC", "Bank of America Corp.", "Financials"),
    UniverseSymbol("GS", "Goldman Sachs Group", "Financials"),
    # Consumer Discretionary
    UniverseSymbol("AMZN", "Amazon.com Inc.", "Consumer Discretionary"),
    UniverseSymbol("TSLA", "Tesla Inc.", "Consumer Discretionary"),
    UniverseSymbol("HD", "Home Depot Inc.", "Consumer Discretionary"),
    UniverseSymbol("MCD", "McDonald's Corp.", "Consumer Discretionary"),
    UniverseSymbol("NKE", "Nike Inc.", "Consumer Discretionary"),
    UniverseSymbol("BKNG", "Booking Holdings", "Consumer Discretionary"),
    # Communication Services
    UniverseSymbol("GOOGL", "Alphabet Inc.", "Communication Services"),
    UniverseSymbol("META", "Meta Platforms Inc.", "Communication Services"),
    UniverseSymbol("NFLX", "Netflix Inc.", "Communication Services"),
    UniverseSymbol("DIS", "Walt Disney Co.", "Communication Services"),
    UniverseSymbol("CMCSA", "Comcast Corp.", "Communication Services"),
    UniverseSymbol("T", "AT&T Inc.", "Communication Services"),
    # Industrials
    UniverseSymbol("GE", "GE Aerospace", "Industrials"),
    UniverseSymbol("CAT", "Caterpillar Inc.", "Industrials"),
    UniverseSymbol("RTX", "RTX Corp.", "Industrials"),
    UniverseSymbol("UNP", "Union Pacific Corp.", "Industrials"),
    UniverseSymbol("BA", "Boeing Co.", "Industrials"),
    UniverseSymbol("HON", "Honeywell International", "Industrials"),
    # Consumer Staples
    UniverseSymbol("WMT", "Walmart Inc.", "Consumer Staples"),
    UniverseSymbol("PG", "Procter & Gamble Co.", "Consumer Staples"),
    UniverseSymbol("COST", "Costco Wholesale Corp.", "Consumer Staples"),
    UniverseSymbol("KO", "Coca-Cola Co.", "Consumer Staples"),
    UniverseSymbol("PEP", "PepsiCo Inc.", "Consumer Staples"),
    # Energy
    UniverseSymbol("XOM", "Exxon Mobil Corp.", "Energy"),
    UniverseSymbol("CVX", "Chevron Corp.", "Energy"),
    UniverseSymbol("COP", "ConocoPhillips", "Energy"),
    UniverseSymbol("SLB", "Schlumberger Ltd.", "Energy"),
    # Utilities
    UniverseSymbol("NEE", "NextEra Energy Inc.", "Utilities"),
    UniverseSymbol("DUK", "Duke Energy Corp.", "Utilities"),
    UniverseSymbol("SO", "Southern Co.", "Utilities"),
    # Real Estate
    UniverseSymbol("PLD", "Prologis Inc.", "Real Estate"),
    UniverseSymbol("AMT", "American Tower Corp.", "Real Estate"),
    UniverseSymbol("EQIX", "Equinix Inc.", "Real Estate"),
    # Materials
    UniverseSymbol("LIN", "Linde plc", "Materials"),
    UniverseSymbol("SHW", "Sherwin-Williams Co.", "Materials"),
    UniverseSymbol("FCX", "Freeport-McMoRan Inc.", "Materials"),
)
_BY_SYMBOL = {u.symbol: u for u in SCREENER_UNIVERSE}
SECTORS: tuple[str, ...] = tuple(dict.fromkeys(u.sector for u in SCREENER_UNIVERSE))


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _entry_from_quote(universe: UniverseSymbol, quote: ScreenerQuote, fetched_at: datetime) -> dict:
    dollar_volume = (
        quote.last_price * quote.volume if quote.last_price is not None and quote.volume is not None else None
    )
    return {
        "symbol": universe.symbol,
        "name": universe.name,
        "sector": universe.sector,
        "last_price": round(quote.last_price, 2) if quote.last_price is not None else None,
        "previous_close": round(quote.previous_close, 2) if quote.previous_close is not None else None,
        "change": round(quote.change, 2) if quote.change is not None else None,
        "change_pct": round(quote.change_pct, 3) if quote.change_pct is not None else None,
        "volume": quote.volume,
        "dollar_volume": round(dollar_volume, 2) if dollar_volume is not None else None,
        "session_date": quote.session_date.isoformat() if quote.session_date else None,
        "fetched_at": fetched_at.isoformat(),
        "status": "ok" if quote.ok else "unavailable",
        "unavailable_reason": None if quote.ok else (quote.error or "No price returned"),
    }


def merge_refresh(previous: dict[str, dict], quotes: list[ScreenerQuote], attempted_at: datetime) -> dict[str, dict]:
    merged = dict(previous)
    for quote in quotes:
        universe = _BY_SYMBOL.get(quote.symbol)
        if universe is None:
            continue
        if quote.ok:
            merged[universe.symbol] = _entry_from_quote(universe, quote, attempted_at)
        else:
            prior = dict(merged.get(universe.symbol) or {})
            prior.update(
                {
                    "symbol": universe.symbol, "name": universe.name, "sector": universe.sector,
                    "status": "unavailable", "unavailable_reason": quote.error or "No price returned",
                }
            )
            merged[universe.symbol] = prior
    return merged


def feed_metadata() -> dict:
    return {
        "provider": settings.MARKET_QUOTES_PROVIDER,
        "universe_size": len(SCREENER_UNIVERSE),
        "universe_note": (
            f"A curated, bounded universe of {len(SCREENER_UNIVERSE)} well-known, liquid US "
            "equities across sectors — not the full market."
        ),
        "refresh_interval_seconds": settings.MARKET_SCREENER_REFRESH_SECONDS,
        "data_delay_note": "Delayed quotes (typically 15-20 min), refreshed periodically",
    }


async def load_cached_entries() -> dict[str, dict]:
    raw = await redis_client.get_client().get(CACHE_KEY)
    return json.loads(raw) if raw else {}


async def get_latest() -> dict:
    """The screener payload (also the source data for the heatmap). Never touches
    the network."""
    try:
        entries = await load_cached_entries()
        cache_error = None
    except Exception:  # noqa: BLE001 — Redis down: report it, don't 500 the page
        logger.warning("Screener cache unreadable", exc_info=True)
        entries, cache_error = {}, "Screener data cache unreachable"

    rows = []
    for universe in SCREENER_UNIVERSE:
        entry = entries.get(universe.symbol)
        if entry is None:
            rows.append(
                {
                    "symbol": universe.symbol, "name": universe.name, "sector": universe.sector,
                    "last_price": None, "previous_close": None, "change": None, "change_pct": None,
                    "volume": None, "dollar_volume": None, "session_date": None, "fetched_at": None,
                    "status": "unavailable", "unavailable_reason": cache_error or "Not yet refreshed",
                }
            )
        else:
            row = dict(entry)
            if cache_error:
                row["unavailable_reason"] = cache_error
            rows.append(row)
    return {**feed_metadata(), "generated_at": _utcnow().isoformat(), "rows": rows}


async def refresh_screener(*, publish: bool = True) -> dict:
    """Fetch every universe symbol once (one batched call), update the cache,
    publish the result."""
    if not settings.MARKET_QUOTES_ENABLED:
        return {"refreshed": False, "reason": "disabled"}

    symbols = [u.symbol for u in SCREENER_UNIVERSE]
    now = _utcnow()
    try:
        provider = get_provider(settings.MARKET_QUOTES_PROVIDER)
        quotes = await asyncio.to_thread(provider.fetch_screener_snapshot, symbols)
    except ProviderError as exc:
        logger.warning("Screener refresh failed: %s", exc)
        quotes = [ScreenerQuote(symbol=s, error=str(exc)) for s in symbols]

    client = redis_client.get_client()
    previous = await load_cached_entries()
    merged = merge_refresh(previous, quotes, now)
    await client.set(CACHE_KEY, json.dumps(merged))

    if publish:
        payload = await get_latest()
        await ws_events.publish_screener_update(rows=payload["rows"], metadata=feed_metadata())

    ok = sum(1 for q in quotes if q.ok)
    return {"refreshed": True, "ok": ok, "unavailable": len(quotes) - ok}


def sector_heatmap(rows: list[dict]) -> list[dict]:
    """Aggregate screener rows by sector for the treemap: sized by today's total
    dollar volume, colored by volume-weighted average % change. Rows with no price
    (unavailable) contribute zero weight rather than skewing the average."""
    by_sector: dict[str, dict] = {}
    for row in rows:
        sector = row["sector"]
        bucket = by_sector.setdefault(
            sector, {"sector": sector, "total_dollar_volume": 0.0, "weighted_change_sum": 0.0,
                     "symbol_count": 0, "available_count": 0, "symbols": []}
        )
        bucket["symbol_count"] += 1
        bucket["symbols"].append(
            {"symbol": row["symbol"], "name": row["name"], "change_pct": row.get("change_pct"),
             "dollar_volume": row.get("dollar_volume"), "status": row["status"]}
        )
        dv = row.get("dollar_volume")
        pct = row.get("change_pct")
        if row["status"] == "ok" and dv is not None and pct is not None:
            bucket["total_dollar_volume"] += dv
            bucket["weighted_change_sum"] += dv * pct
            bucket["available_count"] += 1

    result = []
    for bucket in by_sector.values():
        total = bucket["total_dollar_volume"]
        avg_change_pct = (bucket["weighted_change_sum"] / total) if total > 0 else None
        result.append(
            {
                "sector": bucket["sector"],
                "total_dollar_volume": round(total, 2) if total > 0 else None,
                "avg_change_pct": round(avg_change_pct, 3) if avg_change_pct is not None else None,
                "symbol_count": bucket["symbol_count"],
                "available_count": bucket["available_count"],
                "symbols": bucket["symbols"],
            }
        )
    return result
