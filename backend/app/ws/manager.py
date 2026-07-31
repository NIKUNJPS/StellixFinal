"""Org-scoped WebSocket connection manager (Batch 19).

Holds the sockets connected to THIS process only. It is deliberately not the
delivery mechanism for the platform: events originate in Celery workers and in
sibling API replicas, neither of which share this process's memory. Those reach
here via Redis pub/sub (app/ws/events.py -> app/ws/bridge.py), and this class is
the last hop — the local fan-out.

Tenancy: every send path is keyed by organization_id, and the socket is only ever
registered under the org from its own verified JWT (app/api/routes/ws.py). There
is no API here that can address a socket without naming its org, which keeps the
structural-multitenancy property (ADR-0002) intact on the realtime path.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Tracks live sockets per (org, user) and fans messages out to them."""

    def __init__(self) -> None:
        # { org_id: { user_id: [WebSocket, ...] } }
        # A list per user, not a single socket: one person legitimately has several
        # tabs open, and each is its own connection.
        self._connections: dict[str, dict[str, list[WebSocket]]] = defaultdict(
            lambda: defaultdict(list)
        )
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, org_id: str, user_id: str) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[org_id][user_id].append(ws)
        logger.info("WS connected: org=%s user=%s", org_id, user_id)

    async def disconnect(self, ws: WebSocket, org_id: str, user_id: str) -> None:
        async with self._lock:
            self._discard(org_id, user_id, ws)
        logger.info("WS disconnected: org=%s user=%s", org_id, user_id)

    def _discard(self, org_id: str, user_id: str, ws: WebSocket) -> None:
        """Remove one socket and prune the empty containers it leaves behind.

        Caller must hold the lock. Pruning matters because _connections is a
        defaultdict: without it, every org and user that ever connected keeps an
        empty list forever, so the dict grows for the process's lifetime.
        """
        sockets = self._connections.get(org_id, {}).get(user_id)
        if not sockets:
            return
        if ws in sockets:
            sockets.remove(ws)
        if not sockets:
            self._connections[org_id].pop(user_id, None)
        if not self._connections.get(org_id):
            self._connections.pop(org_id, None)

    async def _snapshot(self, org_id: str) -> list[tuple[str, WebSocket]]:
        """A stable [(user_id, socket)] copy taken under the lock.

        Iterating self._connections directly would raise "dictionary changed size
        during iteration" the moment another coroutine connects or disconnects
        mid-broadcast — which, with per-tab sockets and a busy Celery stream, is a
        matter of when rather than if. Sending happens outside the lock so one slow
        client cannot block every other delivery.
        """
        async with self._lock:
            return [
                (user_id, ws)
                for user_id, sockets in self._connections.get(org_id, {}).items()
                for ws in sockets
            ]

    async def _send_many(
        self, org_id: str, targets: list[tuple[str, WebSocket]], payload: dict
    ) -> int:
        """Send to each target, reaping any socket that fails. Returns delivered count."""
        dead: list[tuple[str, WebSocket]] = []
        delivered = 0
        for user_id, ws in targets:
            try:
                await ws.send_json(payload)
                delivered += 1
            except Exception:  # noqa: BLE001 — a dead peer must not stop the fan-out
                dead.append((user_id, ws))
        if dead:
            async with self._lock:
                for user_id, ws in dead:
                    self._discard(org_id, user_id, ws)
            logger.info("WS reaped %d dead connection(s) for org=%s", len(dead), org_id)
        return delivered

    async def broadcast_to_org(self, org_id: str, payload: dict) -> int:
        """Send to every socket in an org. Returns how many actually received it."""
        return await self._send_many(org_id, await self._snapshot(org_id), payload)

    async def send_to_user(self, org_id: str, user_id: str, payload: dict) -> int:
        """Send to one user's sockets (every tab). Returns how many received it.

        Dead sockets are reaped here too. The spec's sketch swallowed send errors
        silently on this path, which leaks a closed socket permanently — it stays
        in the dict and every later send retries and re-fails against it.
        """
        async with self._lock:
            targets = [(user_id, ws) for ws in self._connections.get(org_id, {}).get(user_id, [])]
        return await self._send_many(org_id, targets, payload)

    def connection_count(self, org_id: str | None = None) -> int:
        """Live socket count — for tests and the health/metrics surface."""
        orgs = [org_id] if org_id else list(self._connections.keys())
        return sum(
            len(sockets)
            for org in orgs
            for sockets in self._connections.get(org, {}).values()
        )


ws_manager = WebSocketManager()  # singleton, per process
