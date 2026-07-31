"""Evolution engine endpoints (Batch 8)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.core.logging import get_current_request_id
from app.core.rate_limit import evolution_run_rate_limiter
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.evolution_run import EvolutionRun
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.user import User
from app.schemas.evolution import (
    CandidateDecisionRequest,
    EvolutionRunDetail,
    EvolutionRunEnqueued,
    EvolutionRunListResponse,
    EvolutionRunRequest,
    EvolutionRunSummary,
    PendingCandidate,
    PendingCandidatesResponse,
)
from app.schemas.strategy import StrategyRead
from app.services import strategy as strategy_svc
from app.services.evolution import create_evolution_run
from app.strategy.lifecycle import LifecycleError

router = APIRouter(prefix="/evolution", tags=["Evolution Engine"])


@router.post(
    "/run",
    response_model=EvolutionRunEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(evolution_run_rate_limiter)],
)
async def start_evolution_run(
    payload: EvolutionRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> EvolutionRunEnqueued:
    seed_ids = None if payload.strategy_ids == "all" else payload.strategy_ids
    # ga_config is now a strict GAConfigOverrides model (Batch 11) rather than a
    # raw dict — exclude_none so an unset field still falls through to GAConfig's
    # own default, exactly matching the old dict-unpacking semantics.
    run = await create_evolution_run(
        db,
        organization_id=current_user.organization_id,
        symbol=payload.symbol,
        ga_config_overrides=payload.ga_config.model_dump(exclude_none=True),
        seed_strategy_ids=seed_ids,
    )

    from app.worker.tasks import run_evolution_task

    result = run_evolution_task.delay(
        organization_id=str(current_user.organization_id),
        run_id=str(run.id),
        user_id=str(current_user.id),
        request_id=get_current_request_id(),
    )
    return EvolutionRunEnqueued(
        run_id=run.id,
        message="Evolution run enqueued. Poll GET /evolution/runs/{id} for progress.",
        task_id=result.id,
    )


@router.get("/runs", response_model=EvolutionRunListResponse)
async def list_evolution_runs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> EvolutionRunListResponse:
    total = await db.scalar(select(func.count()).select_from(EvolutionRun))
    rows = (
        await db.execute(select(EvolutionRun).order_by(EvolutionRun.created_at.desc()).limit(100))
    ).scalars().all()
    return EvolutionRunListResponse(
        total=total or 0,
        items=[
            EvolutionRunSummary(
                id=r.id,
                symbol=r.symbol,
                status=r.status,
                best_fitness=r.best_fitness,
                generations_run=r.generations_run,
                candidate_count=len(r.candidate_strategy_ids or []),
                created_at=r.created_at,
            )
            for r in rows
        ],
    )


@router.get("/runs/{run_id}", response_model=EvolutionRunDetail)
async def get_evolution_run(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> EvolutionRun:
    run = (await db.execute(select(EvolutionRun).where(EvolutionRun.id == run_id))).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evolution run not found")
    return run


@router.get("/candidates/pending", response_model=PendingCandidatesResponse)
async def list_pending_candidates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> PendingCandidatesResponse:
    decided_ids = select(ApprovalRecord.strategy_id)
    rows = (
        await db.execute(
            select(Strategy)
            .where(Strategy.creator == StrategyCreator.GA_ENGINE)
            .where(Strategy.status == StrategyStatus.CANDIDATE)
            .where(Strategy.id.not_in(decided_ids))
            .order_by(Strategy.created_at.desc())
        )
    ).scalars().all()
    return PendingCandidatesResponse(items=[PendingCandidate.model_validate(r) for r in rows])


async def _get_or_404(db: AsyncSession, strategy_id: uuid.UUID) -> Strategy:
    strategy = (
        await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    ).scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return strategy


@router.post("/candidates/{strategy_id}/approve", response_model=StrategyRead)
async def approve_candidate(
    strategy_id: uuid.UUID,
    payload: CandidateDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await strategy_svc.approve(
            db,
            strategy=strategy,
            user=current_user,
            action=ApprovalAction.APPROVE,
            justification=payload.justification,
        )
    except LifecycleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc)) from exc


@router.post("/candidates/{strategy_id}/reject", response_model=StrategyRead)
async def reject_candidate(
    strategy_id: uuid.UUID,
    payload: CandidateDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await strategy_svc.approve(
            db,
            strategy=strategy,
            user=current_user,
            action=ApprovalAction.REJECT,
            justification=payload.justification,
        )
    except LifecycleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc)) from exc
