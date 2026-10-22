"""Research Memory index lifecycle — see docs/adr/0012-research-memory-on-postgres.md.

The index is *derived* data: every node and relationship can be rebuilt from Postgres.
The API process builds it at startup and rebuilds it every
``RESEARCH_MEMORY_REFRESH_SECONDS``; writes made inside the API land in it immediately
(``GraphSyncService``), and writes made by Celery workers appear after the next rebuild.

  * a rebuild is built off to the side and swapped in atomically, so readers never see a
    half-built index (except the very first build, which publishes as it fills);
  * tenant isolation is structural: every node is keyed by ``organization_id``;
  * the last rebuild's counts are kept in ``last_status()`` for the System page.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import get_system_session
from app.db.tenant import mark_session_unscoped
from app.graph.backfill import backfill_org, resolve_orgs
from app.graph.memory_repository import InMemoryGraphRepository
from app.graph.sync_service import GraphSyncService, set_repository_override
from app.models.strategy import Strategy

logger = logging.getLogger(__name__)

_task: asyncio.Task | None = None
_last_status: dict[str, Any] | None = None


def last_status() -> dict[str, Any] | None:
    """Counts and time of the last completed rebuild in this process (None before the first)."""
    return _last_status


async def _orgs_largest_first() -> list[tuple[str, str]]:
    """Organizations that have strategies, biggest first, so the tenants people actually use
    are queryable within seconds and tiny/leftover ones trail behind."""
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        sizes = {
            str(org_id): n
            for org_id, n in (
                await s.execute(select(Strategy.organization_id, func.count()).group_by(Strategy.organization_id))
            ).all()
        }
    orgs = [o for o in await resolve_orgs(None, True) if sizes.get(o[0], 0) > 0]
    return sorted(orgs, key=lambda o: -sizes[o[0]])


async def rebuild(*, publish_early: bool = False) -> dict[str, int]:
    """Replay every organization that has strategies into a fresh graph, then swap it in.

    ``publish_early`` is for the very first build, when there is no previous graph to keep
    serving: the half-built graph is installed immediately and fills in largest-org-first."""
    fresh = InMemoryGraphRepository()
    if publish_early:
        set_repository_override(fresh)
    sync = GraphSyncService(repository=fresh)
    totals = {"orgs": 0, "strategies": 0, "failures": 0, "performance": 0, "notes": 0}
    for org_id, slug in await _orgs_largest_first():
        try:
            counts = await backfill_org(org_id, slug, sync=sync)
        except Exception:  # noqa: BLE001 - one bad tenant must not blank everyone's index
            logger.exception("research memory: rebuild failed for org %s", slug)
            continue
        if counts["strategies"] or counts["failures"] or counts["notes"]:
            totals["orgs"] += 1
            for key in ("strategies", "failures", "performance", "notes"):
                totals[key] += counts[key]
    set_repository_override(fresh)
    global _last_status
    _last_status = {
        **totals,
        "rebuilt_at": datetime.now(UTC).isoformat(),
        "refresh_seconds": max(30, settings.RESEARCH_MEMORY_REFRESH_SECONDS),
    }
    return totals


async def _loop() -> None:
    interval = max(30, settings.RESEARCH_MEMORY_REFRESH_SECONDS)
    first = True
    while True:
        try:
            totals = await rebuild(publish_early=first)
            first = False
            logger.info("research memory rebuilt: %s", totals)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep serving the last good index
            logger.exception("research memory: refresh failed; keeping the previous index")
        await asyncio.sleep(interval)


def start() -> None:
    """Install an (initially empty) graph immediately and build it in the background, so API
    startup is never blocked on the replay."""
    global _task
    if _task is not None:
        return
    set_repository_override(InMemoryGraphRepository())
    _task = asyncio.create_task(_loop(), name="research-memory-refresh")


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
    set_repository_override(None)
