"""TTL cache with an honest stale fallback for global terminal data (ADR 0010).

Contract for every cached payload (the "envelope"):

    {"data", "source", "delay_note", "fetched_at", "stale", "age_seconds"}

* Fresh (younger than ``ttl``): served from Redis, no upstream call.
* Expired: refetched. If the refetch fails, the last good value is served with
  ``stale: true`` and its real age — never presented as fresh. With no good value at
  all, the error propagates (the route turns it into a clean 502/503).
* A per-key lock ("single flight") stops a burst of requests all hitting the upstream.

Redis being down degrades to calling the source directly (uncached), never to an error:
the cache is an optimisation, not a dependency. Every blocking source call runs in a
worker thread with a timeout, so the event loop is never blocked.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from app.clients import redis_client
from app.core.config import settings

logger = logging.getLogger(__name__)

_PREFIX = "terminal:"
# How long a last-good value is kept for the stale fallback, beyond its TTL.
_STALE_KEEP_SECONDS = 7 * 24 * 3600
_LOCK_SECONDS = 30


class SourceUnavailable(Exception):
    """A data source failed and there is no last-good value to fall back on."""


class SourceNotConfigured(Exception):
    """The source needs a credential the deployment has not set (deferred credential)."""


def _now() -> datetime:
    return datetime.now(UTC)


async def run_blocking(fn: Callable[..., Any], *args: Any, timeout: float | None = None, **kwargs: Any) -> Any:
    """Run a blocking source call in a worker thread, bounded by a timeout."""
    return await asyncio.wait_for(
        asyncio.to_thread(fn, *args, **kwargs), timeout=timeout or settings.TERMINAL_SOURCE_TIMEOUT_SECONDS
    )


def _envelope(data: Any, source: str, delay_note: str, fetched_at: datetime, stale: bool) -> dict:
    return {
        "data": data,
        "source": source,
        "delay_note": delay_note,
        "fetched_at": fetched_at.isoformat(),
        "stale": stale,
        "age_seconds": max(0, int((_now() - fetched_at).total_seconds())),
    }


async def _redis_get(key: str) -> dict | None:
    try:
        raw = await redis_client.get_client().get(_PREFIX + key)
    except Exception:  # noqa: BLE001 — cache is optional
        logger.debug("terminal cache read failed for %s", key, exc_info=True)
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


async def _redis_set(key: str, value: dict) -> None:
    try:
        await redis_client.get_client().set(_PREFIX + key, json.dumps(value, default=str), ex=_STALE_KEEP_SECONDS)
    except Exception:  # noqa: BLE001
        logger.debug("terminal cache write failed for %s", key, exc_info=True)


async def _acquire(key: str) -> bool:
    try:
        return bool(await redis_client.get_client().set(_PREFIX + "lock:" + key, "1", nx=True, ex=_LOCK_SECONDS))
    except Exception:  # noqa: BLE001 — no Redis: no single-flight, just fetch
        return True


async def _release(key: str) -> None:
    try:
        await redis_client.get_client().delete(_PREFIX + "lock:" + key)
    except Exception:  # noqa: BLE001
        pass


async def cached(
    key: str,
    *,
    ttl: int,
    fetch: Callable[[], Any],
    source: str,
    delay_note: str,
    timeout: float | None = None,
) -> dict:
    """Return the envelope for ``key``; ``fetch`` is a BLOCKING callable returning data."""
    stored = await _redis_get(key)
    if stored is not None:
        fetched_at = datetime.fromisoformat(stored["fetched_at"])
        if (_now() - fetched_at).total_seconds() < ttl:
            return _envelope(stored["data"], stored["source"], stored["delay_note"], fetched_at, False)

    got_lock = await _acquire(key)
    if not got_lock and stored is not None:
        # Someone else is refreshing right now: serve what we have, honestly aged.
        fetched_at = datetime.fromisoformat(stored["fetched_at"])
        return _envelope(stored["data"], stored["source"], stored["delay_note"], fetched_at, True)
    try:
        data = await run_blocking(fetch, timeout=timeout)
    except SourceNotConfigured:
        raise
    except Exception as exc:  # noqa: BLE001 — any upstream failure → stale fallback
        logger.warning("terminal source %s failed for %s: %s", source, key, exc)
        if stored is not None:
            fetched_at = datetime.fromisoformat(stored["fetched_at"])
            return _envelope(stored["data"], stored["source"], stored["delay_note"], fetched_at, True)
        raise SourceUnavailable(f"{source} is unavailable right now ({type(exc).__name__}).") from exc
    finally:
        if got_lock:
            await _release(key)

    fetched_at = _now()
    await _redis_set(key, {"data": data, "source": source, "delay_note": delay_note, "fetched_at": fetched_at.isoformat()})
    return _envelope(data, source, delay_note, fetched_at, False)
