"""WebSocket manager, endpoint auth, and Redis bridge (Batch 19).

No real sockets and no real Redis: the manager only ever calls `accept`/`send_json`
on whatever object it was handed, and the endpoint is a plain coroutine, so a
FakeWebSocket exercises the real code end to end without a network. Redis publish is
patched at the client boundary for the same reason the LLM tests patch at the
provider boundary — the suite must never open a live connection, and must pass on a
machine with no Redis running.
"""

from __future__ import annotations

import json
import uuid

import pytest
from app.api.routes.ws import (
    WS_CLOSE_ORG_MISMATCH,
    WS_CLOSE_UNAUTHORIZED,
    websocket_endpoint,
)
from app.core.security import create_access_token
from app.ws.manager import WebSocketManager


class FakeWebSocket:
    """Stands in for a Starlette WebSocket.

    `receive_text` replays a scripted client script and then raises
    WebSocketDisconnect, which is exactly what a real socket does when the peer
    goes away — so the endpoint's disconnect/cleanup path runs for real.
    """

    def __init__(self, incoming: list[str] | None = None, *, fail_on_send: bool = False):
        self.accepted = False
        self.sent: list[dict] = []
        self.sent_text: list[str] = []
        self.closed_with: tuple[int, str] | None = None
        self._incoming = list(incoming or [])
        self._fail_on_send = fail_on_send

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload: dict) -> None:
        if self._fail_on_send:
            raise RuntimeError("peer is gone")
        self.sent.append(payload)

    async def send_text(self, text: str) -> None:
        self.sent_text.append(text)

    async def receive_text(self) -> str:
        from fastapi import WebSocketDisconnect

        if not self._incoming:
            raise WebSocketDisconnect(code=1000)
        return self._incoming.pop(0)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed_with = (code, reason)


ORG_A = str(uuid.uuid4())
ORG_B = str(uuid.uuid4())
USER_1 = str(uuid.uuid4())
USER_2 = str(uuid.uuid4())


# --------------------------------------------------------------------------- #
# Manager
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_connect_stores_connection():
    manager = WebSocketManager()
    ws = FakeWebSocket()

    await manager.connect(ws, ORG_A, USER_1)

    assert ws.accepted is True
    assert manager.connection_count(ORG_A) == 1


@pytest.mark.anyio
async def test_disconnect_removes_connection():
    manager = WebSocketManager()
    ws = FakeWebSocket()
    await manager.connect(ws, ORG_A, USER_1)

    await manager.disconnect(ws, ORG_A, USER_1)

    assert manager.connection_count(ORG_A) == 0
    # Pruned entirely, not left as an empty list: _connections is a defaultdict, so
    # without pruning every org/user that ever connected leaks for the process's life.
    assert ORG_A not in manager._connections


@pytest.mark.anyio
async def test_disconnect_keeps_other_tabs_of_same_user():
    """One user, two tabs. Closing one must not silently unsubscribe the other."""
    manager = WebSocketManager()
    tab1, tab2 = FakeWebSocket(), FakeWebSocket()
    await manager.connect(tab1, ORG_A, USER_1)
    await manager.connect(tab2, ORG_A, USER_1)

    await manager.disconnect(tab1, ORG_A, USER_1)

    assert manager.connection_count(ORG_A) == 1
    await manager.broadcast_to_org(ORG_A, {"type": "x"})
    assert tab2.sent == [{"type": "x"}]


@pytest.mark.anyio
async def test_broadcast_sends_to_all_org_users():
    manager = WebSocketManager()
    a1, a2 = FakeWebSocket(), FakeWebSocket()
    await manager.connect(a1, ORG_A, USER_1)
    await manager.connect(a2, ORG_A, USER_2)

    delivered = await manager.broadcast_to_org(ORG_A, {"type": "regime_update"})

    assert delivered == 2
    assert a1.sent == [{"type": "regime_update"}]
    assert a2.sent == [{"type": "regime_update"}]


@pytest.mark.anyio
async def test_broadcast_never_crosses_org_boundary():
    """The structural-multitenancy property (ADR-0002) on the realtime path: an
    org's events must not reach another org's sockets."""
    manager = WebSocketManager()
    a, b = FakeWebSocket(), FakeWebSocket()
    await manager.connect(a, ORG_A, USER_1)
    await manager.connect(b, ORG_B, USER_2)

    await manager.broadcast_to_org(ORG_A, {"type": "failure_alert", "secret": "org-a"})

    assert len(a.sent) == 1
    assert b.sent == []


