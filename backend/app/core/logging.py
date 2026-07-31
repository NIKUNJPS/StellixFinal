"""Structured logging (Batch 13).

structlog is configured *downstream* of the standard library's own logging
module rather than replacing it: every pre-existing `logging.getLogger(__name__)`
call site across the codebase (nearly every service module in Batches 1-12)
gets structured (JSON in production, colorized console in dev) output and
automatic contextvar merging for free, with zero call-site changes. This is
structlog's own documented integration recipe for an app that already uses
stdlib logging everywhere.

Call `configure_logging()` once per process — both the FastAPI app
(app.main.create_app) and each Celery worker process (via the
`celeryd_after_setup`/`setup_logging` signal in app.worker.celery_app) need
their own call, since they are separate OS processes.
"""

from __future__ import annotations

import logging
import sys

import structlog

from app.core.config import settings

# Shared by both structlog-native loggers (via structlog.configure) and
# stdlib-originated records (via ProcessorFormatter's foreign_pre_chain) so
# every log line gets the same timestamp/level/contextvars regardless of
# which logging API produced it.
_SHARED_PROCESSORS: list[structlog.types.Processor] = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.add_log_level,
    structlog.processors.TimeStamper(fmt="iso", utc=True),
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
]

_configured = False


def configure_logging() -> None:
    global _configured
    if _configured:
        return

    structlog.configure(
        processors=[
            *_SHARED_PROCESSORS,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer()
        if settings.is_production
        else structlog.dev.ConsoleRenderer(colors=True)
    )
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=_SHARED_PROCESSORS,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(settings.LOG_LEVEL)

    _configured = True


def get_current_request_id() -> str | None:
    """The request_id currently bound in structlog's contextvars, or None.

    Works identically whether called from a FastAPI route (bound by
    RequestIDMiddleware) or from inside an already-running Celery task (bound
    by app.worker.logging_context.with_log_context) — this uniformity is what
    lets request_id propagate across an arbitrarily deep task -> task chain
    with no special-casing at each call site.
    """
    return structlog.contextvars.get_contextvars().get("request_id")
