"""Celery-side request_id/context propagation (Batch 13).

Decorate every task body with @with_log_context (innermost decorator, applied
directly to the raw function, with @celery_app.task wrapping it). Each Celery
worker process is long-lived and reused across many tasks, so on every
invocation this:

  - clears any leftover contextvars from whatever task this same process ran
    previously
  - binds request_id — the value propagated from the API request that
    enqueued this task (via app.core.logging.get_current_request_id() at the
    .delay() call site), or a fresh uuid4 when there was none (e.g. a
    celery-beat-scheduled task with no upstream HTTP request)
  - binds organization_id when the task carries one
  - binds task_name for log filtering
  - always clears contextvars again in `finally`, so nothing leaks into the
    next task this worker process happens to pick up

Uses inspect.signature to read request_id/organization_id regardless of
whether a given call site passed them positionally or by keyword.
"""

from __future__ import annotations

import functools
import inspect
import uuid as uuid_module
from collections.abc import Callable
from typing import Any, TypeVar

import structlog

F = TypeVar("F", bound=Callable[..., Any])


def with_log_context(func: F) -> F:
    signature = inspect.signature(func)

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        structlog.contextvars.clear_contextvars()
        try:
            bound_args = signature.bind_partial(*args, **kwargs).arguments
        except TypeError:
            bound_args = {}

        context: dict[str, Any] = {
            "request_id": bound_args.get("request_id") or str(uuid_module.uuid4()),
            "task_name": func.__name__,
        }
        organization_id = bound_args.get("organization_id")
        if organization_id:
            context["organization_id"] = organization_id
        structlog.contextvars.bind_contextvars(**context)

        try:
            return func(*args, **kwargs)
        finally:
            structlog.contextvars.clear_contextvars()

    return wrapper  # type: ignore[return-value]
