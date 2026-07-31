"""Celery application.

Foundation for background work (PROJECT_CONSTITUTION §2): anything taking longer than
~2 seconds — regime detection runs, GA evolution runs, validation suites — runs here,
never inline in an API request. Concrete tasks are added by the batches that own them;
this module just wires the broker/result backend so the contract is stable.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from celery.signals import setup_logging

from app.core.config import settings


# Celery's default worker behavior ("worker_hijack_root_logger") replaces the
# root logger's handlers with its own on startup, which would silently undo
# app.core.logging's structlog configuration. Connecting to `setup_logging` is
# Celery's own documented escape hatch: it fully replaces Celery's default
# logging setup with whatever this receiver does instead (Batch 13, so every
# worker-process log line — same as the API process — is structured and
# request_id/organization_id-tagged).
@setup_logging.connect
def _configure_worker_logging(**_kwargs: object) -> None:
    from app.core.logging import configure_logging

    configure_logging()


celery_app = Celery(
    "stellix",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    # Import task modules so the worker registers them on startup.
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# Daily failure-monitor sweep (Batch 6). Requires a `celery beat` process running:
#   celery -A app.worker.celery_app.celery_app beat --loglevel=INFO
celery_app.conf.beat_schedule = {
    "daily-failure-monitor": {
        "task": "run_failure_monitor_sweep",
        "schedule": crontab(hour=2, minute=0),
    },
    # Batch 7: nightly Postgres <-> Neo4j drift check (orphaned nodes, sync gaps,
    # missing lineage edges). Logs data-quality signals only, never auto-fixes.
    "nightly-graph-consistency": {
        "task": "run_graph_consistency_sweep",
        "schedule": crontab(hour=3, minute=0),
    },
    # Batch 12: System Monitoring's Celery-worker health card checks freshness
    # of this timestamp — a plain float schedule (not crontab) means "every
    # 60 seconds", Celery's standard way to express a fixed-interval beat.
    "system-heartbeat": {
        "task": "system_heartbeat",
        "schedule": 60.0,
    },
    # Batch 22: weekly digest — Monday 08:00 UTC. day_of_week=1 is Monday. Delivers
    # over the webhook/log notification channel (no SMTP); skips opted-out orgs.
    "weekly-digest": {
        "task": "send_weekly_digests",
        "schedule": crontab(day_of_week=1, hour=8, minute=0),
    },
    # Continuous data integration: keep every active org's tracked symbols current
    # with the market each trading day, and recompute regimes where a new bar landed.
    # 22:30 UTC is after the US cash-equity close (16:00 ET / 20:00-21:00 UTC), so the
    # day's closing bar is available. On weekends/holidays the sweep runs but finds no
    # new bars and skips the (expensive) regime recompute — see market_refresh.py.
    # Mon-Fri only (day_of_week="1-5"): no US session Sat/Sun.
    "daily-market-refresh": {
        "task": "refresh_market_universe",
        "schedule": crontab(day_of_week="1-5", hour=22, minute=30),
    },
}
