"""Best-effort outgoing webhook notifications (Batch 15).

Used by the public demo-request endpoint to ping a Discord/Slack-style incoming
webhook so a human sees new leads in real time. Deliberately best-effort: the
caller has always already persisted the durable record before calling this, so a
webhook failure is logged and swallowed, never surfaced to the visitor.

Runs the blocking `requests` POST (an already-declared runtime dependency) in a
thread via ``asyncio.to_thread`` so a slow/hung webhook host can't block the API
event loop.
"""

from __future__ import annotations

import asyncio
import logging

import requests

logger = logging.getLogger(__name__)


async def post_webhook(url: str | None, payload: dict, *, timeout: float = 5.0) -> bool:
    """POST ``payload`` as JSON to ``url``. Returns True on a 2xx, False on any
    failure or when ``url`` is falsy (unset webhook = documented no-op)."""
    if not url:
        logger.info("Webhook not configured; skipping notification. payload_keys=%s", list(payload))
        return False
    try:
        def _send() -> int:
            resp = requests.post(url, json=payload, timeout=timeout)
            return resp.status_code

        status_code = await asyncio.to_thread(_send)
        if 200 <= status_code < 300:
            return True
        logger.warning("Webhook POST returned non-2xx status %s", status_code)
        return False
    except Exception:  # noqa: BLE001 — best-effort; never let a webhook failure escape
        logger.warning("Webhook POST failed", exc_info=True)
        return False
