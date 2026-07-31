"""Backfill the Neo4j knowledge graph from existing Postgres rows.

WHY THIS EXISTS
---------------
``GraphSyncService`` is a *dual-write*: the Postgres-side service layer calls it
immediately after every create/update, so the graph stays current as work happens.
But rows that entered Postgres by any *other* path never triggered that write —
most importantly the demo seed (``scripts/seed_demo_data.py``), which inserts
directly via the ORM, and any rows created while Neo4j was down (the sync degrades
gracefully and returns). For those, the graph is simply empty.

This command reconciles an organization's graph by replaying its existing rows
through the **real** ``GraphSyncService`` — the exact same methods the live app
calls, against the real ``Neo4jGraphRepository``. It is not a parallel
reimplementation: if the sync logic changes, this backfill changes with it for free.

It is idempotent (every write is a MERGE), so re-running is safe.

USAGE
-----
    python -m scripts.backfill_graph --org-slug meridian-capital
    python -m scripts.backfill_graph --all           # every organization
    python -m scripts.backfill_graph --org-slug x --dry-run   # count only, no writes
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.graph.sync_service import GraphSyncService
from app.models.failure import Failure
from app.models.organization import Organization
from app.models.performance_snapshot import PerformanceSnapshot
from app.models.research_note import ResearchNote
from app.models.strategy import Strategy
from sqlalchemy import select


async def _resolve_orgs(slug: str | None, do_all: bool) -> list[tuple[str, str]]:
    """Return [(org_id, slug)]. Uses an unscoped system session (cross-tenant read)."""
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        stmt = select(Organization.id, Organization.slug)
        if not do_all:
            stmt = stmt.where(Organization.slug == slug)
        rows = (await s.execute(stmt)).all()
    return [(str(r[0]), r[1]) for r in rows]


async def backfill_org(org_id: str, slug: str, *, dry_run: bool) -> dict:
    """Replay one org's strategies, failures, performance snapshots and notes
    through the real GraphSyncService, in dependency order.

    ORDER IS CORRECTNESS-CRITICAL, because ``repository.merge_edge`` does
    ``MATCH (a) MATCH (b) MERGE (a)-[e]->(b)`` — it requires BOTH endpoint nodes to
    already exist and silently creates nothing if either is missing (it does NOT
    MERGE stub endpoints). Strategies and notes reference each other:

        Strategy -[:INSPIRED_BY]-> ResearchNote   (from Strategy.inspired_by_note_id)
        ResearchNote -[:INSPIRED_BY]-> Strategy   (from ResearchNote.related_strategy_ids)

    That cycle means no single pass can satisfy both — whichever side syncs first,
    its outgoing edge to the not-yet-created other side is dropped. So we make a
    final second strategy pass once notes exist; every write is an idempotent MERGE,
    so re-running the strategy sync only fills in the previously-unresolvable
    Strategy->ResearchNote edges and changes nothing else.

      1. strategies      -> Strategy nodes + MUTATED_FROM/ADAPTED_FROM/VALID_IN
                            (+ Strategy->ResearchNote INSPIRED_BY, resolved in step 5)
      2. failures         -> Failure nodes + FAILED_IN + CAUSED_BY(Performance)
      3. performance       -> Performance nodes + EVALUATED_BY
      4. research notes    -> ResearchNote nodes + AUTHORED_BY(Researcher) + INSPIRED_BY
      5. strategies again  -> now-resolvable Strategy->ResearchNote INSPIRED_BY edges
    """
    sync = GraphSyncService()  # no override -> real Neo4jGraphRepository via get_driver()

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
        # Second pass: notes now exist, so Strategy->ResearchNote INSPIRED_BY resolves.
        for strategy in strategies:
            await sync.sync_strategy_node(session, strategy)

    return counts


async def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill the Neo4j knowledge graph from Postgres.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--org-slug", help="Backfill a single organization by slug.")
    group.add_argument("--all", action="store_true", help="Backfill every organization.")
    parser.add_argument("--dry-run", action="store_true", help="Count rows only; write nothing.")
    args = parser.parse_args()

    orgs = await _resolve_orgs(args.org_slug, args.all)
    if not orgs:
        print(f"No organization matched slug={args.org_slug!r}", file=sys.stderr)
        return 1

    grand = {"strategies": 0, "failures": 0, "performance": 0, "notes": 0}
    for org_id, slug in orgs:
        counts = await backfill_org(org_id, slug, dry_run=args.dry_run)
        verb = "would sync" if args.dry_run else "synced"
        print(
            f"[{slug}] {verb}: "
            f"{counts['strategies']} strategies, {counts['failures']} failures, "
            f"{counts['performance']} performance snapshots, {counts['notes']} notes"
        )
        for k in grand:
            grand[k] += counts[k]

    if len(orgs) > 1:
        print(
            f"[TOTAL] {grand['strategies']} strategies, {grand['failures']} failures, "
            f"{grand['performance']} performance snapshots, {grand['notes']} notes"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
