"""Market-data refreshes run on their own queue so a long sweep on the default
queue can't freeze dashboard prices (a solo-pool worker runs one task at a time)."""

from __future__ import annotations

import app.worker.tasks  # noqa: F401  (registers every task)
from app.worker.celery_app import REALTIME_QUEUE, celery_app

_MARKET_TASKS = (
    "refresh_global_index_quotes",
    "refresh_screener_data",
    "refresh_strategy_signals",
    "refresh_macro_data",
)
_LONG_TASKS = (
    "run_failure_monitor_sweep",
    "refresh_market_universe",
    "ingest_market_data",
    "run_evolution",
    "run_strategy_validation",
)


def test_market_refreshes_route_to_realtime_queue():
    for name in _MARKET_TASKS:
        assert name in celery_app.tasks
        assert celery_app.amqp.router.route({}, name)["queue"].name == REALTIME_QUEUE


def test_long_running_tasks_stay_off_the_realtime_queue():
    for name in _LONG_TASKS:
        assert name in celery_app.tasks
        assert celery_app.amqp.router.route({}, name)["queue"].name == "celery"
