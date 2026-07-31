"""Health-check service: probes Postgres, Neo4j, and Redis connectivity.

Each probe is independent and measured; one failing dependency does not prevent the
others from being reported. Probes run concurrently. This is the foundation of the
System Monitoring page, so per-service detail and latency are captured from day one.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable

from sqlalchemy import text

from app.clients import neo4j_client, redis_client
from app.db.session import get_system_session
from app.schemas.health import HealthResponse, ServiceHealth, ServiceStatus


async def _check_postgres() -> None:
    # Unscoped system session: a connectivity probe, touches no tenant data.
    async with get_system_session() as session:
        await session.execute(text("SELECT 1"))


async def _timed_probe(probe: Callable[[], Awaitable[None]]) -> ServiceHealth:
    start = time.perf_counter()
    try:
        await probe()
    except Exception as exc:  # noqa: BLE001 - report any failure as service error
        elapsed = (time.perf_counter() - start) * 1000
        return ServiceHealth(
            status=ServiceStatus.ERROR,
            latency_ms=round(elapsed, 2),
            detail=f"{type(exc).__name__}: {exc}",
        )
    elapsed = (time.perf_counter() - start) * 1000
    return ServiceHealth(status=ServiceStatus.OK, latency_ms=round(elapsed, 2))


async def check_health() -> HealthResponse:
    """Probe all backing services concurrently and aggregate the result."""
    postgres, neo4j, redis = await asyncio.gather(
        _timed_probe(_check_postgres),
        _timed_probe(neo4j_client.verify_connectivity),
        _timed_probe(redis_client.verify_connectivity),
    )

    overall = (
        ServiceStatus.OK
        if all(s.status is ServiceStatus.OK for s in (postgres, neo4j, redis))
        else ServiceStatus.ERROR
    )
    return HealthResponse(status=overall, postgres=postgres, neo4j=neo4j, redis=redis)


async def check_readiness() -> bool:
    """Batch 13: Postgres + Redis only — deliberately excludes Neo4j (the
    whole graph layer already degrades gracefully everywhere it's read, so a
    Neo4j outage isn't "can't serve real requests") and Celery (async by
    design; an API request doesn't need a live worker to be servable).
    True means this process can actually serve a real request right now."""
    postgres, redis = await asyncio.gather(
        _timed_probe(_check_postgres),
        _timed_probe(redis_client.verify_connectivity),
    )
    return postgres.status is ServiceStatus.OK and redis.status is ServiceStatus.OK
