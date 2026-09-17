"""Redis async client lifecycle (redis-py asyncio).

A single connection pool is shared process-wide — per event loop.

Batch 25 fix: an asyncio Redis pool is bound to the event loop its connections were
opened on. The API process runs one loop forever, but every Celery task runs in its
own ``asyncio.run()`` loop (app/worker/tasks.py). Reusing the first task's client in a
later task raised "Event loop is closed" inside ``ws.events._publish``, which swallows
errors by design — so every realtime event published by a worker process after its
first task was silently dropped. The client is now recreated whenever the running
loop changes (the same reasoning ``db.session.dispose_engine`` applies to asyncpg).
"""

from __future__ import annotations

import asyncio

import redis.asyncio as aioredis

from app.core.config import settings

_client: aioredis.Redis | None = None
_client_loop: asyncio.AbstractEventLoop | None = None


def _running_loop() -> asyncio.AbstractEventLoop | None:
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        return None


def get_client() -> aioredis.Redis:
    """Return the async Redis client for the current event loop, creating it on first use."""
    global _client, _client_loop
    loop = _running_loop()
    if _client is None or (loop is not None and _client_loop is not None and loop is not _client_loop):
        # A client from a previous (now closed) loop cannot be closed from this one;
        # dropping the reference lets it be garbage-collected.
        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        _client_loop = loop
    elif _client_loop is None:
        _client_loop = loop
    return _client


async def verify_connectivity() -> None:
    """Raise if Redis is unreachable. Used by the health probe."""
    client = get_client()
    if not await client.ping():
        raise ConnectionError("Redis PING did not return PONG")


async def close_client() -> None:
    """Close the client on application shutdown."""
    global _client, _client_loop
    if _client is not None:
        if _client_loop is None or _client_loop is _running_loop():
            await _client.aclose()
        _client = None
        _client_loop = None
