"""Long-running Alpaca IEX trade streamer -> Redis cache -> browser (``etf_ticks``).

Run exactly ONE — Alpaca's free plan allows a single websocket connection per account:

    python -m app.streaming.etf_stream

Not a Celery task: it holds a websocket open indefinitely, which a task queue is the
wrong tool for. Trades can arrive many times a second; the browser gets at most one
batched update per second (``PUBLISH_INTERVAL_SECONDS``).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import requests
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

from app.core.config import settings
from app.services import realtime_etf

logger = logging.getLogger(__name__)

PUBLISH_INTERVAL_SECONDS = 1.0
HEARTBEAT_INTERVAL_SECONDS = 5.0
SNAPSHOT_REFRESH_SECONDS = 600.0
MAX_BACKOFF_SECONDS = 30.0
# 406: another client already holds this account's only connection.
CONNECTION_LIMIT_BACKOFF_SECONDS = 60.0
# 402 auth failed, 409 insufficient subscription: retrying can't fix these.
FATAL_CODES = frozenset({402, 409})


class AlpacaStreamError(Exception):
    def __init__(self, code: int | None, message: str) -> None:
        self.code = code
        super().__init__(f"Alpaca stream error {code}: {message}")


def handle_frame(entries: dict[str, dict], raw: str | bytes) -> set[str]:
    """Apply one websocket message (always a JSON array). Returns the symbols whose
    displayed state changed; raises ``AlpacaStreamError`` for server-reported errors."""
    changed: set[str] = set()
    for message in json.loads(raw):
        kind = message.get("T")
        if kind == "t":
            if realtime_etf.apply_trade(entries, message["S"], float(message["p"]), message["t"]):
                changed.add(message["S"])
        elif kind == "error":
            raise AlpacaStreamError(message.get("code"), message.get("msg", ""))
        elif kind == "subscription":
            logger.info("Alpaca subscription confirmed: trades=%s", message.get("trades"))
    return changed


async def _expect(ws, msg: str) -> None:
    """Wait for a ``{"T": "success", "msg": msg}`` control message."""
    while True:
        frame = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
        for message in frame:
            if message.get("T") == "error":
                raise AlpacaStreamError(message.get("code"), message.get("msg", ""))
            if message.get("T") == "success" and message.get("msg") == msg:
                return


async def _refresh_snapshot(entries: dict[str, dict]) -> None:
    try:
        snapshot = await asyncio.to_thread(realtime_etf.fetch_snapshots)
    except requests.RequestException as exc:
        logger.warning("Alpaca snapshot fetch failed (keeping current prices): %s", exc)
        return
    realtime_etf.merge_snapshot(entries, snapshot)


async def stream_once(entries: dict[str, dict], url: str, state: dict) -> None:
    """One connection's lifetime. Returns never; raises when the connection ends."""
    async with connect(url, open_timeout=10) as ws:
        await _expect(ws, "connected")
        await ws.send(
            json.dumps(
                {"action": "auth", "key": settings.ALPACA_API_KEY_ID, "secret": settings.ALPACA_API_SECRET_KEY}
            )
        )
        await _expect(ws, "authenticated")
        await ws.send(json.dumps({"action": "subscribe", "trades": list(realtime_etf.SYMBOLS)}))
        state["backoff"] = 1.0
        logger.info("Alpaca IEX stream connected; subscribed to %s", ", ".join(realtime_etf.SYMBOLS))

        await realtime_etf.mark_stream_alive()
        await realtime_etf.save_and_publish(entries)
        now = time.monotonic()
        last_publish = last_beat = last_snapshot = now
        dirty = False
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=PUBLISH_INTERVAL_SECONDS)
                dirty |= bool(handle_frame(entries, raw))
            except TimeoutError:
                pass
            now = time.monotonic()
            if now - last_snapshot >= SNAPSHOT_REFRESH_SECONDS:
                await _refresh_snapshot(entries)
                last_snapshot, dirty = now, True
            if dirty and now - last_publish >= PUBLISH_INTERVAL_SECONDS:
                await realtime_etf.save_and_publish(entries)
                last_publish, dirty = now, False
            if now - last_beat >= HEARTBEAT_INTERVAL_SECONDS:
                await realtime_etf.mark_stream_alive()
                last_beat = now


async def _idle() -> None:
    """Stay alive doing nothing (a supervisor restarting an unconfigured streamer in a
    loop would just spam the same log line)."""
    await asyncio.Event().wait()


async def run(*, url: str | None = None) -> None:
    if not realtime_etf.is_configured():
        logger.warning(
            "ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY not set — real-time ETF stream disabled. Idling."
        )
        await _idle()
        return

    url = url or settings.ALPACA_STREAM_URL
    entries = await realtime_etf.load_entries()
    await _refresh_snapshot(entries)
    await realtime_etf.save(entries)

    state = {"backoff": 1.0}
    while True:
        try:
            await stream_once(entries, url, state)
        except AlpacaStreamError as exc:
            if exc.code in FATAL_CODES:
                logger.error("%s — not retrying. Fix the Alpaca keys/plan, then restart the streamer.", exc)
                await _idle()
                return
            delay = CONNECTION_LIMIT_BACKOFF_SECONDS if exc.code == 406 else state["backoff"]
            logger.warning("%s — reconnecting in %.0fs", exc, delay)
        except (OSError, ConnectionClosed, InvalidHandshake, TimeoutError) as exc:
            delay = state["backoff"]
            logger.warning("Alpaca stream disconnected (%s) — reconnecting in %.0fs", exc, delay)
        await asyncio.sleep(delay)
        state["backoff"] = min(state["backoff"] * 2, MAX_BACKOFF_SECONDS)


def main() -> None:
    from app.core.logging import configure_logging

    configure_logging()
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
