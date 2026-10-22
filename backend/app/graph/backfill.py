"""Replay an organization's Postgres rows through GraphSyncService (used by
``memory_index`` to rebuild Research Memory from the database).

ORDER IS CORRECTNESS-CRITICAL: ``repository.merge_edge`` needs BOTH endpoint nodes to
already exist and silently creates nothing if either is missing. Strategies and notes
reference each other (Strategy -[:INSPIRED_BY]-> ResearchNote and the reverse), so no
single pass satisfies both; a final second strategy pass resolves the first direction once
notes exist. Every write is an idempotent upsert, so re-running is safe.

  1. strategies      -> Strategy nodes + MUTATED_FROM/ADAPTED_FROM/VALID_IN
  2. failures        -> Failure nodes + FAILED_IN + CAUSED_BY(Performance)
  3. performance     -> Performance nodes + EVALUATED_BY
  4. research notes  -> ResearchNote nodes + AUTHORED_BY(Researcher) + INSPIRED_BY
  5. strategies again-> now-resolvable Strategy->ResearchNote INSPIRED_BY edges
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.graph.sync_service import GraphSyncService
from app.models.failure import Failure
from app.models.organization import Organization
from app.models.performance_snapshot import PerformanceSnapshot
from app.models.research_note import ResearchNote
from app.models.strategy import Strategy


async def resolve_orgs(slug: str | None, do_all: bool) -> list[tuple[str, str]]:
    """[(org_id, slug)] via an unscoped system session (cross-tenant read)."""
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        stmt = select(Organization.id, Organization.slug)
        if not do_all:
            stmt = stmt.where(Organization.slug == slug)
        rows = (await s.execute(stmt)).all()
    return [(str(r[0]), r[1]) for r in rows]


async def backfill_org(
    org_id: str, slug: str, *, dry_run: bool = False, sync: GraphSyncService | None = None
) -> dict:
    """Replay one org's Postgres rows through ``sync`` (default: the process-wide
    Research Memory index). Returns the row counts."""
    sync = sync or GraphSyncService()
    async with get_tenant_session(uuid.UUID(org_id)) as session:
        strategies = (await session.execute(select(Strategy))).scalars().all()
        failures = (await session.execute(select(Failure))).scalars().all()
        snapshots = (await session.execute(select(PerformanceSnapshot))).scalars().all()
        notes = (await session.execute(select(ResearchNote))).scalars().all()

        counts = {
            "strategies": len(strategies),
            "failures": len(failures),
            "performance": len(snapshots),
            "notes": len(notes),
        }
        if dry_run:
            return counts

        for strategy in strategies:
            await sync.sync_strategy_node(session, strategy)
        for failure in failures:
            await sync.sync_failure_node(session, failure)
        for snapshot in snapshots:
            await sync.sync_performance_node(session, snapshot)
        for note in notes:
            await sync.sync_research_note_node(session, note)
        for strategy in strategies:
            await sync.sync_strategy_node(session, strategy)
    return counts