@pytest.mark.anyio
async def test_broadcast_removes_dead_connections():
    manager = WebSocketManager()
    alive = FakeWebSocket()
    dead = FakeWebSocket(fail_on_send=True)
    await manager.connect(alive, ORG_A, USER_1)
    await manager.connect(dead, ORG_A, USER_2)

    delivered = await manager.broadcast_to_org(ORG_A, {"type": "x"})

    # The live peer still got it — one dead socket must not abort the fan-out.
    assert delivered == 1
    assert alive.sent == [{"type": "x"}]
    assert manager.connection_count(ORG_A) == 1


@pytest.mark.anyio
async def test_send_to_user_reaps_dead_connections():
    """The targeted path reaps too. The spec's sketch swallowed send errors here
    without cleanup, so a closed socket stayed in the dict forever and every later
    send retried against it."""
    manager = WebSocketManager()
    dead = FakeWebSocket(fail_on_send=True)
    await manager.connect(dead, ORG_A, USER_1)

    delivered = await manager.send_to_user(ORG_A, USER_1, {"type": "approval_request"})

    assert delivered == 0
    assert manager.connection_count(ORG_A) == 0


@pytest.mark.anyio
async def test_send_to_user_targets_only_that_user():
    manager = WebSocketManager()
    u1, u2 = FakeWebSocket(), FakeWebSocket()
    await manager.connect(u1, ORG_A, USER_1)
    await manager.connect(u2, ORG_A, USER_2)

    await manager.send_to_user(ORG_A, USER_1, {"type": "approval_request"})

    assert len(u1.sent) == 1
    assert u2.sent == []


# --------------------------------------------------------------------------- #
# Endpoint auth
# --------------------------------------------------------------------------- #
def _token(user_id: str, org_id: str) -> str:
    return create_access_token(
        user_id=uuid.UUID(user_id), organization_id=uuid.UUID(org_id), role="researcher"
    )


@pytest.mark.anyio
async def test_unauthorized_token_closes_with_4001():
    ws = FakeWebSocket()

    await websocket_endpoint(ws, ORG_A, USER_1, token="not-a-real-jwt")

    assert ws.closed_with == (WS_CLOSE_UNAUTHORIZED, "Unauthorized")
    assert ws.accepted is False  # rejected before the upgrade completes


@pytest.mark.anyio
async def test_token_for_a_different_user_closes_with_4001():
    """A valid token does not authorize impersonating another user_id in the path."""
    ws = FakeWebSocket()

    await websocket_endpoint(ws, ORG_A, USER_2, token=_token(USER_1, ORG_A))

    assert ws.closed_with == (WS_CLOSE_UNAUTHORIZED, "Unauthorized")


@pytest.mark.anyio
async def test_org_mismatch_closes_with_4003():
    """The tenancy check: a valid token for org A must not subscribe to org B's
    stream by editing the URL."""
    ws = FakeWebSocket()

    await websocket_endpoint(ws, ORG_B, USER_1, token=_token(USER_1, ORG_A))

    assert ws.closed_with == (WS_CLOSE_ORG_MISMATCH, "Org mismatch")
    assert ws.accepted is False


@pytest.mark.anyio
async def test_valid_token_with_org_claim_connects():
    """Regression for the spec's dead-on-arrival bug: the JWT carries `org`, not
    `org_id`. Reading `org_id` yields None for every token ever issued, so every
    connection would have closed 4003 and no client could ever connect."""
    from app.ws.manager import ws_manager

    ws = FakeWebSocket()

    await websocket_endpoint(ws, ORG_A, USER_1, token=_token(USER_1, ORG_A))

    assert ws.accepted is True
    assert ws.closed_with is None
    # Disconnected cleanly on the way out (FakeWebSocket raises WebSocketDisconnect
    # once its script is exhausted), so nothing leaks into the shared singleton.
    assert ws_manager.connection_count(ORG_A) == 0


@pytest.mark.anyio
async def test_ping_returns_pong():
    ws = FakeWebSocket(incoming=["ping"])

    await websocket_endpoint(ws, ORG_A, USER_1, token=_token(USER_1, ORG_A))

    assert ws.sent_text == ["pong"]


