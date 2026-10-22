"""Test 6 (required order): a real (small population/generation count for test
speed) evolution run against real backtested strategies — confirms at least one
evolved candidate is produced, registered, and linked via MUTATED_FROM in Research Memory."""

from __future__ import annotations

import uuid

from app.db.tenant import bind_organization
from app.models.evolution_run import EvolutionRun, EvolutionRunStatus
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.services.evolution import create_evolution_run, run_evolution_in_session
from sqlalchemy import select

from tests.data_helpers import seed_oscillating_market_with_features, seed_strategy
from tests.helpers import create_org_user


async def test_real_evolution_run_produces_registered_candidate_with_lineage(
    db_session_factory, fake_graph_repo
):
    org, user = await create_org_user(
        db_session_factory, org_name="Evo Co", slug="evo-co", email="evo@co.io"
    )
    symbol = "EVOTEST"
    await seed_oscillating_market_with_features(
        db_session_factory, organization_id=org.id, symbol=symbol
    )
    seed_id = await seed_strategy(
        db_session_factory, organization_id=org.id, name="RSI Seed", status=StrategyStatus.ACTIVE,
        valid_rules=True, robustness_score=0.5,
    )
    # seed_strategy() inserts directly via the ORM (bypassing create_strategy), so it
    # never went through GraphSyncService. In real usage an ACTIVE strategy would
    # already be graph-synced (it went through create -> submit -> approve, each
    # step syncing per Batch 7); simulate that realistic precondition here so the
    # MUTATED_FROM edge's MATCH on the parent node succeeds.
    await fake_graph_repo.merge_node(
        str(org.id), label="Strategy", key_value=str(seed_id),
        properties={"name": "RSI Seed", "version": "v1.0", "status": "active", "robustness_score": 0.5},
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        run = await create_evolution_run(
            session,
            organization_id=org.id,
            symbol=symbol,
            ga_config_overrides={
                "population_size": 4,
                "max_generations": 2,
                "elitism_fraction": 0.25,
                "tournament_size": 2,
                "plateau_generations": 5,
                "convergence_window": 100,
            },
            seed_strategy_ids=[seed_id],
        )
        run_id = run.id

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        result = await run_evolution_in_session(
            session, organization_id=org.id, run_id=run_id, user_id=user.id
        )
    print("Evolution run result:", result)
    assert result["status"] == "completed", result

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        completed_run = (
            await session.execute(select(EvolutionRun).where(EvolutionRun.id == run_id))
        ).scalar_one()
        assert completed_run.status == EvolutionRunStatus.COMPLETED
        assert completed_run.generations_run >= 1
        assert len(completed_run.generation_history) >= 2  # generation 0 + at least 1 more
        assert completed_run.best_fitness is not None
        assert len(completed_run.candidate_strategy_ids) >= 1

        candidate_uuids = [uuid.UUID(s) for s in completed_run.candidate_strategy_ids]
        candidates = (
            await session.execute(select(Strategy).where(Strategy.id.in_(candidate_uuids)))
        ).scalars().all()
        assert len(candidates) >= 1
        for c in candidates:
            assert c.creator == StrategyCreator.GA_ENGINE
            assert c.parent_strategy_id == seed_id
            assert c.status == StrategyStatus.CANDIDATE  # auto-submitted (draft -> candidate)
            # The registration backtest is persisted, not just the fitness number...
            assert c.backtest_robustness is not None
            # ...but it is NOT a gate score: a GA candidate earns robustness_score only
            # from the 5-method validation suite (ADR 0008).
            assert c.robustness_score is None

    # MUTATED_FROM edges must exist in the graph for every registered candidate
    # (GA_ENGINE creator -> MUTATED_FROM, per app/graph/sync_service.py).
    for c in candidates:
        node = await fake_graph_repo.get_node(str(org.id), node_type="Strategy", node_id=str(c.id))
        assert node is not None, f"candidate {c.id} never synced to the graph"
        mutated_from = [e for e in node["outgoing"] if e["edge_type"] == "MUTATED_FROM"]
        assert len(mutated_from) == 1, f"expected exactly one MUTATED_FROM edge for {c.id}"
        assert mutated_from[0]["other"]["strategy_id"] == str(seed_id)
