"""Nightly consistency sweep: detects orphaned graph nodes, Postgres strategies that
never made it into the graph, and missing lineage edges. Logs signals only — never
auto-deletes/auto-fixes."""

from __future__ import annotations

import uuid

import pytest
from app.db.tenant import bind_organization, mark_session_unscoped
from app.graph.consistency import check_organization_consistency
from app.models.organization import Organization, OrganizationTier
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus


@pytest.mark.anyio
async def test_consistency_sweep_flags_unsynced_and_orphaned_and_missing_edges(
    db_session_factory, fake_graph_repo
):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(name="Consistency Org", slug="consistency-org", tier=OrganizationTier.STARTER, max_strategies=25, is_active=True)
        session.add(org)
        await session.flush()
        org_id = org.id

        synced = Strategy(organization_id=org_id, name="Synced", version="v1.0", creator=StrategyCreator.HUMAN, status=StrategyStatus.DRAFT)
        unsynced = Strategy(organization_id=org_id, name="Unsynced", version="v1.0", creator=StrategyCreator.HUMAN, status=StrategyStatus.DRAFT)
        session.add_all([synced, unsynced])
        await session.flush()

        # A child strategy with a parent_strategy_id, but its MUTATED_FROM edge is
        # deliberately never synced (both nodes exist, but the edge doesn't).
        child = Strategy(
            organization_id=org_id, name="Child", version="v1.0", creator=StrategyCreator.GA_ENGINE,
            status=StrategyStatus.DRAFT, parent_strategy_id=synced.id,
        )
        session.add(child)
        await session.commit()
        await session.refresh(synced)
        await session.refresh(unsynced)
        await session.refresh(child)

    # Sync only `synced` and `child` to the graph (as nodes), but never create the
    # MUTATED_FROM edge between them, and never sync `unsynced` at all. Also plant
    # an orphaned graph node with no matching Postgres row.
    await fake_graph_repo.merge_node(
        str(org_id), label="Strategy", key_value=str(synced.id),
        properties={"name": "Synced", "version": "v1.0", "status": "draft", "robustness_score": None},
    )
    await fake_graph_repo.merge_node(
        str(org_id), label="Strategy", key_value=str(child.id),
        properties={"name": "Child", "version": "v1.0", "status": "draft", "robustness_score": None},
    )
    orphan_id = str(uuid.uuid4())
    await fake_graph_repo.merge_node(
        str(org_id), label="Strategy", key_value=orphan_id,
        properties={"name": "Ghost", "version": "v1.0", "status": "draft", "robustness_score": None},
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_id)
        result = await check_organization_consistency(session, org_id)

    assert result["unsynced_strategies"] == [str(unsynced.id)]
    assert result["orphaned_graph_nodes"] == [orphan_id]
    assert result["missing_lineage_edges"] == [str(child.id)]


@pytest.mark.anyio
async def test_consistency_sweep_clean_when_everything_synced(db_session_factory, fake_graph_repo):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(name="Clean Org", slug="clean-org", tier=OrganizationTier.STARTER, max_strategies=25, is_active=True)
        session.add(org)
        await session.flush()
        org_id = org.id
        strategy = Strategy(organization_id=org_id, name="Solo", version="v1.0", creator=StrategyCreator.HUMAN, status=StrategyStatus.DRAFT)
        session.add(strategy)
        await session.commit()
        await session.refresh(strategy)

    await fake_graph_repo.merge_node(
        str(org_id), label="Strategy", key_value=str(strategy.id),
        properties={"name": "Solo", "version": "v1.0", "status": "draft", "robustness_score": None},
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_id)
        result = await check_organization_consistency(session, org_id)

    assert result["unsynced_strategies"] == []
    assert result["orphaned_graph_nodes"] == []
    assert result["missing_lineage_edges"] == []
