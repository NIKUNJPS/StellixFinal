"""Nightly graph consistency sweep (Batch 7).

Detects two classes of drift between Postgres (source of truth) and the graph:
  - orphaned graph nodes: a Strategy node in Neo4j with no matching Postgres row
    (e.g. after a hard delete).
  - unsynced strategies: a Postgres Strategy row with no matching Neo4j node — the
    most likely real-world case given Neo4j sync degrades gracefully when
    unreachable (see docs/schemas.md), so writes made while Neo4j was down never
    retro-synced.
  - missing lineage edges: a Postgres Strategy with parent_strategy_id set but no
    corresponding MUTATED_FROM/ADAPTED_FROM edge in the graph (a relationship
    integrity violation — the node synced but its edge didn't, or vice versa).

Findings are logged as data-quality signals (never auto-deleted/auto-fixed); Batch 12
adds persistent storage + the System Monitoring page surfacing them.
"""

from __future__ import annotations

import logging
import uuid

from neo4j.exceptions import GqlError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.sync_service import GraphSyncService
from app.models.strategy import Strategy

logger = logging.getLogger(__name__)

# Same "Neo4j unreachable/degraded" classification GraphSyncService's write
# paths already use (app/graph/sync_service.py's _DEGRADE_ON) — the read paths
# here (all_node_ids/get_node) never had the equivalent guard, so a down Neo4j
# crashed the whole sweep with a raw driver exception instead of degrading
# gracefully like every other Neo4j-touching code path in this codebase.
_DEGRADE_ON = (GqlError, OSError)


async def check_organization_consistency(session: AsyncSession, organization_id: uuid.UUID) -> dict:
    """Run the sweep for one organization. ``session`` must already be tenant-bound."""
    graph = GraphSyncService()
    org = str(organization_id)

    pg_rows = (await session.execute(select(Strategy.id, Strategy.parent_strategy_id))).all()
    pg_ids = {str(r[0]) for r in pg_rows}

    try:
        graph_ids = set(await graph.repository.all_node_ids(org, node_type="Strategy"))
    except _DEGRADE_ON:
        logger.warning("Consistency sweep skipped for org %s: Neo4j unreachable", org, exc_info=True)
        return {
            "organization_id": org,
            "graph_unreachable": True,
            "orphaned_graph_nodes": [],
            "unsynced_strategies": [],
            "missing_lineage_edges": [],
        }

    orphaned_graph_nodes = sorted(graph_ids - pg_ids)
    unsynced_strategies = sorted(pg_ids - graph_ids)

    missing_lineage_edges: list[str] = []
    for strategy_id, parent_id in pg_rows:
        if parent_id is None:
            continue
        if str(strategy_id) not in graph_ids or str(parent_id) not in graph_ids:
            continue  # node-level sync gap already reported above
        detail = await graph.repository.get_node(org, node_type="Strategy", node_id=str(strategy_id))
        has_edge = detail is not None and any(
            e["edge_type"] in ("MUTATED_FROM", "ADAPTED_FROM") and e["other"].get("strategy_id") == str(parent_id)
            for e in detail["outgoing"]
        )
        if not has_edge:
            missing_lineage_edges.append(str(strategy_id))

    result = {
        "organization_id": org,
        "graph_unreachable": False,
        "orphaned_graph_nodes": orphaned_graph_nodes,
        "unsynced_strategies": unsynced_strategies,
        "missing_lineage_edges": missing_lineage_edges,
    }
    if orphaned_graph_nodes or unsynced_strategies or missing_lineage_edges:
        logger.warning("Graph consistency drift detected for org %s: %s", org, result)
    else:
        logger.info("Graph consistency sweep clean for org %s", org)
    return result


async def run_consistency_sweep() -> list[dict]:
    """Sweep every organization (invoked by the nightly Celery beat task)."""
    from app.db.session import get_system_session, get_tenant_session
    from app.models.organization import Organization

    async with get_system_session() as session:
        org_ids = (await session.execute(select(Organization.id))).scalars().all()

    results = []
    for org_id in org_ids:
        async with get_tenant_session(org_id) as session:
            results.append(await check_organization_consistency(session, org_id))

    # Batch 12: persist the latest sweep result per org for the System
    # Monitoring page's alerting log. Redis, not a new Postgres table — this
    # is operational telemetry (what did the last sweep find), not durable
    # business data; a 48h TTL means a stopped sweep naturally stops showing
    # a stale alert rather than showing one forever.
    from app.services.system_health import record_consistency_sweep_result

    for result in results:
        await record_consistency_sweep_result(result)
    return results
