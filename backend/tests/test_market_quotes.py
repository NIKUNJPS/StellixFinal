"""Batch 25 Task 11: delayed global index quotes.

No test makes a network call: the yfinance download is replaced with a canned frame
and Redis with an in-memory double. Covers the provider parsing, the honest
staleness/unavailable contract (never a frozen or synthesized number), the Celery-side
publish on the EXISTING Redis bridge, global (not org-scoped) delivery, and the fix
for per-loop Redis clients in Celery workers."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest
from app.core.config import settings
from app.providers import LatestQuote, ProviderError
from app.providers.yfinance_provider import YFinanceProvider
from app.services import market_quotes
from app.ws.manager import WebSocketManager

from tests.helpers import bearer, create_org_user, token_for

_SYMBOLS = [index.symbol for index in market_quotes.GLOBAL_INDICES]
_MONDAY = datetime(2026, 9, 14, 14, 0, tzinfo=UTC)


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


def _download_frame(symbols: list[str], *, missing: set[str] = frozenset()) -> pd.DataFrame:
    index = pd.DatetimeIndex([pd.Timestamp("2026-09-10"), pd.Timestamp("2026-09-11")], name="Date")
    frames = {}
    for i, symbol in enumerate(symbols):
        base = 1000.0 * (i + 1)
        closes = [float("nan"), float("nan")] if symbol in missing else [base, base * 1.01]
        frames[symbol] = pd.DataFrame(
            {"Open": closes, "High": closes, "Low": closes, "Close": closes, "Adj Close": closes, "Volume": [0, 0]},
            index=index,
        )
    return pd.concat(frames, axis=1)


def test_yfinance_provider_parses_batched_download_without_network(monkeypatch):
    calls = []

    def fake_download(**kwargs):
        calls.append(kwargs)
        return _download_frame(kwargs["tickers"], missing={"^HSI"})

    monkeypatch.setattr("app.providers.yfinance_provider.yf.download", fake_download)
    quotes = YFinanceProvider().fetch_latest_quotes(_SYMBOLS)

    assert len(calls) == 1  # one batched call per refresh, not one per symbol
    assert calls[0]["period"] == "5d" and calls[0]["interval"] == "1d"
    by_symbol = {q.symbol: q for q in quotes}
    assert [q.symbol for q in quotes] == _SYMBOLS
    spx = by_symbol["^GSPC"]
    assert spx.ok and spx.previous_close == 1000.0 and spx.last_price == pytest.approx(1010.0)
    assert spx.session_date == date(2026, 9, 11)
    hsi = by_symbol["^HSI"]
    assert not hsi.ok and hsi.last_price is None and hsi.error


def test_yfinance_provider_raises_provider_error_on_client_failure(monkeypatch):
    def boom(**_kwargs):
        raise RuntimeError("rate limited")

    monkeypatch.setattr("app.providers.yfinance_provider.yf.download", boom)
    with pytest.raises(ProviderError):
        YFinanceProvider().fetch_latest_quotes(["^GSPC"])


def _stub_provider(monkeypatch, quotes_or_error):
    class StubProvider:
        name = "stub"

        def fetch_latest_quotes(self, symbols):
            if isinstance(quotes_or_error, Exception):
                raise quotes_or_error
            return [q for q in quotes_or_error if q.symbol in symbols]

    monkeypatch.setattr(market_quotes, "get_provider", lambda _name: StubProvider())


def _all_good(multiplier: float = 1.0) -> list[LatestQuote]:
    return [
        LatestQuote(symbol=s, last_price=110.0 * multiplier, previous_close=100.0, session_date=date(2026, 9, 14))
        for s in _SYMBOLS
    ]


@pytest.mark.anyio
async def test_refresh_caches_structured_quotes_and_publishes_globally(monkeypatch, memory_redis):
    _stub_provider(monkeypatch, _all_good())
    result = await market_quotes.refresh_quotes(now=_MONDAY)
    assert result == {"refreshed": True, "available": 9, "unavailable": 0}

    payload = await market_quotes.get_latest(now=_MONDAY + timedelta(seconds=30))
    assert payload["is_realtime"] is False
    assert "Delayed" in payload["data_delay_note"]
    first = payload["quotes"][0]
    assert first["symbol"] == "^GSPC" and first["name"] == "S&P 500"
    assert first["status"] == "ok"
    assert first["last_price"] == 110.0 and first["change"] == 10.0 and first["change_pct"] == 10.0
    assert first["session_date"] == "2026-09-14"
    assert first["fetched_at"] == _MONDAY.isoformat()

    # Published once, on the existing bridge channel, with the GLOBAL scope.
    from app.ws.events import SCOPE_GLOBAL, WS_CHANNEL

    [(channel, raw)] = memory_redis.published
    envelope = json.loads(raw)
    assert channel == WS_CHANNEL
    assert envelope["scope"] == SCOPE_GLOBAL
    assert envelope["organization_id"] is None
    assert envelope["payload"]["type"] == "market_quotes"
    assert len(envelope["payload"]["quotes"]) == 9


@pytest.mark.anyio
async def test_failed_refresh_keeps_last_good_quote_ageing_then_marks_unavailable(monkeypatch, memory_redis):
    _stub_provider(monkeypatch, _all_good())
    await market_quotes.refresh_quotes(now=_MONDAY, publish=False)

    _stub_provider(monkeypatch, ProviderError("Yahoo throttled the request"))
    later = _MONDAY + timedelta(minutes=5)
    await market_quotes.refresh_quotes(now=later, publish=False)
    still_fresh = await market_quotes.get_latest(now=later)
    spx = still_fresh["quotes"][0]
    assert spx["status"] == "ok"
    assert spx["fetched_at"] == _MONDAY.isoformat()  # the clock was NOT reset by the failure

    stale_time = _MONDAY + timedelta(seconds=settings.MARKET_QUOTES_STALE_AFTER_SECONDS + 60)
    stale = await market_quotes.get_latest(now=stale_time)
    spx = stale["quotes"][0]
    assert spx["status"] == "unavailable"
    assert spx["last_price"] is None and spx["change"] is None and spx["change_pct"] is None
    assert "Yahoo throttled" in spx["unavailable_reason"]


@pytest.mark.anyio
async def test_symbol_the_provider_cannot_price_is_unavailable_not_invented(monkeypatch, memory_redis):
    quotes = _all_good()
    quotes[6] = LatestQuote(symbol="^HSI", error="No data returned for this symbol")
    _stub_provider(monkeypatch, quotes)
    await market_quotes.refresh_quotes(now=_MONDAY, publish=False)
    payload = await market_quotes.get_latest(now=_MONDAY)
    hsi = next(q for q in payload["quotes"] if q["symbol"] == "^HSI")
    assert hsi["status"] == "unavailable"
    assert hsi["last_price"] is None
    assert hsi["unavailable_reason"] == "No data returned for this symbol"


@pytest.mark.anyio
async def test_weekend_closure_skips_the_provider_entirely(monkeypatch, memory_redis):
    _stub_provider(monkeypatch, AssertionError("provider must not be called on a Saturday"))
    saturday = datetime(2026, 9, 19, 12, 0, tzinfo=UTC)
    assert await market_quotes.refresh_quotes(now=saturday) == {"refreshed": False, "reason": "weekend_closure"}
    assert memory_redis.published == []


@pytest.mark.anyio
async def test_celery_task_publishes_through_the_bridge(monkeypatch, memory_redis):
    _stub_provider(monkeypatch, _all_good())
    monkeypatch.setattr(market_quotes, "_utcnow", lambda: _MONDAY)
    from app.worker.tasks import refresh_global_index_quotes

    # The task body calls asyncio.run itself, so run it off this test's loop.
    result = await asyncio.to_thread(refresh_global_index_quotes.run)
    assert result["refreshed"] is True
    assert json.loads(memory_redis.published[0][1])["payload"]["type"] == "market_quotes"


@pytest.mark.anyio
async def test_global_market_event_reaches_every_org_but_org_events_do_not_leak():
    from app.ws import bridge

    class Socket:
        def __init__(self):
            self.sent = []

        async def accept(self):
            pass

        async def send_json(self, payload):
            self.sent.append(payload)

    manager = WebSocketManager()
    org_a, org_b = str(uuid.uuid4()), str(uuid.uuid4())
    a, b = Socket(), Socket()
    await manager.connect(a, org_a, "user-a")
    await manager.connect(b, org_b, "user-b")

    original = bridge.ws_manager
    bridge.ws_manager = manager
    try:
        await bridge._dispatch(
            json.dumps({"scope": "global", "organization_id": None, "payload": {"type": "market_quotes", "quotes": []}})
        )
        # A target list inside a global envelope must never address specific users.
        await bridge._dispatch(
            json.dumps(
                {"scope": "global", "organization_id": None,
                 "payload": {"type": "market_quotes", "quotes": [], "target_user_ids": ["user-b"]}}
            )
        )
        await bridge._dispatch(
            json.dumps({"scope": "organization", "organization_id": org_a, "payload": {"type": "failure_alert"}})
        )
        # An org-scoped envelope with no org is dropped, not broadcast.
        await bridge._dispatch(json.dumps({"scope": "organization", "organization_id": None, "payload": {"type": "x"}}))
    finally:
        bridge.ws_manager = original

    assert [p["type"] for p in a.sent] == ["market_quotes", "market_quotes", "failure_alert"]
    assert [p["type"] for p in b.sent] == ["market_quotes", "market_quotes"]


async def test_indices_endpoint_serves_identical_public_data_to_every_org(client, db_session_factory, monkeypatch, memory_redis):
    _stub_provider(monkeypatch, _all_good())
    monkeypatch.setattr(settings, "MARKET_QUOTES_SKIP_WEEKENDS", False)  # deterministic on any weekday
    await market_quotes.refresh_quotes(publish=False)
    _, alpha = await create_org_user(db_session_factory, org_name="Alpha Fund", slug="alpha-fund", email="a@alpha.io")
    _, beta = await create_org_user(db_session_factory, org_name="Beta Fund", slug="beta-fund", email="b@beta.io")

    responses = []
    for email in (alpha.email, beta.email):
        resp = await client.get("/market/indices", headers=bearer(await token_for(client, email)))
        assert resp.status_code == 200
        body = resp.json()
        responses.append([(q["symbol"], q["last_price"], q["status"]) for q in body["quotes"]])
        assert body["refresh_requested"] is False
    assert responses[0] == responses[1]
    assert len(responses[0]) == 9

    assert (await client.get("/market/indices")).status_code == 401


async def test_indices_endpoint_with_empty_cache_is_honest_and_requests_one_refresh(client, db_session_factory, monkeypatch, memory_redis):
    from unittest.mock import patch

    _, user = await create_org_user(db_session_factory, org_name="Empty Cache", slug="empty-cache", email="e@empty.io")
    token = await token_for(client, user.email)
    with patch("app.worker.tasks.refresh_global_index_quotes.delay") as delay:
        first = (await client.get("/market/indices", headers=bearer(token))).json()
        second = (await client.get("/market/indices", headers=bearer(token))).json()
    assert all(q["status"] == "unavailable" and q["last_price"] is None for q in first["quotes"])
    assert first["quotes"][0]["unavailable_reason"] == "No quote collected yet"
    assert first["refresh_requested"] is True
    assert second["refresh_requested"] is False  # at most one enqueue per minute
    assert delay.call_count == 1


def test_redis_client_is_recreated_for_each_event_loop(monkeypatch):
    """Regression for the Celery-worker bug found in Batch 25: a client created in
    one asyncio.run() loop was reused in the next, so every later realtime publish
    from that worker process was silently dropped."""
    from app.clients import redis_client

    monkeypatch.setattr(redis_client, "_client", None)
    monkeypatch.setattr(redis_client, "_client_loop", None)

    async def grab():
        return redis_client.get_client()

    first = asyncio.run(grab())
    second = asyncio.run(grab())
    assert first is not second

    async def same_loop():
        return redis_client.get_client() is redis_client.get_client()

    assert asyncio.run(same_loop()) is True
