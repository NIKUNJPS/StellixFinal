"""Request ID propagation (Batch 13): RequestIDMiddleware behavior, and a
regression test for the bug it fixed — an unhandled exception used to reach
the client with none of CORS/security/request-id headers attached (Starlette
special-cases @app.exception_handler(Exception) onto ServerErrorMiddleware,
which sits outside every app.add_middleware() layer). See docs/schemas.md
"Unhandled-exception handling, corrected" for the full trace."""

from __future__ import annotations

import uuid

import pytest
import structlog
from app.main import app as fastapi_app
from httpx import ASGITransport, AsyncClient

from tests.helpers import bearer, register_org

pytestmark = pytest.mark.anyio


async def test_request_id_generated_when_absent(client):
    resp = await client.get("/health")
    request_id = resp.headers.get("x-request-id")
    assert request_id is not None
    uuid.UUID(request_id)  # raises ValueError if not a real UUID


async def test_request_id_echoed_when_provided(client):
    resp = await client.get("/health", headers={"X-Request-ID": "caller-supplied-trace-id"})
    assert resp.headers.get("x-request-id") == "caller-supplied-trace-id"


async def test_unhandled_exception_still_carries_request_id_and_cors_headers(client):
    """Regression test: curling the real sentry-test route with an Origin and
    an inbound X-Request-ID (live, during Batch 13 development) came back
    with NEITHER header before the app/core/error_handling.py fix. The
    client must still see a clean, generic 500 body — the real traceback
    only ever goes to the server log.

    Uses its own transport with raise_app_exceptions=False: the shared
    `client` fixture's default (True) re-raises the exception into the test
    itself, since ASGITransport is an in-process call — unlike a real
    deployment, where uvicorn has already sent the response bytes before its
    own top-level re-raise (confirmed live: curling this route through a
    real running server returns the response fine). Still uses `client` to
    register the org so the hermetic SQLite dependency overrides apply.
    """
    token, _org = await register_org(client, org_name="ReqIdCo", email="r@reqidco.com")

    transport = ASGITransport(app=fastapi_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as raw_client:
        resp = await raw_client.get(
            "/system/observability/sentry-test",
            headers={
                **bearer(token),
                "Origin": "http://localhost:3000",  # matches default BACKEND_CORS_ORIGINS
                "X-Request-ID": "regression-trace-id",
            },
        )

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Internal server error"}
    assert resp.headers.get("x-request-id") == "regression-trace-id"
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert resp.headers.get("x-content-type-options") == "nosniff"


async def test_get_current_request_id_reads_bound_contextvar():
    from app.core.logging import get_current_request_id

    structlog.contextvars.clear_contextvars()
    assert get_current_request_id() is None

    structlog.contextvars.bind_contextvars(request_id="unit-test-id")
    try:
        assert get_current_request_id() == "unit-test-id"
    finally:
        structlog.contextvars.clear_contextvars()
