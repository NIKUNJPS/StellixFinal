"""Redis -> local WebSocket bridge (Batch 19).

Runs one background task per API process. It subscribes to the realtime channel and
hands each event to this process's ``ws_manager``, which fans it out to the sockets
it actually holds. Every API replica runs its own bridge, so an event published once
(from a Celery worker, or from any replica) reaches every connected user exactly
once per socket regardless of which process produced it.

Started and stopped from the FastAPI lifespan — never from Celery, which has no
sockets to deliver to and must only ever publish.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from app.clients import redis_client
from app.ws.events import SCOPE_GLOBAL, WS_CHANNEL
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

_task: asyncio.Task | None = None

# How long to wait before reconnecting after the subscriber loop dies. Redis going
# away must not permanently kill realtime for the process's lifetime.
_RECONNECT_DELAY_SECONDS = 2.0


async def _dispatch(raw: str) -> None:
    """Route one Redis message to the local sockets it belongs to."""
    try:
        envelope = json.loads(raw)
        payload = envelope["payload"]
        scope = envelope.get("scope")
        org_id = envelope["organization_id"]
    except (ValueError, KeyError, TypeError):
        logger.warning("WS bridge: dropping malformed message", exc_info=True)
        return

    if scope == SCOPE_GLOBAL:
        # Batch 25: public market data. Delivered to every socket, and target lists
        # are ignored on purpose — a global envelope must never become a way to
        # address specific users in another tenant.
        await ws_manager.broadcast_all(payload)
        return
    if not org_id:
        logger.warning("WS bridge: dropping org-scoped message without an organization_id")
        return

    # Delivery stays org-keyed either way, so a target list can only ever narrow
    # within the tenant that published it — never address another org's sockets.
    targets = payload.get("target_user_ids")
    if targets:
        for user_id in targets:
            await ws_manager.send_to_user(org_id, str(user_id), payload)
    else:
        await ws_manager.broadcast_to_org(org_id, payload)


async def _run() -> None:
    """Subscribe and dispatch forever, reconnecting on failure."""
    while True:
        pubsub = None
        try:
            pubsub = redis_client.get_client().pubsub()
            await pubsub.subscribe(WS_CHANNEL)
            logger.info("WS bridge subscribed to %s", WS_CHANNEL)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue  # subscribe/unsubscribe confirmations
                await _dispatch(message["data"])
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — keep realtime alive across Redis blips
            logger.warning(
                "WS bridge subscriber failed; retrying in %.1fs",
                _RECONNECT_DELAY_SECONDS,
                exc_info=True,
            )
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)
        finally:
            if pubsub is not None:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()


async def start() -> None:
    """Start the bridge for this process (idempotent)."""
    global _task
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_run(), name="ws-redis-bridge")
    logger.info("WS bridge started")


async def stop() -> None:
    """Cancel the bridge and wait for it to unwind."""
    global _task
    if _task is None:
        return
    _task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await _task
    _task = None
    logger.info("WS bridge stopped")
