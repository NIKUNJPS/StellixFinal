"""Custom business metrics (Batch 13).

Automatic HTTP metrics (request count, latency histograms, status code
breakdown) come from prometheus-fastapi-instrumentator, wired in app/main.py
— not hand-rolled. These are the metrics instrumentator can't know about:
domain events instrumented directly at the service-layer call site where each
one actually happens, plus two gauges recomputed periodically (see
refresh_gauge_metrics) rather than incremented/decremented at each of their
many change-triggering call sites, to avoid drift from a missed update at any
one of them.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge

strategies_created_total = Counter(
    "strategies_created_total",
    "Total strategies created, any creator (human, llm_generated, ga_engine)",
)
validations_run_total = Counter(
    "validations_run_total",
    "Total 5-method validation suite runs",
)
evolution_runs_total = Counter(
    "evolution_runs_total",
    "Total evolution (GA) runs started",
)
llm_calls_total = Counter(
    "llm_calls_total",
    "Total LLM tool-use calls",
    ["function_name"],
)
failures_detected_total = Counter(
    "failures_detected_total",
    "Total strategy failures detected",
    ["trigger_condition"],
)
active_strategies_gauge = Gauge(
    "active_strategies_gauge",
    "Current count of strategies with status=active, across all organizations",
)
celery_queue_pending_gauge = Gauge(
    "celery_queue_pending_gauge",
    "Pending (reserved+scheduled) Celery tasks by task name",
    ["task_name"],
)
service_health_gauge = Gauge(
    "service_health_gauge",
    "1 if the service's last health probe succeeded, else 0",
    ["service"],
)


async def refresh_gauge_metrics() -> None:
    """Recompute the two self-correcting gauges. Called from the existing
    60s `system_heartbeat` Celery beat task rather than incrementally updated
    at every strategy-status-changing code path (kill switch, /approve, the
    generic /transition endpoint, evolution auto-registration) — fewer update
    sites means no risk of one of them drifting out of sync over time."""
    from sqlalchemy import func, select

    from app.db.session import get_system_session
    from app.models.strategy import Strategy, StrategyStatus
    from app.services.system_health import get_job_queue_counts

    async with get_system_session() as session:
        count = (
            await session.execute(
                select(func.count()).select_from(Strategy).where(Strategy.status == StrategyStatus.ACTIVE)
            )
        ).scalar_one()
    active_strategies_gauge.set(count)

    queue_counts = await get_job_queue_counts()
    for row in queue_counts:
        celery_queue_pending_gauge.labels(task_name=row["task_name"]).set(row["pending"])
