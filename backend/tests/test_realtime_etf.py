"""Real-time US ETF stream (Alpaca IEX).

No test touches the network: the streamer runs against a local fake server that
speaks Alpaca's documented websocket protocol, the snapshot REST call is replaced,
and Redis is an in-memory double."""

from __future__ import annotations

import asyncio
import json

import pytest
from app.core.config import settings
from app.services import realtime_etf
from app.streaming import etf_stream
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

from tests.helpers import bearer, create_org_user, token_for


class InMemoryRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.published: list[tuple[str, str]] = []

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, nx=False, ex=None):
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


@pytest.fixture
def alpaca_keys(monkeypatch):
    monkeypatch.setattr(settings, "ALPACA_API_KEY_ID", "test-key")
    monkeypatch.setattr(settings, "ALPACA_API_SECRET_KEY", "test-secret")


def _snapshot_json() -> dict:
    return {
        "SPY": {
            "latestTrade": {"t": "2026-09-25T19:59:59.123456789Z", "p": 661.20},
            "prevDailyBar": {"c": 658.00},
        },
        "QQQ": {
            "latestTrade": {"t": "2026-09-25T19:59:58Z", "p": 590.00},
            "prevDailyBar": {"c": 600.00},
        },
    }


def test_snapshot_seeds_previous_close_and_latest_trade():
    entries = realtime_etf.parse_snapshots(_snapshot_json())
    spy = entries["SPY"]
    assert spy["last_price"] == 661.20
    assert spy["previous_close"] == 658.00
    assert spy["change"] == 3.20
    assert spy["change_pct"] == round(3.20 / 658.00 * 100, 3)
    # Nanosecond timestamps are truncated to microseconds, not rejected.
    assert spy["last_trade_at"] == "2026-09-25T19:59:59.123456+00:00"
    # A symbol missing from the response is unavailable, never invented.
    assert entries["DIA"]["last_price"] is None
    assert [e["status"] for e in realtime_etf.present(entries)] == ["ok", "ok", "unavailable", "unavailable"]


def test_trade_updates_price_and_change_but_never_goes_backwards():
    entries = realtime_etf.parse_snapshots(_snapshot_json())
    assert realtime_etf.apply_trade(entries, "SPY", 662.00, "2026-09-25T19:59:59.500Z")
    assert entries["SPY"]["last_price"] == 662.00
    assert entries["SPY"]["change"] == 4.00

    # An out-of-order older print must not overwrite the newer one.
    assert not realtime_etf.apply_trade(entries, "SPY", 600.00, "2026-09-25T19:59:59.100Z")
    assert entries["SPY"]["last_price"] == 662.00

    assert not realtime_etf.apply_trade(entries, "TSLA", 1.0, "2026-09-25T20:00:00Z")
    assert "TSLA" not in entries


def test_snapshot_refresh_takes_new_previous_close_but_keeps_newer_streamed_trade():
    entries = realtime_etf.parse_snapshots(_snapshot_json())
    realtime_etf.apply_trade(entries, "SPY", 663.00, "2026-09-25T20:00:05Z")
    stale_snapshot = realtime_etf.parse_snapshots(
        {"SPY": {"latestTrade": {"t": "2026-09-25T20:00:00Z", "p": 662.50}, "prevDailyBar": {"c": 660.00}}}
    )
    realtime_etf.merge_snapshot(entries, {"SPY": stale_snapshot["SPY"]})
    assert entries["SPY"]["previous_close"] == 660.00
    assert entries["SPY"]["last_price"] == 663.00
    assert entries["SPY"]["change"] == 3.00


def test_server_error_frame_raises():
    with pytest.raises(etf_stream.AlpacaStreamError) as exc:
        etf_stream.handle_frame({}, json.dumps([{"T": "error", "code": 406, "msg": "connection limit exceeded"}]))
    assert exc.value.code == 406


class FakeAlpaca:
    """Speaks Alpaca's documented flow: connected -> auth -> authenticated ->
    subscribe -> subscription ack -> trade arrays."""

    def __init__(self, *, trades: list[list[dict]] | None = None, auth_error: dict | None = None) -> None:
        self.trades = trades or []
        self.auth_error = auth_error
        self.received: list[dict] = []
        self.connections = 0

    async def handler(self, ws):
        self.connections += 1
        await ws.send(json.dumps([{"T": "success", "msg": "connected"}]))
        self.received.append(json.loads(await ws.recv()))
        if self.auth_error:
            await ws.send(json.dumps([{"T": "error", **self.auth_error}]))
            await ws.close()
            return
        await ws.send(json.dumps([{"T": "success", "msg": "authenticated"}]))
        self.received.append(json.loads(await ws.recv()))
        await ws.send(json.dumps([{"T": "subscription", "trades": list(realtime_etf.SYMBOLS)}]))
        for frame in self.trades:
            await ws.send(json.dumps(frame))
        await asyncio.sleep(0.3)  # let the client's throttled publish fire
        await ws.close()


