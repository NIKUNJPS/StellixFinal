"""Batch 28 Task 1: FRED-backed macro dashboard.

No test makes a network call: FRED's HTTP client is monkeypatched with canned
responses and Redis with an in-memory double. Covers the real response-shape parsing
(FRED's string values + missing-observation marker), the honest "not configured"
state when no key is set, per-series error isolation, and global (not org-scoped)
realtime delivery.
"""

from __future__ import annotations

import json
from datetime import date

import pytest
import requests
from app.providers import fred_client
from app.providers.fred_client import FredError, fetch_series
from app.services import macro_data

from tests.helpers import bearer, create_org_user, token_for


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or json.dumps(payload or {})

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def _observations(*rows: tuple[str, str]) -> dict:
    return {"observations": [{"date": d, "value": v} for d, v in rows]}


class InMemoryRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.published: list[tuple[str, str]] = []

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


@pytest.fixture
def memory_redis(monkeypatch):
    from app.clients import redis_client

    fake = InMemoryRedis()
    monkeypatch.setattr(redis_client, "get_client", lambda: fake)
    return fake


# --------------------------------------------------------------------------- client
def test_fetch_series_parses_real_fred_response_shape(monkeypatch):
    """FRED's actual JSON shape: observations newest-first (sort_order=desc), each
    value a STRING. The client must present them chronologically."""
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append((url, params))
        return _FakeResponse(200, _observations(("2026-09-20", "4.12"), ("2026-09-19", "4.10")))

    monkeypatch.setattr(requests, "get", fake_get)
    points = fetch_series("real-key", "DGS10", limit=10)
    assert [(p.obs_date, p.value) for p in points] == [(date(2026, 9, 19), 4.10), (date(2026, 9, 20), 4.12)]
    assert calls[0][0] == fred_client.BASE_URL
    assert calls[0][1]["series_id"] == "DGS10"
    assert calls[0][1]["api_key"] == "real-key"


def test_fetch_series_treats_missing_marker_as_none(monkeypatch):
    """FRED's documented missing-observation marker (historically ".") must become
    None, never crash and never be coerced to 0.0."""
    monkeypatch.setattr(
        requests, "get",
        lambda *a, **k: _FakeResponse(200, _observations(("2026-09-20", "."), ("2026-09-19", "4.10"))),
    )
    points = fetch_series("real-key", "DGS10")
    by_date = {p.obs_date: p.value for p in points}
    assert by_date[date(2026, 9, 20)] is None
    assert by_date[date(2026, 9, 19)] == 4.10


def test_fetch_series_without_key_raises_fred_error():
    """Never a silent fabrication — no key means an explicit error, not a fetch."""
    with pytest.raises(FredError, match="FRED_API_KEY is not set"):
        fetch_series(None, "DGS10")


def test_fetch_series_surfaces_real_fred_error_body(monkeypatch):
    monkeypatch.setattr(
        requests, "get",
        lambda *a, **k: _FakeResponse(400, {"error_code": 400, "error_message": "Bad Request. Variable api_key is not set."}),
    )
    with pytest.raises(FredError, match="Bad Request"):
        fetch_series("bad-key", "DGS10")


# --------------------------------------------------------------------------- service
async def test_macro_not_configured_when_no_key(monkeypatch, memory_redis):
    from app.core.config import settings

    monkeypatch.setattr(settings, "FRED_API_KEY", None)
    payload = await macro_data.get_latest()
    assert payload["configured"] is False
    assert all(s["status"] == "not_configured" for s in payload["series"])
    assert all(s["points"] == [] and s["latest_value"] is None for s in payload["series"])


async def test_macro_refresh_populates_cache_and_publishes(monkeypatch, memory_redis):
    from app.core.config import settings

    monkeypatch.setattr(settings, "FRED_API_KEY", "real-key")

    def fake_get(url, params=None, timeout=None):
        sid = params["series_id"]
        return _FakeResponse(200, _observations(("2026-09-20", "3.9" if sid == "DGS10" else "18.2")))

    monkeypatch.setattr(requests, "get", fake_get)
    result = await macro_data.refresh_macro(publish=True)
    assert result["refreshed"] is True
    assert result["ok"] == len(macro_data.ALL_SERIES)

    payload = await macro_data.get_latest()
    by_id = {s["series_id"]: s for s in payload["series"]}
    assert by_id["DGS10"]["latest_value"] == 3.9
    assert by_id["DGS10"]["status"] == "ok"
    assert by_id["VIXCLS"]["latest_value"] == 18.2

    # Published once, on the global scope, not org-scoped.
    assert len(memory_redis.published) == 1
    channel, raw = memory_redis.published[0]
    from app.ws.events import SCOPE_GLOBAL, WS_CHANNEL

    envelope = json.loads(raw)
    assert channel == WS_CHANNEL
    assert envelope["scope"] == SCOPE_GLOBAL
    assert envelope["organization_id"] is None
    assert envelope["payload"]["type"] == "macro_update"


async def test_macro_refresh_isolates_a_single_series_failure(monkeypatch, memory_redis):
    """One bad series must not blank out the others — same per-item honesty as
    market_quotes.merge_refresh keeping good prices while a failed one errors."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "FRED_API_KEY", "real-key")

    def fake_get(url, params=None, timeout=None):
        if params["series_id"] == "VIXCLS":
            return _FakeResponse(500, text="server error")
        return _FakeResponse(200, _observations(("2026-09-20", "4.0")))

    monkeypatch.setattr(requests, "get", fake_get)
    await macro_data.refresh_macro(publish=False)
    payload = await macro_data.get_latest()
    by_id = {s["series_id"]: s for s in payload["series"]}
    assert by_id["DGS10"]["status"] == "ok" and by_id["DGS10"]["latest_value"] == 4.0
    assert by_id["VIXCLS"]["status"] == "error"
    assert by_id["VIXCLS"]["latest_value"] is None


async def test_macro_refresh_noop_when_not_configured(monkeypatch, memory_redis):
    from app.core.config import settings

    monkeypatch.setattr(settings, "FRED_API_KEY", None)
    result = await macro_data.refresh_macro()
    assert result == {"refreshed": False, "reason": "not_configured"}
    assert memory_redis.published == []


# --------------------------------------------------------------------------- API
async def test_macro_endpoint_reachable_by_any_authenticated_user(client, db_session_factory, monkeypatch, memory_redis):
    from app.core.config import settings

    monkeypatch.setattr(settings, "FRED_API_KEY", None)
    org, user = await create_org_user(db_session_factory, org_name="Macro Co", slug="macro-co", email="m@macro.co")
    token = await token_for(client, user.email)
    resp = await client.get("/market/macro", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is False
    assert len(body["series"]) == len(macro_data.ALL_SERIES)
