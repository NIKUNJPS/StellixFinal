"""Tests for the /health endpoint contract and aggregation logic.

Hermetic: connectivity probes are stubbed so the test does not need the Docker stack.
Verifies the endpoint always returns HTTP 200, the per-service shape, and that the
overall status is 'ok' only when every dependency is 'ok'.
"""

from __future__ import annotations

import pytest
from app.main import app
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


async def _ok() -> None:
    return None


async def _boom() -> None:
    raise ConnectionError("simulated outage")


async def _get_health() -> tuple[int, dict]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    return resp.status_code, resp.json()


async def test_health_all_ok(monkeypatch):
    monkeypatch.setattr("app.services.health._check_postgres", _ok)
    monkeypatch.setattr("app.clients.neo4j_client.verify_connectivity", _ok)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _ok)

    status_code, body = await _get_health()

    assert status_code == 200
    assert body["status"] == "ok"
    for svc in ("postgres", "neo4j", "redis"):
        assert body[svc]["status"] == "ok"
        assert body[svc]["latency_ms"] is not None
        assert body[svc]["detail"] is None


async def test_health_degraded_when_one_service_down(monkeypatch):
    monkeypatch.setattr("app.services.health._check_postgres", _ok)
    monkeypatch.setattr("app.clients.neo4j_client.verify_connectivity", _boom)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _ok)

    status_code, body = await _get_health()

    # The endpoint still returns 200 — the body reports the degradation.
    assert status_code == 200
    assert body["status"] == "error"
    assert body["postgres"]["status"] == "ok"
    assert body["redis"]["status"] == "ok"
    assert body["neo4j"]["status"] == "error"
    assert "simulated outage" in body["neo4j"]["detail"]