async def test_streamer_authenticates_subscribes_and_publishes_trades(memory_redis, alpaca_keys, monkeypatch):
    monkeypatch.setattr(etf_stream, "PUBLISH_INTERVAL_SECONDS", 0.05)
    fake = FakeAlpaca(
        trades=[
            [
                {"T": "t", "S": "SPY", "p": 661.50, "s": 100, "t": "2026-09-25T19:59:59.900Z"},
                {"T": "t", "S": "QQQ", "p": 591.00, "s": 50, "t": "2026-09-25T19:59:59.950Z"},
            ],
            [{"T": "t", "S": "SPY", "p": 661.75, "s": 10, "t": "2026-09-25T20:00:00.010Z"}],
        ]
    )
    entries = realtime_etf.parse_snapshots(_snapshot_json())
    async with serve(fake.handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        with pytest.raises(ConnectionClosed):
            await etf_stream.stream_once(entries, f"ws://127.0.0.1:{port}", {"backoff": 1.0})

    auth, subscribe = fake.received
    assert auth == {"action": "auth", "key": "test-key", "secret": "test-secret"}
    assert subscribe == {"action": "subscribe", "trades": list(realtime_etf.SYMBOLS)}

    cached = json.loads(memory_redis.store[realtime_etf.CACHE_KEY])
    assert cached["SPY"]["last_price"] == 661.75
    assert cached["QQQ"]["last_price"] == 591.00
    assert memory_redis.store[realtime_etf.HEARTBEAT_KEY] == "1"

    last_event = json.loads(memory_redis.published[-1][1])
    assert last_event["scope"] == "global"
    payload = last_event["payload"]
    assert payload["type"] == "etf_ticks"
    assert payload["stream_online"] is True
    spy = next(e for e in payload["etfs"] if e["symbol"] == "SPY")
    assert spy["last_price"] == 661.75
    assert spy["tracks"] == "S&P 500"


async def test_bad_credentials_stop_retrying(memory_redis, alpaca_keys, monkeypatch):
    fake = FakeAlpaca(auth_error={"code": 402, "msg": "auth failed"})
    idled = []

    async def no_idle():
        idled.append(True)

    monkeypatch.setattr(etf_stream, "_idle", no_idle)
    monkeypatch.setattr(realtime_etf, "fetch_snapshots", lambda: {})
    async with serve(fake.handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        await asyncio.wait_for(etf_stream.run(url=f"ws://127.0.0.1:{port}"), timeout=10)

    assert fake.connections == 1
    assert idled == [True]


async def test_streamer_idles_without_credentials(memory_redis, monkeypatch):
    monkeypatch.setattr(settings, "ALPACA_API_KEY_ID", None)
    monkeypatch.setattr(settings, "ALPACA_API_SECRET_KEY", None)
    idled = []

    async def no_idle():
        idled.append(True)

    def must_not_connect(*_args, **_kwargs):
        raise AssertionError("connected without credentials")

    monkeypatch.setattr(etf_stream, "_idle", no_idle)
    monkeypatch.setattr(etf_stream, "connect", must_not_connect)
    await etf_stream.run()
    assert idled == [True]


async def test_api_reports_not_configured_honestly(client, db_session_factory, memory_redis, monkeypatch):
    monkeypatch.setattr(settings, "ALPACA_API_KEY_ID", None)
    monkeypatch.setattr(settings, "ALPACA_API_SECRET_KEY", None)
    _, user = await create_org_user(db_session_factory, org_name="Etf Co", slug="etf-co", email="e@etf.io")
    body = (await client.get("/market/realtime-etfs", headers=bearer(await token_for(client, user.email)))).json()

    assert body["configured"] is False
    assert body["stream_online"] is False
    assert [e["symbol"] for e in body["etfs"]] == ["SPY", "QQQ", "DIA", "IWM"]
    assert all(e["status"] == "unavailable" and e["last_price"] is None for e in body["etfs"])


async def test_api_serves_cached_prices_and_stream_status(
    client, db_session_factory, memory_redis, alpaca_keys
):
    await realtime_etf.save(realtime_etf.parse_snapshots(_snapshot_json()))
    _, user = await create_org_user(db_session_factory, org_name="Etf Live", slug="etf-live", email="l@etf.io")
    token = await token_for(client, user.email)

    offline = (await client.get("/market/realtime-etfs", headers=bearer(token))).json()
    assert offline["configured"] is True
    assert offline["stream_online"] is False  # prices are shown with their trade time, but not as live

    await realtime_etf.mark_stream_alive()
    live = (await client.get("/market/realtime-etfs", headers=bearer(token))).json()
    assert live["stream_online"] is True
    spy = live["etfs"][0]
    assert spy["symbol"] == "SPY" and spy["status"] == "ok" and spy["last_price"] == 661.20


async def test_api_requires_auth(client):
    assert (await client.get("/market/realtime-etfs")).status_code == 401
