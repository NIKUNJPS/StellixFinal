"""Global market indices — periodically refreshed, delayed public quotes (Batch 25).

Honesty contract (read before changing anything here):
* This is NOT a real-time feed. The default provider (yfinance) reports delayed
  index prices; each quote carries the exchange ``session_date`` its price belongs to
  and the ``fetched_at`` time we last refreshed it successfully. Nothing here ever
  interpolates, extrapolates or synthesizes a price between refreshes.
* A symbol whose last successful refresh is older than
  ``MARKET_QUOTES_STALE_AFTER_SECONDS`` is reported ``unavailable`` — the UI must show
  "data unavailable", never a frozen number presented as current.

Scope: this is global public market data, not tenant data. It lives under a
non-org Redis key and is broadcast on the realtime bridge's GLOBAL scope (every
connected user in every org), never filtered by ``organization_id``.

Flow: celery beat -> ``refresh_global_index_quotes`` task -> ``refresh_quotes`` ->
provider.fetch_latest_quotes (one batched call) -> Redis cache -> publish
``market_quotes`` on the existing Redis pub/sub bridge -> browser sockets.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.clients import redis_client
from app.core.config import settings
from app.providers import LatestQuote, ProviderError, get_provider
from app.ws import events as ws_events

logger = logging.getLogger(__name__)

CACHE_KEY = "market:global_indices:latest"
_REFRESH_LOCK_KEY = "market:global_indices:refresh_lock"


@dataclass(frozen=True)
class IndexDefinition:
    symbol: str
    name: str
    region: str


# Real Yahoo Finance tickers, each verified to resolve through the yfinance provider
# on 2026-09-16 (see docs/schemas.md -> Global market indices).
GLOBAL_INDICES: tuple[IndexDefinition, ...] = (
    IndexDefinition("^GSPC", "S&P 500", "United States"),
    IndexDefinition("^DJI", "Dow Jones Industrial Average", "United States"),
    IndexDefinition("^IXIC", "Nasdaq Composite", "United States"),
    IndexDefinition("^FTSE", "FTSE 100", "United Kingdom"),
    IndexDefinition("^GDAXI", "DAX", "Germany"),
    IndexDefinition("^N225", "Nikkei 225", "Japan"),
    IndexDefinition("^HSI", "Hang Seng", "Hong Kong"),
    IndexDefinition("^NSEI", "Nifty 50", "India"),
    IndexDefinition("^BSESN", "BSE Sensex", "India"),
)
_BY_SYMBOL = {index.symbol: index for index in GLOBAL_INDICES}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _entry_from_quote(index: IndexDefinition, quote: LatestQuote, fetched_at: datetime) -> dict:
    change = quote.last_price - quote.previous_close  # type: ignore[operator]
    change_pct = (change / quote.previous_close * 100.0) if quote.previous_close else None
    return {
        "symbol": index.symbol,
        "name": index.name,
        "region": index.region,
        "last_price": round(quote.last_price, 2),  # type: ignore[arg-type]
        "previous_close": round(quote.previous_close, 2),  # type: ignore[arg-type]
        "change": round(change, 2),
        "change_pct": round(change_pct, 3) if change_pct is not None else None,
        "session_date": quote.session_date.isoformat() if quote.session_date else None,
        "fetched_at": fetched_at.isoformat(),
        "last_attempt_at": fetched_at.isoformat(),
        "last_error": None,
    }


def merge_refresh(previous: dict[str, dict], quotes: list[LatestQuote], attempted_at: datetime) -> dict[str, dict]:
    """Fold one refresh into the cached entries.

    A successful quote replaces the entry. A failed one keeps the last GOOD price and
    its original ``fetched_at`` (so staleness keeps ageing honestly) and records the
    error — it never overwrites a real price with a guess or resets the clock.
    """
    merged = dict(previous)
    for quote in quotes:
        index = _BY_SYMBOL.get(quote.symbol)
        if index is None:
            continue
        if quote.ok and quote.previous_close:
            merged[index.symbol] = _entry_from_quote(index, quote, attempted_at)
            continue
        prior = dict(merged.get(index.symbol) or {})
        prior.update(
            {
                "symbol": index.symbol,
                "name": index.name,
                "region": index.region,
                "last_attempt_at": attempted_at.isoformat(),
                "last_error": quote.error or "No price returned",
            }
        )
        merged[index.symbol] = prior
    return merged


def present(entries: dict[str, dict], *, now: datetime | None = None) -> list[dict]:
    """Every configured index, in display order, with an explicit availability flag."""
    now = now or _utcnow()
    stale_after = settings.MARKET_QUOTES_STALE_AFTER_SECONDS
    result = []
    for index in GLOBAL_INDICES:
        entry = dict(entries.get(index.symbol) or {})
        fetched_at = entry.get("fetched_at")
        age = (now - datetime.fromisoformat(fetched_at)).total_seconds() if fetched_at else None
        available = age is not None and age <= stale_after and entry.get("last_price") is not None
        if not available:
            if fetched_at is None:
                reason = entry.get("last_error") or "No quote collected yet"
            else:
                reason = f"No successful refresh for {int(age // 60)} min"
                if entry.get("last_error"):
                    reason += f" ({entry['last_error']})"
            # Never ship a stale number to be rendered as if current.
            for key in ("last_price", "previous_close", "change", "change_pct"):
                entry[key] = None
            entry["unavailable_reason"] = reason
        result.append(
            {
                "symbol": index.symbol,
                "name": index.name,
                "region": index.region,
                "last_price": entry.get("last_price"),
                "previous_close": entry.get("previous_close"),
                "change": entry.get("change"),
                "change_pct": entry.get("change_pct"),
                "session_date": entry.get("session_date"),
                "fetched_at": fetched_at,
                "last_attempt_at": entry.get("last_attempt_at"),
                "status": "ok" if available else "unavailable",
                "unavailable_reason": None if available else entry.get("unavailable_reason"),
            }
        )
    return result


def feed_metadata() -> dict:
    return {
        "provider": settings.MARKET_QUOTES_PROVIDER,
        "is_realtime": settings.MARKET_QUOTES_REALTIME,
        "refresh_interval_seconds": settings.MARKET_QUOTES_REFRESH_SECONDS,
        "stale_after_seconds": settings.MARKET_QUOTES_STALE_AFTER_SECONDS,
        "data_delay_note": (
            "Real-time quotes"
            if settings.MARKET_QUOTES_REALTIME
            else "Delayed quotes (typically 15-20 min, varies by exchange), refreshed periodically"
        ),
    }


async def load_cached_entries() -> dict[str, dict]:
    raw = await redis_client.get_client().get(CACHE_KEY)
    return json.loads(raw) if raw else {}


async def get_latest(*, now: datetime | None = None) -> dict:
    """The dashboard payload. Never touches the network."""
    try:
        entries = await load_cached_entries()
        cache_error = None
    except Exception:  # noqa: BLE001 — Redis down: report it, don't 500 the dashboard
        logger.warning("Market quote cache unreadable", exc_info=True)
        entries, cache_error = {}, "Market data cache unreachable"
    quotes = present(entries, now=now)
    if cache_error:
        for quote in quotes:
            quote["unavailable_reason"] = cache_error
    return {**feed_metadata(), "generated_at": (now or _utcnow()).isoformat(), "quotes": quotes}


def is_weekend_closure(now: datetime) -> bool:
    """Saturday, or Sunday before 21:00 UTC: every tracked exchange is closed (the
    first to reopen, Tokyo/Hong Kong, open late Sunday UTC)."""
    weekday = now.weekday()
    return weekday == 5 or (weekday == 6 and now.hour < 21)


async def refresh_quotes(*, now: datetime | None = None, publish: bool = True) -> dict:
    """Fetch every configured index once, update the cache, publish the result.

    The provider call is blocking network I/O, so it runs in a worker thread.
    """
    now = now or _utcnow()
    if not settings.MARKET_QUOTES_ENABLED:
        return {"refreshed": False, "reason": "disabled"}
    if settings.MARKET_QUOTES_SKIP_WEEKENDS and is_weekend_closure(now):
        return {"refreshed": False, "reason": "weekend_closure"}

    symbols = [index.symbol for index in GLOBAL_INDICES]
    try:
        provider = get_provider(settings.MARKET_QUOTES_PROVIDER)
        quotes = await asyncio.to_thread(provider.fetch_latest_quotes, symbols)
    except ProviderError as exc:
        logger.warning("Global index quote refresh failed: %s", exc)
        quotes = [LatestQuote(symbol=s, error=str(exc)) for s in symbols]

    client = redis_client.get_client()
    previous = await load_cached_entries()
    merged = merge_refresh(previous, quotes, now)
    await client.set(CACHE_KEY, json.dumps(merged))

    presented = present(merged, now=now)
    if publish:
        await ws_events.publish_market_quotes(quotes=presented, metadata=feed_metadata())
    ok = sum(1 for q in presented if q["status"] == "ok")
    return {"refreshed": True, "available": ok, "unavailable": len(presented) - ok}


async def request_refresh_if_idle() -> bool:
    """Called when the dashboard finds no fresh data: enqueue ONE refresh, at most once
    a minute across all users (a Redis NX lock), instead of polling from requests."""
    try:
        acquired = await redis_client.get_client().set(_REFRESH_LOCK_KEY, "1", nx=True, ex=60)
    except Exception:  # noqa: BLE001
        return False
    if not acquired:
        return False
    try:
        from app.worker.tasks import refresh_global_index_quotes

        refresh_global_index_quotes.delay()
    except Exception:  # noqa: BLE001 — broker down; the widget already says unavailable
        logger.warning("Could not enqueue a global index quote refresh", exc_info=True)
        return False
    return True
