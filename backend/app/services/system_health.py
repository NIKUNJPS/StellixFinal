"""System Monitoring page (Batch 12) — extends Batch 0's /health into a richer,
admin-only view: per-service status/uptime%/response-time, Celery worker
liveness (via a dedicated heartbeat task, not just "is the broker reachable"),
job queue counts, real host resource gauges (psutil), and the Research Memory
index status.

Uptime% is Redis-backed (a ring buffer) rather than a new Postgres table — this is
operational telemetry, not durable business data (see docs/schemas.md
"System health-detailed").
"""

from __future__ import annotations

import json
import time
import uuid
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

import psutil
from sqlalchemy import text

from app.clients import redis_client
from app.core.metrics import service_health_gauge
from app.db.session import get_system_session

_UPTIME_HISTORY_LEN = 100
_HEARTBEAT_KEY = "system:celery_heartbeat"
_HEARTBEAT_STALE_AFTER_SECONDS = 90  # beat schedule is every 60s; allow one missed tick


async def _record_check(service: str, ok: bool) -> float:
    """Push one check result into a capped Redis list; return the uptime% over
    the retained history (most recent `_UPTIME_HISTORY_LEN` checks)."""
    redis = redis_client.get_client()
    key = f"system:uptime:{service}"
    await redis.lpush(key, "1" if ok else "0")
    await redis.ltrim(key, 0, _UPTIME_HISTORY_LEN - 1)
    values = await redis.lrange(key, 0, -1)
    if not values:
        return 100.0 if ok else 0.0
    return round(100.0 * sum(int(v) for v in values) / len(values), 2)


async def _timed_check(service: str, probe: Callable[[], Awaitable[None]]) -> dict:
    start = time.perf_counter()
    detail = None
    try:
        await probe()
        ok = True
    except Exception as exc:  # noqa: BLE001 — report any failure as a service error
        ok = False
        detail = f"{type(exc).__name__}: {exc}"
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    uptime_pct = await _record_check(service, ok)
    service_health_gauge.labels(service=service).set(1 if ok else 0)
    return {
        "status": "ok" if ok else "error",
        "uptime_pct": uptime_pct,
        "last_check": datetime.now(UTC),
        "response_time_ms": elapsed_ms,
        "detail": detail,
    }


async def _check_postgres() -> None:
    async with get_system_session() as session:
        await session.execute(text("SELECT 1"))


async def _check_timescaledb() -> None:
    """Distinct from the plain Postgres check: confirms the extension itself
    is installed, not just that the underlying Postgres server answers."""
    async with get_system_session() as session:
        row = (
            await session.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'"))
        ).first()
        if row is None:
            raise RuntimeError("timescaledb extension is not installed on this database")


async def _check_celery_worker() -> None:
    """Liveness means "a heartbeat task actually ran recently," not merely
    "the broker connection is reachable" — a broker can be up with every
    worker process dead."""
    redis = redis_client.get_client()
    raw = await redis.get(_HEARTBEAT_KEY)
    if raw is None:
        raise RuntimeError("no heartbeat recorded yet (is `celery beat` running?)")
    last_beat = datetime.fromisoformat(raw)
    age = (datetime.now(UTC) - last_beat).total_seconds()
    if age > _HEARTBEAT_STALE_AFTER_SECONDS:
        raise RuntimeError(f"last heartbeat was {int(age)}s ago (stale)")


async def is_worker_online() -> bool | None:
    """Batch 25: True when a Celery heartbeat landed recently, False when it is
    missing or stale, None when Redis itself could not be asked. Lets queued-job
    UIs say "nothing is processing this" instead of spinning forever."""
    try:
        await _check_celery_worker()
    except RuntimeError:
        return False
    except Exception:  # noqa: BLE001 — Redis unreachable: genuinely unknown
        return None
    return True


async def record_heartbeat() -> None:
    """Called by the `system_heartbeat` Celery beat task, every 60s."""
    redis = redis_client.get_client()
    await redis.set(_HEARTBEAT_KEY, datetime.now(UTC).isoformat())


