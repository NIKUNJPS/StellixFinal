"""Liveness vs. readiness (Batch 13).

Hermetic: connectivity probes are stubbed, matching tests/test_health.py's
established pattern (that file predates this one and covers plain /health;
this one covers the two new K8s-probe endpoints plus the corresponding
fields on /system/health-detailed).
"""

from __future__ import annotations

import pytest

from tests.helpers import bearer, register_org

pytestmark = pytest.mark.anyio


async def _ok() -> None:
    return None


async def _boom() -> None:
    raise ConnectionError("simulated outage")


async def test_liveness_always_ok_even_when_dependencies_down(client, monkeypatch):
    """The whole point of liveness vs. readiness: a K8s liveness probe must
    never fail just because a downstream dependency is slow/down — that
    would cause an unnecessary pod restart instead of the correct response
    (stop routing traffic, handled by readiness instead)."""
    monkeypatch.setattr("app.services.health._check_postgres", _boom)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _boom)

    resp = await client.get("/health/live")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_readiness_ok_when_postgres_and_redis_up(client, monkeypatch):
    monkeypatch.setattr("app.services.health._check_postgres", _ok)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _ok)

    resp = await client.get("/health/ready")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_readiness_fails_when_postgres_down(client, monkeypatch):
    monkeypatch.setattr("app.services.health._check_postgres", _boom)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _ok)

    resp = await client.get("/health/ready")

    assert resp.status_code == 503


async def test_readiness_fails_when_redis_down(client, monkeypatch):
    monkeypatch.setattr("app.services.health._check_postgres", _ok)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _boom)

    resp = await client.get("/health/ready")

    assert resp.status_code == 503


async def test_health_detailed_reports_readiness_true_when_healthy(client, monkeypatch):
    # system.py's health_detailed derives readiness from app.services.system_health's
    # own probes, a separate function object from app.services.health's — see
    # docs/schemas.md "Liveness vs. readiness".
    monkeypatch.setattr("app.services.system_health._check_postgres", _ok)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _ok)

    token, _org = await register_org(client, org_name="ReadinessFieldCo", email="rf@readinessfieldco.com")
    resp = await client.get("/system/health-detailed", headers=bearer(token))

    assert resp.status_code == 200
    body = resp.json()
    assert body["liveness"] is True
    assert body["readiness"] is True


async def test_health_detailed_reports_readiness_false_when_redis_down(client, monkeypatch):
    monkeypatch.setattr("app.services.system_health._check_postgres", _ok)
    monkeypatch.setattr("app.clients.redis_client.verify_connectivity", _boom)

    token, _org = await register_org(client, org_name="ReadinessFalseCo", email="rfx@readinessfalseco.com")
    resp = await client.get("/system/health-detailed", headers=bearer(token))

    assert resp.status_code == 200
    body = resp.json()
    assert body["liveness"] is True
    assert body["readiness"] is False
