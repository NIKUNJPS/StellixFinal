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

# Market-data refreshes run on their own queue, served by their own worker:
#   celery -A app.worker.celery_app.celery_app worker -Q realtime -n realtime@%h --pool=solo
# A solo-pool worker runs one task at a time, so on a shared queue a 10-minute nightly
# sweep froze every price on the dashboard until it finished. Everything else stays on
# the default "celery" queue.
REALTIME_QUEUE = "realtime"
REALTIME_TASKS = (
    "refresh_global_index_quotes",
    "refresh_screener_data",
    "refresh_strategy_signals",
    "refresh_macro_data",
    # Batch 31: price alerts must not wait behind a long sweep on the default queue.
    "check_price_alerts",
)
celery_app.conf.task_routes = {name: {"queue": REALTIME_QUEUE} for name in REALTIME_TASKS}

# Daily failure-monitor sweep (Batch 6). Requires a `celery beat` process running:
#   celery -A app.worker.celery_app.celery_app beat --loglevel=INFO
celery_app.conf.beat_schedule = {
    "daily-failure-monitor": {
        "task": "run_failure_monitor_sweep",
        "schedule": crontab(hour=2, minute=0),
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
    # Batch 25: delayed global index quotes for the dashboard, every
    # MARKET_QUOTES_REFRESH_SECONDS. The task itself skips weekend closures.
    "global-index-quotes": {
        "task": "refresh_global_index_quotes",
        "schedule": float(settings.MARKET_QUOTES_REFRESH_SECONDS),
    },
    # Batch 30 (ADR 0009): settle multi-agent desk calls whose holding window has
    # traded — after the daily market refresh so the latest close is available.
    "nightly-agent-settlement": {
        "task": "settle_agent_analyses",
        "schedule": crontab(day_of_week="1-5", hour=23, minute=15),
    },
    # Batch 31 (ADR 0010): Market Terminal price alerts, every minute.
    "terminal-price-alerts": {
        "task": "check_price_alerts",
        "schedule": 60.0,
    },
    # Batch 31: pre-load FINRA's daily short-volume files (published each morning ET)
    # so short-volume requests read Redis instead of downloading megabytes on demand.
    "terminal-finra-warm": {
        "task": "warm_terminal_caches",
        "schedule": crontab(day_of_week="1-5", hour=13, minute=0),
    },
    "daily-market-refresh": {
        "task": "refresh_market_universe",
        "schedule": crontab(day_of_week="1-5", hour=22, minute=30),
    },
    # Batch 26 Part B: re-evaluate Buy/Sell/Hold signals for every genuinely-Active
    # strategy.
    "strategy-signals-refresh": {
        "task": "refresh_strategy_signals",
        "schedule": float(settings.STRATEGY_SIGNALS_REFRESH_SECONDS),
    },
    # Batch 28: FRED macro series (yield curve, VIX) update once a day at most —
    # polling faster would add load without adding freshness. The task itself is a
    # no-op when FRED_API_KEY is unset.
    "macro-data-refresh": {
        "task": "refresh_macro_data",
        "schedule": float(settings.FRED_REFRESH_SECONDS),
    },
    # Batch 28: market screener (feeds both the Screener table and the Sector
    # Heatmap) — one batched provider call.
    "screener-refresh": {
        "task": "refresh_screener_data",
        "schedule": float(settings.MARKET_SCREENER_REFRESH_SECONDS),
    },
}
