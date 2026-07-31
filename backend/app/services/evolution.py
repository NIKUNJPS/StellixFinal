"""Evolution engine orchestration (Batch 8): loads a seed population, runs the GA
loop (backtesting every individual every generation), registers final-generation
survivors as new candidate Strategy rows, and chains Batch-5 validation for each.

Population-seeding note (documented per docs/schemas.md): DEAP crossover requires
individuals of matching gene count/order, so a GA run operates against ONE parameter
space at a time. The seed strategy with the highest ``robustness_score`` becomes the
template; any OTHER seed strategy whose derived gene count matches the template's is
included directly as a starting individual (real cross-strategy diversity); the
remaining population slots are filled with Gaussian-perturbed clones of the template
(standard GA bootstrap) so the run still proceeds meaningfully with a single seed.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from dataclasses import asdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_current_request_id
from app.core.metrics import evolution_runs_total
from app.db.session import get_tenant_session
from app.evolution import encoding
from app.evolution.fitness import compute_fitness
from app.evolution.ga import GAConfig, GAResult, run_ga
from app.models.evolution_run import EvolutionRun, EvolutionRunStatus
from app.models.notification import NotificationType
from app.models.organization import Organization
from app.models.performance_snapshot import AGGREGATE_LABEL, PerformanceSnapshot
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.user import User
from app.services.notification import create_notification
from app.services.strategy import _load_backtest_frames
from app.strategy.backtest import BacktestResult, run_regime_aware_backtest
from app.ws.events import publish_evolution_progress

logger = logging.getLogger(__name__)


async def _notify_evolution_completed(
    session: AsyncSession, *, run: EvolutionRun, user_id: uuid.UUID, failed: bool
) -> None:
    """Batch 12: notify whoever started the run — user_id is already threaded
    through from run_evolution_task.delay(..., user_id=...), no new column
    needed on EvolutionRun to carry it."""
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return
    if failed:
        message = f"Evolution run for {run.symbol} failed: {run.error}"
    else:
        n_candidates = len(run.candidate_strategy_ids)
        fitness = f"{run.best_fitness:.4f}" if run.best_fitness is not None else "n/a"
        message = (
            f"Evolution run for {run.symbol} completed: {n_candidates} candidate(s) "
            f"produced (best fitness {fitness})."
        )
    await create_notification(
        session,
        organization_id=run.organization_id,
        user=user,
        type=NotificationType.EVOLUTION_COMPLETED,
        message=message,
        link=f"/admin/evolution?run_id={run.id}",
    )


def _strategy_dict(strategy: Strategy) -> dict:
    return {
        "entry_rules": strategy.entry_rules,
        "exit_rules": strategy.exit_rules,
        "risk_constraints": strategy.risk_constraints,
    }


def _gene_key(genes: list[float]) -> tuple[float, ...]:
    return tuple(round(g, 8) for g in genes)


async def create_evolution_run(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    ga_config_overrides: dict | None,
    seed_strategy_ids: list[uuid.UUID] | None,
) -> EvolutionRun:
    config = GAConfig(**(ga_config_overrides or {}))
    run = EvolutionRun(
        organization_id=organization_id,
        symbol=symbol.strip().upper(),
        status=EvolutionRunStatus.RUNNING,
        ga_config=asdict(config),
        seed_strategy_ids=[str(s) for s in (seed_strategy_ids or [])],
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def _load_seed_population(
    session: AsyncSession, seed_strategy_ids: list[str] | None
) -> list[Strategy]:
    if seed_strategy_ids:
        rows = (
            await session.execute(
                select(Strategy).where(Strategy.id.in_([uuid.UUID(s) for s in seed_strategy_ids]))
            )
        ).scalars().all()
        return list(rows)
    rows = (
        await session.execute(
            select(Strategy).where(Strategy.status.in_([StrategyStatus.ACTIVE, StrategyStatus.CANDIDATE]))
        )
    ).scalars().all()
    return list(rows)


def _build_initial_population(
    seed_strategies: list[Strategy], config: GAConfig
) -> tuple[Strategy, list[list[float]], list[tuple[float, float]]]:
    template = max(seed_strategies, key=lambda s: (s.robustness_score or 0.0))
    template_dict = _strategy_dict(template)
    specs = encoding.derive_parameter_space(template_dict)
    gene_bounds = [(spec.min, spec.max) for spec in specs]
    base_genes = encoding.encode(template_dict)

    individuals: list[list[float]] = []
    for strategy in seed_strategies:
        try:
            genes = encoding.encode(_strategy_dict(strategy))
        except Exception:  # noqa: BLE001 — structurally incompatible template, skip
            continue
        if len(genes) == len(base_genes):
            individuals.append(genes)

    rng = random.Random(42)
    while len(individuals) < config.population_size:
        perturbed = [
            g + rng.gauss(0, max(0.1 * (hi - lo), 1e-6))
            for g, (lo, hi) in zip(base_genes, gene_bounds, strict=False)
        ]
        individuals.append(perturbed)
    return template, individuals[: config.population_size], gene_bounds


async def run_evolution(organization_id: uuid.UUID, run_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    """Celery-facing entry point: opens its own tenant session. Tests call
    ``run_evolution_in_session`` directly with a session bound to the test DB —
    mirrors ``persist_failure`` (session-injected, testable) vs. ``monitor_and_fail``
    (opens ``get_tenant_session``, production/Celery path) in app/services/failure.py.
    """
    async with get_tenant_session(organization_id) as session:
        return await run_evolution_in_session(session, organization_id=organization_id, run_id=run_id, user_id=user_id)


async def run_evolution_in_session(
    session: AsyncSession, *, organization_id: uuid.UUID, run_id: uuid.UUID, user_id: uuid.UUID
) -> dict:
    run = (await session.execute(select(EvolutionRun).where(EvolutionRun.id == run_id))).scalar_one()
    config = GAConfig(**run.ga_config)
    evolution_runs_total.inc()
    try:
        seed_strategies = await _load_seed_population(session, run.seed_strategy_ids)
        if not seed_strategies:
            raise ValueError("No Active/Candidate strategies available to seed the population")
        # Record the ACTUAL population used, even when the request asked for "all"
        # (in which case seed_strategy_ids started empty) — the frontend's lineage
        # tree needs this to know which strategy the run traces back to.
        run.seed_strategy_ids = [str(s.id) for s in seed_strategies]

        template, initial_individuals, gene_bounds = _build_initial_population(seed_strategies, config)
        feature_df, regime_df = await _load_backtest_frames(session, run.symbol)
        if feature_df.empty:
            raise ValueError(f"No feature data for {run.symbol}; ingest it first")

        template_dict = _strategy_dict(template)
        results_cache: dict[tuple[float, ...], BacktestResult] = {}

        def evaluate_fn(genes: list[float]) -> float:
            decoded = encoding.decode(genes, template_dict)
            result = run_regime_aware_backtest(decoded, feature_df, regime_df)
            results_cache[_gene_key(genes)] = result
            return compute_fitness(result.per_regime, result.robustness_score)

        # Batch 19: publish evolution_progress after each generation. run_ga is
        # CPU-bound sync code that would otherwise block this event loop for the
        # whole run, so it now runs in a worker thread — which both frees the loop
        # and gives the per-generation callback a thread to fire from. The callback
        # bridges back with run_coroutine_threadsafe (the correct sync-thread ->
        # async-loop hop); publishing to Redis is best-effort, so a failed hop is
        # logged and never disturbs the GA. Threading is determinism-safe here: the
        # loop awaits the single GA thread, so `random`'s global state is still
        # touched by one thread at a time.
        loop = asyncio.get_running_loop()

        def _on_generation(record, max_generations: int) -> None:
            fut = asyncio.run_coroutine_threadsafe(
                publish_evolution_progress(
                    org_id=str(organization_id),
                    job_id=str(run_id),
                    generation=record.generation,
                    max_generations=max_generations,
                    best_fitness=record.best_fitness,
                    avg_fitness=record.avg_fitness,
                ),
                loop,
            )
            try:
                fut.result(timeout=5)
            except Exception:  # noqa: BLE001 — realtime is disposable; never stall the GA
                logger.warning("evolution_progress publish failed for run %s", run_id, exc_info=True)

        ga_result: GAResult = await asyncio.to_thread(
            run_ga, initial_individuals, gene_bounds, evaluate_fn, config, _on_generation
        )

        candidate_ids = await _register_candidates(
            session,
            organization_id=organization_id,
            user_id=user_id,
            template=template,
            ga_result=ga_result,
            results_cache=results_cache,
            symbol=run.symbol,
        )

        run.status = EvolutionRunStatus.COMPLETED
        run.generation_history = [asdict(rec) for rec in ga_result.history]
        run.best_fitness = ga_result.best_fitness
        run.generations_run = ga_result.generations_run
        run.candidate_strategy_ids = candidate_ids
        await _notify_evolution_completed(session, run=run, user_id=user_id, failed=False)
        await session.commit()
        return {"run_id": str(run_id), "status": "completed", "candidates": candidate_ids}
    except Exception as exc:  # noqa: BLE001 — persist the failure, don't crash the worker
        run.status = EvolutionRunStatus.FAILED
        run.error = str(exc)
        await _notify_evolution_completed(session, run=run, user_id=user_id, failed=True)
        await session.commit()
        return {"run_id": str(run_id), "status": "failed", "error": str(exc)}


async def _register_candidates(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    template: Strategy,
    ga_result: GAResult,
    results_cache: dict[tuple[float, ...], BacktestResult],
    symbol: str,
) -> list[str]:
    from app.services.strategy import (
        StrategyLimitError,
        create_strategy,
        maybe_notify_approval_requested,
    )

    organization = (
        await session.execute(select(Organization).where(Organization.id == organization_id))
    ).scalar_one()
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
    template_dict = _strategy_dict(template)

    seen: set[tuple[float, ...]] = set()
    candidate_ids: list[str] = []
    for genes, _fitness in ga_result.final_population:
        key = _gene_key(genes)
        if key in seen:
            continue
        seen.add(key)

        decoded = encoding.decode(genes, template_dict)
        data = {
            "name": f"{template.name} (evolved {key[:2]})",
            "description": f"GA-evolved from {template.name} (v{template.version})",
            "creator": StrategyCreator.GA_ENGINE.value,
            "parameters": decoded["parameters"],
            "entry_rules": decoded["entry_rules"],
            "exit_rules": decoded["exit_rules"],
            "risk_constraints": decoded["risk_constraints"],
            "parent_strategy_id": template.id,
        }
        try:
            candidate = await create_strategy(session, organization=organization, user=user, data=data)
        except StrategyLimitError:
            break  # respect the org's strategy cap; stop registering further candidates

        result = results_cache.get(key)
        if result is not None:
            await _persist_backtest_result(session, candidate, result, symbol)

        candidate.status = StrategyStatus.CANDIDATE
        await maybe_notify_approval_requested(session, candidate)
        await session.commit()
        await session.refresh(candidate)

        from app.worker.tasks import run_strategy_validation

        try:
            run_strategy_validation.delay(
                organization_id=str(organization_id),
                strategy_id=str(candidate.id),
                symbol=symbol,
                request_id=get_current_request_id(),
            )
        except Exception:  # noqa: BLE001 — best-effort chain; the run itself already succeeded
            pass

        candidate_ids.append(str(candidate.id))
    return candidate_ids


async def _persist_backtest_result(
    session: AsyncSession, strategy: Strategy, result: BacktestResult, symbol: str
) -> None:
    """Persist the fitness-evaluation backtest already computed during the GA loop,
    so a freshly-registered candidate has real performance data immediately —
    avoids re-running the same backtest a second time."""
    from app.graph.sync_service import GraphSyncService

    rows = list(result.per_regime.items()) + [(AGGREGATE_LABEL, result.aggregate)]
    snapshots = []
    for label, metrics in rows:
        snapshot = PerformanceSnapshot(
            strategy_id=strategy.id,
            regime_label=label,
            sharpe_ratio=metrics["sharpe_ratio"],
            max_drawdown=metrics["max_drawdown"],
            win_rate=metrics["win_rate"],
            profit_factor=metrics["profit_factor"],
            calmar_ratio=metrics["calmar_ratio"],
            trade_count=metrics["trade_count"],
            period_start=result.period_start,
            period_end=result.period_end,
        )
        session.add(snapshot)
        await session.flush()
        snapshots.append(snapshot)

    strategy.robustness_score = result.robustness_score
    strategy.regime_compatibility = result.regime_compatibility
    await session.commit()
    await session.refresh(strategy)

    graph = GraphSyncService()
    await graph.sync_strategy_node(session, strategy)
    for snapshot in snapshots:
        await graph.sync_performance_node(session, snapshot)
