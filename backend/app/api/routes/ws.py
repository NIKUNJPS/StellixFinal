"""WebSocket endpoint (Batch 19).

Auth is the same JWT the HTTP routes use, passed as a query parameter because the
browser WebSocket API cannot set an Authorization header. That is the standard
workaround, and it carries a real cost: query strings land in proxy/access logs in
a way headers do not. The tokens here are the 15-minute access tokens
(ACCESS_TOKEN_EXPIRE_MINUTES), never the refresh cookie, which keeps the blast
radius of a logged URL to one short-lived token.

The connection is registered under the org from the VERIFIED token claims, never
under the org in the path — see below.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import TokenError, decode_access_token
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# Application-defined close codes (4000-4999 is the private range). The client
# treats these two as terminal and stops reconnecting — retrying a rejected token
# in a backoff loop just burns the connection budget until the user re-auths.
WS_CLOSE_UNAUTHORIZED = 4001
WS_CLOSE_ORG_MISMATCH = 4003


@router.websocket("/ws/{org_id}/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    org_id: str,
    user_id: str,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """Authenticate, register the socket, then hold it open.

    Note the claim names: this token carries ``sub`` and ``org`` (see
    app/core/security.py:create_access_token). Reading ``org_id`` off the payload —
    as the Batch 19 brief sketched — yields None for every token ever issued, so
    every connection would close 4003 and the feature would be dead on arrival.
    """
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        # decode_access_token RAISES on a bad/expired token; it never returns None,
        # so a falsy-payload check would let an invalid token through to the
        # comparisons below.
        logger.info("WS auth rejected: %s", exc)
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return

    if str(payload.get("sub")) != user_id:
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="Unauthorized")
        return

    if str(payload.get("org")) != org_id:
        # The path is untrusted input. Without this, anyone with a valid token for
        # org A could subscribe to org B's stream by editing the URL — the manager
        # would happily register them and every broadcast_to_org(B) would deliver
        # another tenant's regime changes and failures straight to their browser.
        logger.warning(
            "WS org mismatch: token org=%s requested=%s", payload.get("org"), org_id
        )
        await websocket.close(code=WS_CLOSE_ORG_MISMATCH, reason="Org mismatch")
        return

    # Registered under the verified claims, not the path values. They are equal by
    # the checks above; using the claims means a future change to those checks
    # cannot silently start trusting the URL.
    verified_org = str(payload["org"])
    verified_user = str(payload["sub"])

    await ws_manager.connect(websocket, verified_org, verified_user)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                # Application-level keepalive. Distinct from the protocol-level
                # ping/pong frames, which the browser WebSocket API gives no way to
                # send — hence a text ping the client can actually issue.
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        # finally, not just the except: any error in the loop must still unregister
        # the socket, or it leaks into the connection dict and every later
        # broadcast retries a send against a closed peer.
        await ws_manager.disconnect(websocket, verified_org, verified_user)
