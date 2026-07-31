"""Celery-side @with_log_context decorator (Batch 13): binds request_id
(propagated or freshly generated), organization_id, and task_name for the
duration of a task, regardless of whether the caller passed them
positionally or by keyword, and always clears afterward — critical since a
Celery worker process is long-lived and reused across many tasks."""

from __future__ import annotations

import uuid

import pytest
import structlog
from app.worker.logging_context import with_log_context


def test_binds_request_id_organization_id_task_name():
    captured: dict = {}

    @with_log_context
    def dummy_task(organization_id: str, symbol: str, request_id: str | None = None) -> str:
        captured.update(structlog.contextvars.get_contextvars())
        return "done"

    result = dummy_task(organization_id="org-123", symbol="SPY", request_id="task-trace-1")

    assert result == "done"
    assert captured["organization_id"] == "org-123"
    assert captured["request_id"] == "task-trace-1"
    assert captured["task_name"] == "dummy_task"


def test_generates_fresh_request_id_when_none_passed():
    captured: dict = {}

    @with_log_context
    def dummy_task(request_id: str | None = None) -> None:
        captured.update(structlog.contextvars.get_contextvars())

    dummy_task(request_id=None)
    uuid.UUID(captured["request_id"])  # raises ValueError if not a real UUID


def test_positional_args_are_also_picked_up():
    """.delay(...) callers in app/worker/tasks.py always use keywords, but the
    decorator reads via inspect.signature().bind_partial() specifically so it
    isn't coupled to that convention."""
    captured: dict = {}

    @with_log_context
    def dummy_task(organization_id, request_id=None) -> None:
        captured.update(structlog.contextvars.get_contextvars())

    dummy_task("org-456", "task-trace-2")

    assert captured["organization_id"] == "org-456"
    assert captured["request_id"] == "task-trace-2"


def test_contextvars_cleared_after_success():
    @with_log_context
    def ok_task(request_id=None) -> None:
        pass

    structlog.contextvars.clear_contextvars()
    ok_task(request_id="x")
    assert structlog.contextvars.get_contextvars() == {}


def test_contextvars_cleared_after_exception():
    @with_log_context
    def failing_task(request_id=None) -> None:
        raise ValueError("boom")

    structlog.contextvars.clear_contextvars()
    with pytest.raises(ValueError):
        failing_task(request_id="y")
    assert structlog.contextvars.get_contextvars() == {}


def test_clears_stale_contextvars_left_by_a_previous_task():
    """The scenario the decorator exists for: one worker process runs many
    tasks over its lifetime: contextvars from whatever ran before must not
    leak into the next task's log lines."""
    structlog.contextvars.bind_contextvars(stale_field="leftover", organization_id="stale-org")

    captured: dict = {}

    @with_log_context
    def dummy_task(organization_id, request_id=None) -> None:
        captured.update(structlog.contextvars.get_contextvars())

    dummy_task("fresh-org", request_id="fresh-trace")

    assert "stale_field" not in captured
    assert captured["organization_id"] == "fresh-org"