async def get_service_health() -> dict[str, dict]:
    services = {
        "postgres": _check_postgres,
        "timescaledb": _check_timescaledb,
        "redis": redis_client.verify_connectivity,
        "celery_worker": _check_celery_worker,
    }
    return {name: await _timed_check(name, probe) for name, probe in services.items()}


def get_resource_gauges() -> dict:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "memory_percent": memory.percent,
        "memory_used_mb": round(memory.used / (1024 * 1024), 1),
        "memory_total_mb": round(memory.total / (1024 * 1024), 1),
        "disk_percent": disk.percent,
        "disk_used_gb": round(disk.used / (1024**3), 2),
        "disk_total_gb": round(disk.total / (1024**3), 2),
    }


def _flatten_inspect(by_worker: dict | None) -> Counter:
    """`inspect().active()` etc. return {worker_name: [task_dict, ...]} (or None
    if no worker responded). Flatten to a {task_name: count} counter."""
    counts: Counter = Counter()
    for tasks in (by_worker or {}).values():
        for task in tasks:
            counts[task.get("name", "unknown")] += 1
    return counts


async def get_job_queue_counts() -> list[dict]:
    """Active/reserved/scheduled broken down by task name (from `inspect()`,
    which needs a live worker to respond — an empty result means no worker is
    currently up, not an error). Failed count is a single aggregate, not
    broken down by task name: the Redis result-backend's stored payload for a
    failed task (confirmed by inspecting it directly) doesn't include the
    task's name, only its id/status/traceback — getting a real per-task-name
    breakdown would need extra plumbing (e.g. a custom result backend) this
    batch doesn't add."""
    from app.worker.celery_app import celery_app

    inspector = celery_app.control.inspect(timeout=1.0)
    active = _flatten_inspect(inspector.active())
    reserved = _flatten_inspect(inspector.reserved())
    scheduled = _flatten_inspect(inspector.scheduled())

    names = set(active) | set(reserved) | set(scheduled)
    return [
        {
            "task_name": name,
            "active": active.get(name, 0),
            "pending": reserved.get(name, 0) + scheduled.get(name, 0),
        }
        for name in sorted(names)
    ]


async def get_failed_job_count() -> int:
    # Celery's result backend is a DIFFERENT logical Redis DB from the app's own
    # redis_client (CELERY_RESULT_BACKEND vs. REDIS_URL — confirmed distinct in
    # this project's .env, DB 2 vs DB 0) — a dedicated connection, not the
    # shared redis_client.get_client() singleton, which would silently scan
    # the wrong database and always report zero.
    import redis.asyncio as aioredis

    from app.core.config import settings

    backend_client = aioredis.from_url(
        settings.CELERY_RESULT_BACKEND, encoding="utf-8", decode_responses=True
    )
    try:
        failed = 0
        async for key in backend_client.scan_iter("celery-task-meta-*"):
            raw = await backend_client.get(key)
            if not raw:
                continue
            try:
                if json.loads(raw).get("status") == "FAILURE":
                    failed += 1
            except (json.JSONDecodeError, AttributeError):
                continue
        return failed
    finally:
        await backend_client.aclose()


async def get_memory_index_status(organization_id: uuid.UUID) -> dict | None:
    """Research Memory index status for one org: when this process last rebuilt it and
    how many of the org's records it holds. Counts are read from the org's own slice of
    the index, so no other tenant's numbers are ever exposed. None before the first build."""
    from app.graph import memory_index
    from app.graph.sync_service import GraphSyncService

    status = memory_index.last_status()
    if status is None:
        return None
    repo = GraphSyncService().repository
    org = str(organization_id)
    return {
        "rebuilt_at": status["rebuilt_at"],
        "refresh_seconds": status["refresh_seconds"],
        "strategies": await repo.count_nodes(org, node_type="Strategy"),
        "failures": await repo.count_nodes(org, node_type="Failure"),
        "research_notes": await repo.count_nodes(org, node_type="ResearchNote"),
    }