@pytest.mark.anyio
async def test_disconnect_unregisters_even_without_clean_close():
    """The cleanup lives in `finally`, not just the WebSocketDisconnect handler: an
    unexpected error mid-loop must still unregister the socket."""
    from app.ws.manager import ws_manager

    class Exploding(FakeWebSocket):
        async def receive_text(self):
            raise RuntimeError("connection reset")

    ws = Exploding()
    with pytest.raises(RuntimeError):
        await websocket_endpoint(ws, ORG_A, USER_1, token=_token(USER_1, ORG_A))

    assert ws_manager.connection_count(ORG_A) == 0


# --------------------------------------------------------------------------- #
# Redis bridge — the piece that makes Celery-published events reach a browser
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_bridge_dispatch_broadcasts_to_local_sockets(monkeypatch):
    """A message published by ANOTHER process (a Celery worker) arrives here as a
    Redis payload and must reach this process's sockets."""
    from app.ws import bridge
    from app.ws.manager import ws_manager

    ws = FakeWebSocket()
    await ws_manager.connect(ws, ORG_A, USER_1)
    try:
        await bridge._dispatch(
            json.dumps({"organization_id": ORG_A, "payload": {"type": "regime_update"}})
        )
        assert ws.sent == [{"type": "regime_update"}]
    finally:
        await ws_manager.disconnect(ws, ORG_A, USER_1)


@pytest.mark.anyio
async def test_bridge_dispatch_honours_target_user_ids(monkeypatch):
    from app.ws import bridge
    from app.ws.manager import ws_manager

    u1, u2 = FakeWebSocket(), FakeWebSocket()
    await ws_manager.connect(u1, ORG_A, USER_1)
    await ws_manager.connect(u2, ORG_A, USER_2)
    try:
        await bridge._dispatch(
            json.dumps(
                {
                    "organization_id": ORG_A,
                    "payload": {"type": "approval_request", "target_user_ids": [USER_1]},
                }
            )
        )
        assert len(u1.sent) == 1
        assert u2.sent == []
    finally:
        await ws_manager.disconnect(u1, ORG_A, USER_1)
        await ws_manager.disconnect(u2, ORG_A, USER_2)


@pytest.mark.anyio
async def test_bridge_dispatch_survives_malformed_message():
    """A poisoned message must not kill the subscriber loop for the whole process."""
    from app.ws import bridge

    await bridge._dispatch("not json at all")
    await bridge._dispatch(json.dumps({"missing": "fields"}))


@pytest.mark.anyio
async def test_publish_is_fire_and_forget_when_redis_is_down(monkeypatch):
    """Realtime is a convenience over data already committed to Postgres. A Redis
    outage must never propagate into the regime detection or strategy transition
    that triggered the event."""
    from app.clients import redis_client
    from app.ws import events

    class BrokenRedis:
        async def publish(self, *_a, **_kw):
            raise ConnectionError("redis is down")

    monkeypatch.setattr(redis_client, "get_client", lambda: BrokenRedis())

    # Must not raise.
    await events.publish_regime_change(ORG_A, "SPY", "Bull", "Crisis", 0.91)


@pytest.mark.anyio
async def test_publish_regime_change_severity_and_envelope(monkeypatch):
    from app.clients import redis_client
    from app.ws import events

    captured: list[tuple[str, str]] = []

    class CapturingRedis:
        async def publish(self, channel, message):
            captured.append((channel, message))

    monkeypatch.setattr(redis_client, "get_client", lambda: CapturingRedis())

    await events.publish_regime_change(ORG_A, "SPY", "Bull", "Crisis", 0.9123)
    await events.publish_regime_change(ORG_A, "QQQ", "Bull", "Bear", 0.5)
    await events.publish_regime_change(ORG_A, "IWM", "Bull", "Sideways", 0.5)

    envelopes = [json.loads(m) for _c, m in captured]
    assert [e["payload"]["severity"] for e in envelopes] == ["critical", "warning", "info"]
    # org travels in the envelope so the bridge can fan out per-tenant
    assert envelopes[0]["organization_id"] == ORG_A
    assert envelopes[0]["payload"]["confidence"] == 0.912
    assert captured[0][0] == events.WS_CHANNEL
