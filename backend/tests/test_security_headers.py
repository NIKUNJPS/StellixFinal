"""Security headers middleware tests (Batch 11).

The shared `client` fixture's `app` is imported once at module load, with
`SecurityHeadersMiddleware`'s `is_production` baked in from whatever
`ENVIRONMENT` was set at that time (development, in the test run). Testing the
production-only HSTS header therefore exercises `SecurityHeadersMiddleware`
directly against a minimal throwaway Starlette app, rather than building a
second full `create_app()` (which would carry its own DB/Neo4j/Redis-touching
lifespan and routes with nothing to hermetically override).
"""

from __future__ import annotations

import pytest
from app.core.security_headers import SecurityHeadersMiddleware
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

pytestmark = pytest.mark.asyncio


async def test_baseline_security_headers_present(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"


async def test_hsts_absent_outside_production(client):
    resp = await client.get("/health")
    assert "strict-transport-security" not in resp.headers


async def test_headers_present_on_error_responses(client):
    """The global exception handler's response still runs through the security
    headers middleware (it wraps ExceptionMiddleware, not just the router)."""
    resp = await client.get("/this-route-does-not-exist")
    assert resp.status_code == 404
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"


def _minimal_app(*, is_production: bool) -> Starlette:
    async def ok(request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/ping", ok)])
    app.add_middleware(SecurityHeadersMiddleware, is_production=is_production)
    return app


async def test_hsts_present_in_production():
    transport = ASGITransport(app=_minimal_app(is_production=True))
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get("/ping")
    assert resp.headers["strict-transport-security"] == "max-age=63072000; includeSubDomains"


async def test_hsts_absent_in_development_minimal_app():
    transport = ASGITransport(app=_minimal_app(is_production=False))
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get("/ping")
    assert "strict-transport-security" not in resp.headers
