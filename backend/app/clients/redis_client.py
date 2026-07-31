"""Redis async client lifecycle (redis-py asyncio).

A single connection pool is shared process-wide.
"""

from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import settings

_client: aioredis.Redis | None = None


def get_client() -> aioredis.Redis:
    """Return the process-wide async Redis client, creating it on first use."""
    global _client
    if _client is None:
        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _client


async def verify_connectivity() -> None:
    """Raise if Redis is unreachable. Used by the health probe."""
    client = get_client()
    if not await client.ping():
        raise ConnectionError("Redis PING did not return PONG")


async def close_client() -> None:
    """Close the client on application shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
