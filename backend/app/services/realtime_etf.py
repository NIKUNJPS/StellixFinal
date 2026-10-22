"""Real-time US ETF prices from Alpaca's IEX feed.

Honesty contract (read before changing anything here):
* These are real trades from ONE exchange (IEX, a few percent of US volume). They are
  genuinely real-time, but they are not the consolidated tape — the UI says so.
* The widget shows ETFs as ETFs ("SPY — tracks the S&P 500"), never as the index
  value itself. Real-time index values are licensed data this platform doesn't have.
* Nothing is interpolated between trades. Every price carries the timestamp of the
  trade it came from, and the payload reports whether the streamer is actually
  connected, so a price that stopped moving is never presented as live.

Flow: ``python -m app.streaming.etf_stream`` (one long-running process) -> Alpaca
websocket -> this module's cache (Redis) -> ``etf_ticks`` on the global realtime
bridge -> browser. ``GET /market/realtime-etfs`` only ever reads the cache.

Public market data, not tenant data: a non-org Redis key, global WS scope.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime

import requests

from app.clients import redis_client
from app.core.config import settings
from app.ws import events as ws_events

CACHE_KEY = "market:etf_realtime:latest"
HEARTBEAT_KEY = "market:etf_realtime:heartbeat"
HEARTBEAT_TTL_SECONDS = 15

PROVIDER_LABEL = "Alpaca · IEX feed"
DATA_NOTE = "Real-time trades from the IEX exchange only (a few % of US volume) — not the consolidated tape"


@dataclass(frozen=True)
class EtfDefinition:
    symbol: str
    name: str
    tracks: str


REALTIME_ETFS: tuple[EtfDefinition, ...] = (
    EtfDefinition("SPY", "SPDR S&P 500 ETF Trust", "S&P 500"),
    EtfDefinition("QQQ", "Invesco QQQ Trust", "Nasdaq-100"),
    EtfDefinition("DIA", "SPDR Dow Jones Industrial Average ETF", "Dow Jones Industrial Average"),
    EtfDefinition("IWM", "iShares Russell 2000 ETF", "Russell 2000"),
)
SYMBOLS: tuple[str, ...] = tuple(etf.symbol for etf in REALTIME_ETFS)
_BY_SYMBOL = {etf.symbol: etf for etf in REALTIME_ETFS}

_FRACTION = re.compile(r"\.(\d+)")


def is_configured() -> bool:
    return bool(settings.ALPACA_API_KEY_ID and settings.ALPACA_API_SECRET_KEY)


def parse_timestamp(value: str) -> datetime:
    """Alpaca sends RFC 3339 with up to nanosecond precision; Python parses at most
    microseconds, so the fraction is truncated to 6 digits (never rounded)."""
    return datetime.fromisoformat(_FRACTION.sub(lambda m: "." + m.group(1)[:6], value, count=1))


def _with_change(entry: dict) -> dict:
    last, prev = entry.get("last_price"), entry.get("previous_close")
    if last is None or not prev:
        entry["change"] = entry["change_pct"] = None
    else:
        entry["change"] = round(last - prev, 2)
        entry["change_pct"] = round((last - prev) / prev * 100.0, 3)
    return entry


def parse_snapshots(raw: dict) -> dict[str, dict]:
    """Seed entries from Alpaca's ``/v2/stocks/snapshots`` response: the previous
    session's close (the baseline for the day's change) and the latest trade."""
    entries: dict[str, dict] = {}
    for etf in REALTIME_ETFS:
        snap = raw.get(etf.symbol) or {}
        trade = snap.get("latestTrade") or {}
        prev_bar = snap.get("prevDailyBar") or {}
        entries[etf.symbol] = _with_change(
            {
                "symbol": etf.symbol,
                "last_price": trade.get("p"),
                "last_trade_at": parse_timestamp(trade["t"]).isoformat() if trade.get("t") else None,
                "previous_close": prev_bar.get("c"),
            }
        )
    return entries


def fetch_snapshots() -> dict[str, dict]:
    """One REST call for every ETF. Blocking — callers run it in a thread."""
    response = requests.get(
        f"{settings.ALPACA_DATA_URL.rstrip('/')}/v2/stocks/snapshots",
        params={"symbols": ",".join(SYMBOLS), "feed": "iex"},
        headers={
            "APCA-API-KEY-ID": settings.ALPACA_API_KEY_ID or "",
            "APCA-API-SECRET-KEY": settings.ALPACA_API_SECRET_KEY or "",
        },
        timeout=10,
    )
    response.raise_for_status()
    return parse_snapshots(response.json())


def merge_snapshot(entries: dict[str, dict], snapshot: dict[str, dict]) -> dict[str, dict]:
    """Fold a (re-)fetched snapshot in: always take the fresh previous close (it rolls
    over each session), but keep a streamed trade if it's newer than the snapshot's."""
    for symbol, snap in snapshot.items():
        entry = entries.setdefault(symbol, {"symbol": symbol})
        entry["previous_close"] = snap.get("previous_close")
        snap_at, shown_at = snap.get("last_trade_at"), entry.get("last_trade_at")
        if snap_at and (not shown_at or datetime.fromisoformat(snap_at) > datetime.fromisoformat(shown_at)):
            entry["last_price"] = snap.get("last_price")
            entry["last_trade_at"] = snap_at
        _with_change(entry)
    return entries


def apply_trade(entries: dict[str, dict], symbol: str, price: float, timestamp: str) -> bool:
    """Fold one trade into the entries. Returns True if the displayed state changed.

    A trade older than the one already shown is ignored — messages can arrive out of
    order, and an older print must never overwrite a newer one."""
    if symbol not in _BY_SYMBOL:
        return False
    traded_at = parse_timestamp(timestamp)
    entry = entries.setdefault(symbol, {"symbol": symbol, "previous_close": None})
    shown_at = entry.get("last_trade_at")
    if shown_at and traded_at < datetime.fromisoformat(shown_at):
        return False
    entry["last_price"] = price
    entry["last_trade_at"] = traded_at.isoformat()
    _with_change(entry)
    return True


def present(entries: dict[str, dict]) -> list[dict]:
    """Every tracked ETF, in display order, with an explicit availability flag."""
    result = []
    for etf in REALTIME_ETFS:
        entry = entries.get(etf.symbol) or {}
        available = entry.get("last_price") is not None
        result.append(
            {
                "symbol": etf.symbol,
                "name": etf.name,
                "tracks": etf.tracks,
                "last_price": entry.get("last_price"),
                "previous_close": entry.get("previous_close"),
                "change": entry.get("change"),
                "change_pct": entry.get("change_pct"),
                "last_trade_at": entry.get("last_trade_at"),
                "status": "ok" if available else "unavailable",
                "unavailable_reason": None if available else "No trade received yet",
            }
        )
    return result


def feed_metadata(*, stream_online: bool) -> dict:
    return {
        "configured": is_configured(),
        "stream_online": stream_online,
        "provider": PROVIDER_LABEL,
        "data_note": DATA_NOTE,
    }


async def load_entries() -> dict[str, dict]:
    raw = await redis_client.get_client().get(CACHE_KEY)
    return json.loads(raw) if raw else {}


async def save(entries: dict[str, dict]) -> None:
    await redis_client.get_client().set(CACHE_KEY, json.dumps(entries))


async def save_and_publish(entries: dict[str, dict]) -> None:
    await save(entries)
    await ws_events.publish_etf_ticks(present(entries), feed_metadata(stream_online=True))


async def mark_stream_alive() -> None:
    await redis_client.get_client().set(HEARTBEAT_KEY, "1", ex=HEARTBEAT_TTL_SECONDS)


async def get_latest() -> dict:
    """The dashboard payload. Never touches the network."""
    client = redis_client.get_client()
    entries = await load_entries()
    stream_online = bool(await client.get(HEARTBEAT_KEY))
    return {
        **feed_metadata(stream_online=stream_online),
        "generated_at": datetime.now(UTC).isoformat(),
        "etfs": present(entries),
    }
