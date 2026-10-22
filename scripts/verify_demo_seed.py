#!/usr/bin/env python3
"""Verify the seeded Meridian demo org (Batch 16).

Builds this org's Research Memory from Postgres, runs its five named queries and
prints the Postgres-side KPIs the dashboards read, so the seed's Definition of
Done ("5 graph queries return interesting results; every major page populated")
can be checked with actual output rather than asserted.

Usage (from repo root, using the backend venv):

    backend/.venv/Scripts/python.exe scripts/verify_demo_seed.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

try:
    from dotenv import load_dotenv

    for _envf in (REPO_ROOT / "backend" / ".env", REPO_ROOT / "infra" / ".env"):
        if _envf.exists():
            load_dotenv(_envf, override=False)
except ImportError:
    pass

from sqlalchemy import func, select  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.session import get_system_session, get_tenant_session  # noqa: E402
from app.db.tenant import bind_organization, mark_session_unscoped  # noqa: E402
from app.graph.backfill import backfill_org  # noqa: E402
from app.graph.memory_repository import InMemoryGraphRepository  # noqa: E402
from app.graph.sync_service import GraphSyncService  # noqa: E402
from app.models.evolution_run import EvolutionRun  # noqa: E402
from app.models.failure import Failure  # noqa: E402
from app.models.market_data import MarketData  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.research_note import ResearchNote  # noqa: E402
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus  # noqa: E402

ORG_SLUG = "meridian-capital"


def _hr(title: str) -> None:
    print(f"\n{'─' * 70}\n{title}\n{'─' * 70}")


async def _org_id() -> str:
    async with get_system_session() as session:
        mark_session_unscoped(session.sync_session)
        org = (
            await session.execute(select(Organization).where(Organization.slug == ORG_SLUG))
        ).scalar_one_or_none()
        if org is None:
            print(f"No org with slug '{ORG_SLUG}' — run scripts/seed_demo_data.py first.")
            raise SystemExit(1)
        return str(org.id)


async def dashboard_kpis(org_id: str) -> tuple[str | None, str | None]:
    """Print the Postgres KPIs the dashboards read; return (a regime with a failure,
    a grandchild strategy id) for the graph queries."""
    async with get_tenant_session(org_id) as session:
        bind_organization(session.sync_session, org_id)

        by_status = {
            st.value: await session.scalar(
                select(func.count()).select_from(Strategy).where(Strategy.status == st)
            )
            for st in StrategyStatus
        }
        total = await session.scalar(select(func.count()).select_from(Strategy))
        avg_robust = await session.scalar(
            select(func.avg(Strategy.robustness_score)).where(Strategy.robustness_score.isnot(None))
        )
        failures = await session.scalar(select(func.count()).select_from(Failure))
        notes = await session.scalar(select(func.count()).select_from(ResearchNote))
        runs = await session.scalar(select(func.count()).select_from(EvolutionRun))
        ga = await session.scalar(
            select(func.count()).select_from(Strategy).where(Strategy.creator == StrategyCreator.GA_ENGINE)
        )
        bars = await session.scalar(select(func.count()).select_from(MarketData))

        _hr("MAIN DASHBOARD KPIs (real Postgres aggregates)")
        print(f"  Market-data bars ...... {bars}")
        print(f"  Strategies (total) .... {total}   by status: {by_status}")
        print(f"  Avg robustness ........ {avg_robust:.3f}" if avg_robust else "  Avg robustness ........ n/a")
        print(f"  Failures .............. {failures}")
        print(f"  Evolution runs ........ {runs}   GA-authored strategies: {ga}")
        print(f"  Research notes ........ {notes}")

        # a regime that actually has a failure (cluster regime = most frequent)
        regime_rows = (
            await session.execute(
                select(Failure.regime_at_failure, func.count())
                .group_by(Failure.regime_at_failure)
                .order_by(func.count().desc())
            )
        ).all()
        failure_regime = regime_rows[0][0] if regime_rows else None
        print(f"  Failure regimes ....... {[(r, c) for r, c in regime_rows]}")

        # a grandchild = GA strategy whose parent is itself a child with a parent
        ga_children = (
            await session.execute(
                select(Strategy.id, Strategy.parent_strategy_id).where(
                    Strategy.creator == StrategyCreator.GA_ENGINE,
                    Strategy.parent_strategy_id.isnot(None),
                )
            )
        ).all()
        by_id = {sid: pid for sid, pid in ga_children}
        grandchild = None
        for sid, pid in ga_children:
            if pid in by_id:  # parent is also an evolved strategy → sid is >=2 levels deep
                grandchild = str(sid)
                break
        if grandchild is None and ga_children:
            grandchild = str(ga_children[0][0])
        return failure_regime, grandchild


async def graph_queries(org_id: str, failure_regime: str | None, grandchild: str | None) -> None:
    repo = InMemoryGraphRepository()
    await backfill_org(org_id, ORG_SLUG, sync=GraphSyncService(repository=repo))

    _hr("GRAPH QUERY 1 — failed_strategies_by_regime")
    if failure_regime:
        rows = await repo.failed_strategies_by_regime(
            org_id, regime=failure_regime, since=datetime(2000, 1, 1, tzinfo=timezone.utc)
        )
        print(f"  regime={failure_regime!r}: {len(rows)} failed strategies")
        for r in rows:
            print(f"    • {r['name']:32s} trigger={r['trigger_condition']:16s} at {r['failure_timestamp'][:10]}")
    else:
        print("  (no failures present)")

    _hr("GRAPH QUERY 2 — lineage (parent → child → grandchild)")
    if grandchild:
        lin = await repo.lineage(org_id, strategy_id=grandchild)
        tgt = lin.get("target") or {}
        print(f"  target={tgt.get('name')!r} ({grandchild[:8]})")
        print(f"  ancestors={len(lin['ancestors'])}  descendants={len(lin['descendants'])}  edges={len(lin['edges'])}")
        for a in lin["ancestors"]:
            print(f"    ↑ ancestor: {a.get('name')} [{a.get('status')}]")
        depth = len(lin["ancestors"])
        print(f"  → lineage depth from this node: {depth} level(s) of ancestry "
              f"({'OK ≥2' if depth >= 2 else 'shallow'})")
    else:
        print("  (no evolved strategies present)")

    # min_regimes=4 / min_occurrences=3 match the frontend's hardcoded defaults
    # (frontend/lib/graph.ts), so this is a faithful proxy for the UI buttons.
    _hr("GRAPH QUERY 3 — robust_across_regimes (min_regimes=4, matches UI)")
    rows = await repo.robust_across_regimes(org_id, min_regimes=4)
    print(f"  {len(rows)} strategies valid in ≥4 regimes")
    for r in rows[:10]:
        print(f"    • {r['name']:32s} regimes={r['regime_count']}  robustness={r['robustness_score']}")

    _hr("GRAPH QUERY 4 — recurring_failure_modes (min_occurrences=3, matches UI)")
    rows = await repo.recurring_failure_modes(org_id, min_occurrences=3)
    print(f"  {len(rows)} recurring (regime, trigger) modes")
    for r in rows:
        print(f"    • {r['regime_label']} / {r['trigger_condition']}: {r['occurrence_count']}× "
              f"across {r['strategy_count']} strategies")
    if not rows:
        # fall back to the full distribution so the output is still informative
        allrows = await repo.recurring_failure_modes(org_id, min_occurrences=1)
        print(f"  (min_occurrences=1 distribution: {len(allrows)} modes)")
        for r in allrows:
            print(f"    · {r['regime_label']} / {r['trigger_condition']}: {r['occurrence_count']}×")

    _hr("GRAPH QUERY 5 — hypotheses_leading_to_active")
    rows = await repo.hypotheses_leading_to_active(org_id)
    print(f"  {len(rows)} research notes that inspired an active strategy")
    for r in rows:
        names = ", ".join(s["name"] for s in r["active_strategies"])
        hyp = (r.get("hypothesis") or "")[:70]
        print(f"    • note → active: {names}")
        print(f"      hypothesis: {hyp}…")


async def main() -> None:
    org_id = await _org_id()
    print(f"Verifying demo org {ORG_SLUG} ({org_id})")
    failure_regime, grandchild = await dashboard_kpis(org_id)
    await graph_queries(org_id, failure_regime, grandchild)
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
