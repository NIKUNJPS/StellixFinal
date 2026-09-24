"""Macro dashboard — Treasury yield curve + VIX from FRED (Batch 28).

Honesty contract (same discipline as ``market_quotes.py`` / Batch 25):
* FRED publishes most series with a ONE-DAY lag at best (yields/VIX are end-of-day
  closes, released the next business day) — never labeled "real-time". Each point
  carries the real ``obs_date`` FRED assigned it and the ``fetched_at`` time we last
  refreshed successfully.
* Unset ``FRED_API_KEY`` -> every series reports ``status: "not_configured"``, never
  a fabricated number. A FRED-side error for one series never blocks the others.
* Scope: global public macro data, not tenant data — cached under a non-org Redis
  key and broadcast on the realtime bridge's GLOBAL scope (Batch 25 precedent).

Flow: celery beat -> ``refresh_macro_data`` task -> ``refresh_macro`` ->
fred_client.fetch_series/fetch_latest (one call per series) -> Redis cache -> publish
``macro_update`` on the existing Redis pub/sub bridge -> browser sockets.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.clients import redis_client
from app.core.config import settings
from app.providers.fred_client import FredError, fetch_series
from app.ws import events as ws_events

logger = logging.getLogger(__name__)

CACHE_KEY = "market:macro:latest"


@dataclass(frozen=True)
class SeriesDefinition:
    series_id: str
    label: str
    group: str  # "yield_curve" | "volatility"
    unit: str


# Real FRED series ids (Treasury Constant Maturity daily yields + CBOE VIX close),
# each part of FRED's own long-standing published catalog — not derived/scraped.
YIELD_CURVE_SERIES: tuple[SeriesDefinition, ...] = (
    SeriesDefinition("DGS1MO", "1 Month", "yield_curve", "%"),
    SeriesDefinition("DGS3MO", "3 Month", "yield_curve", "%"),
    SeriesDefinition("DGS6MO", "6 Month", "yield_curve", "%"),
    SeriesDefinition("DGS1", "1 Year", "yield_curve", "%"),
    SeriesDefinition("DGS2", "2 Year", "yield_curve", "%"),
    SeriesDefinition("DGS5", "5 Year", "yield_curve", "%"),
    SeriesDefinition("DGS10", "10 Year", "yield_curve", "%"),
    SeriesDefinition("DGS30", "30 Year", "yield_curve", "%"),
)
INDICATOR_SERIES: tuple[SeriesDefinition, ...] = (
    SeriesDefinition("VIXCLS", "CBOE Volatility Index (VIX)", "volatility", "index"),
)
ALL_SERIES: tuple[SeriesDefinition, ...] = YIELD_CURVE_SERIES + INDICATOR_SERIES
_BY_ID = {s.series_id: s for s in ALL_SERIES}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _fetch_one(series_id: str) -> dict:
    """Blocking; run in a worker thread. Never raises — a per-series failure is
    captured as a status the caller can render honestly."""
    definition = _BY_ID[series_id]
    try:
        points = fetch_series(settings.FRED_API_KEY, series_id, limit=260)
    except FredError as exc:
        status = "not_configured" if not settings.FRED_API_KEY else "error"
        return {
            "series_id": series_id,
            "label": definition.label,
            "group": definition.group,
            "unit": definition.unit,
            "status": status,
            "error": str(exc),
            "points": [],
            "latest_value": None,
            "latest_date": None,
        }
    real_points = [p for p in points if p.value is not None]
    latest = real_points[-1] if real_points else None
    return {
        "series_id": series_id,
        "label": definition.label,
        "group": definition.group,
        "unit": definition.unit,
        "status": "ok" if real_points else "no_data",
        "error": None if real_points else "FRED returned no usable observations",
        "points": [{"date": p.obs_date.isoformat(), "value": p.value} for p in real_points],
        "latest_value": latest.value if latest else None,
        "latest_date": latest.obs_date.isoformat() if latest else None,
    }


async def _fetch_all() -> dict[str, dict]:
    results = await asyncio.gather(*(asyncio.to_thread(_fetch_one, s.series_id) for s in ALL_SERIES))
    return {r["series_id"]: r for r in results}


def feed_metadata() -> dict:
    return {
        "configured": bool(settings.FRED_API_KEY),
        "source": "FRED (Federal Reserve Bank of St. Louis)",
        "refresh_interval_seconds": settings.FRED_REFRESH_SECONDS,
        "data_delay_note": (
            "End-of-day values, typically available the next business day — not real-time."
        ),
    }


async def load_cached_series() -> dict[str, dict]:
    raw = await redis_client.get_client().get(CACHE_KEY)
    return json.loads(raw) if raw else {}


async def get_latest() -> dict:
    """The macro dashboard payload. Never touches the network."""
    try:
        series = await load_cached_series()
        cache_error = None
    except Exception:  # noqa: BLE001 — Redis down: report it, don't 500 the page
        logger.warning("Macro data cache unreadable", exc_info=True)
        series, cache_error = {}, "Macro data cache unreachable"

    if not settings.FRED_API_KEY:
        # Not configured beats any cached leftovers from a since-removed key.
        series = {
            s.series_id: {
                "series_id": s.series_id, "label": s.label, "group": s.group, "unit": s.unit,
                "status": "not_configured", "error": "FRED_API_KEY is not set", "points": [],
                "latest_value": None, "latest_date": None,
            }
            for s in ALL_SERIES
        }
    elif cache_error:
        for entry in series.values():
            entry["error"] = cache_error

    ordered = [series.get(s.series_id) or {"series_id": s.series_id, "label": s.label,
               "group": s.group, "unit": s.unit, "status": "no_data", "error": "Not yet refreshed",
               "points": [], "latest_value": None, "latest_date": None}
               for s in ALL_SERIES]
    return {**feed_metadata(), "generated_at": _utcnow().isoformat(), "series": ordered}


async def refresh_macro(*, publish: bool = True) -> dict:
    """Fetch every configured series once, update the cache, publish the result."""
    if not settings.FRED_API_KEY:
        return {"refreshed": False, "reason": "not_configured"}

    fetched = await _fetch_all()
    client = redis_client.get_client()
    await client.set(CACHE_KEY, json.dumps(fetched))

    if publish:
        payload = await get_latest()
        await ws_events.publish_macro_update(series=payload["series"], metadata=feed_metadata())

    ok = sum(1 for v in fetched.values() if v["status"] == "ok")
    return {"refreshed": True, "ok": ok, "failed": len(fetched) - ok}
