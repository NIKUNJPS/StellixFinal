"""Strategy lifecycle endpoints (Batch 4)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db, require_permission, require_scope
from app.core.logging import get_current_request_id
from app.core.rate_limit import backtest_rate_limiter, validate_rate_limiter
from app.models.organization import Organization
from app.models.performance_snapshot import PerformanceSnapshot
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.strategy_version import StrategyVersion
from app.models.user import User
from app.models.validation_result import ValidationResult
from app.rbac.catalog import P
from app.schemas.failure import ManualFailEnqueued, ManualFailRequest
from app.schemas.strategy import (
    ApproveRequest,
    BacktestChartSeries,
    BacktestEnqueuedResponse,
    BacktestRequest,
    BacktestResultsResponse,
    MonteCarloDistributionResponse,
    PerformanceSnapshotRead,
    RetireRequest,
    StrategyCreateRequest,
    StrategyDetailResponse,
    StrategyListItem,
    StrategyListResponse,
    StrategyRead,
    StrategySaveVersionRequest,
    StrategyUpdateRequest,
    StrategyVersionRead,
    TopPerformerItem,
    TopPerformersResponse,
    TradeRecordRead,
    TransitionRequest,
    ValidateEnqueuedResponse,
    ValidateRequest,
    ValidationResultRead,
    VersionDiff,
)
from app.services import strategy as svc
from app.strategy.lifecycle import LifecycleError

router = APIRouter(prefix="/strategies", tags=["Strategy Lifecycle"])

_TUNABLE = ("parameters", "entry_rules", "exit_rules", "risk_constraints")


def _lifecycle_http(exc: LifecycleError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


async def _get_or_404(db: AsyncSession, strategy_id: uuid.UUID) -> Strategy:
    strategy = (
        await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    ).scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    return strategy


@router.post(
    "",
    response_model=StrategyRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_scope("strategies:write"))],
)
async def create_strategy(
    payload: StrategyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    organization = (
        await db.execute(
            select(Organization).where(Organization.id == current_user.organization_id)
        )
    ).scalar_one()
    try:
        return await svc.create_strategy(
            db, organization=organization, user=current_user, data=payload.model_dump()
        )
    except svc.StrategyLimitError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc)) from exc


@router.get("", response_model=StrategyListResponse, dependencies=[Depends(require_scope("strategies:read"))])
async def list_strategies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    status_filter: StrategyStatus | None = Query(default=None, alias="status"),
    creator: StrategyCreator | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> StrategyListResponse:
    conditions = []
    if status_filter is not None:
        conditions.append(Strategy.status == status_filter)
    if creator is not None:
        conditions.append(Strategy.creator == creator)

    total = await db.scalar(
        select(func.count()).select_from(Strategy).where(*conditions)
    )
    rows = (
        await db.execute(
            select(Strategy)
            .where(*conditions)
            .order_by(Strategy.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return StrategyListResponse(
        total=total or 0,
        count=len(rows),
        items=[StrategyListItem.model_validate(r) for r in rows],
    )


@router.get(
    "/top-performers",
    response_model=TopPerformersResponse,
    summary="Top strategies by Sharpe, with equity curves (Main Dashboard overlay chart, Batch 12)",
)
async def top_performers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    limit: int = Query(default=5, ge=1, le=20),
) -> TopPerformersResponse:
    # MUST be registered before GET /{strategy_id} below, or FastAPI would try
    # to parse "top-performers" as a UUID path param and 422.
    items = await svc.get_top_performers(db, limit=limit)
    return TopPerformersResponse(items=[TopPerformerItem(**item) for item in items])


@router.get("/{strategy_id}", response_model=StrategyDetailResponse)
async def get_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> StrategyDetailResponse:
    strategy = await _get_or_404(db, strategy_id)
    versions = (
        await db.execute(
            select(StrategyVersion)
            .where(StrategyVersion.strategy_id == strategy_id)
            .order_by(StrategyVersion.created_at.asc())
        )
    ).scalars().all()
    performance = (
        await db.execute(
            select(PerformanceSnapshot)
            .where(PerformanceSnapshot.strategy_id == strategy_id)
            .order_by(PerformanceSnapshot.regime_label.asc())
        )
    ).scalars().all()
    return StrategyDetailResponse(
        strategy=StrategyRead.model_validate(strategy),
        versions=[StrategyVersionRead.model_validate(v) for v in versions],
        performance=[PerformanceSnapshotRead.model_validate(p) for p in performance],
    )


@router.put("/{strategy_id}", response_model=StrategyRead)
async def update_strategy(
    strategy_id: uuid.UUID,
    payload: StrategyUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    data = payload.model_dump(exclude_unset=True)
    try:
        return await svc.update_strategy(
            db, strategy=strategy, data=data, change_reason=data.get("change_reason"), user=current_user
        )
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.delete(
    "/{strategy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete an unsubmitted draft (its creator or an admin only)",
    dependencies=[Depends(require_scope("strategies:write"))],
)
async def delete_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Response:
    strategy = await _get_or_404(db, strategy_id)
    try:
        await svc.delete_draft_strategy(db, strategy=strategy, user=current_user)
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{strategy_id}/versions",
    response_model=StrategyRead,
    status_code=status.HTTP_201_CREATED,
    summary="Save rule/parameter changes as a new version (change reason required)",
    dependencies=[Depends(require_scope("strategies:write"))],
)
async def save_strategy_version(
    strategy_id: uuid.UUID,
    payload: StrategySaveVersionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    data = payload.model_dump(exclude_unset=True, exclude={"change_reason"})
    try:
        return await svc.save_new_version(
            db, strategy=strategy, user=current_user, data=data, change_reason=payload.change_reason
        )
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.get("/{strategy_id}/versions", response_model=list[VersionDiff])
async def get_versions(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[VersionDiff]:
    await _get_or_404(db, strategy_id)
    versions = (
        await db.execute(
            select(StrategyVersion)
            .where(StrategyVersion.strategy_id == strategy_id)
            .order_by(StrategyVersion.created_at.asc())
        )
    ).scalars().all()

    diffs: list[VersionDiff] = []
    prev_snapshot: dict | None = None
    for v in versions:
        snap = v.parameters_snapshot or {}
        if prev_snapshot is None:
            changed = sorted(k for k in _TUNABLE if snap.get(k))
        else:
            changed = sorted(k for k in _TUNABLE if snap.get(k) != prev_snapshot.get(k))
        diffs.append(
            VersionDiff(
                version_number=v.version_number,
                change_reason=v.change_reason,
                created_at=v.created_at,
                changed_keys=changed,
            )
        )
        prev_snapshot = snap
    return diffs


@router.post("/{strategy_id}/submit", response_model=StrategyRead)
async def submit_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await svc.submit(db, strategy=strategy, user=current_user)
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.post("/{strategy_id}/transition", response_model=StrategyRead)
async def transition_strategy(
    strategy_id: uuid.UUID,
    payload: TransitionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await svc.transition(
            db, strategy=strategy, target=payload.target_status, user=current_user, reason=payload.reason
        )
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.post("/{strategy_id}/approve", response_model=StrategyRead)
async def approve_strategy(
    strategy_id: uuid.UUID,
    payload: ApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await svc.approve(
            db,
            strategy=strategy,
            user=current_user,
            action=payload.action,
            justification=payload.justification,
        )
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.post("/{strategy_id}/retire", response_model=StrategyRead)
async def retire_strategy(
    strategy_id: uuid.UUID,
    payload: RetireRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await svc.retire(db, strategy=strategy, user=current_user, reason=payload.reason)
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.post(
    "/{strategy_id}/backtest",
    response_model=BacktestEnqueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(backtest_rate_limiter)],
)
async def backtest_strategy(
    strategy_id: uuid.UUID,
    payload: BacktestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> BacktestEnqueuedResponse:
    await _get_or_404(db, strategy_id)
    from app.worker.tasks import run_strategy_backtest

    result = run_strategy_backtest.delay(
        organization_id=str(current_user.organization_id),
        strategy_id=str(strategy_id),
        symbol=payload.symbol,
        request_id=get_current_request_id(),
    )
    return BacktestEnqueuedResponse(
        strategy_id=strategy_id,
        symbol=payload.symbol.strip().upper(),
        message="Backtest enqueued. Poll GET /strategies/{id}/backtest-results.",
        task_id=result.id,
    )


@router.get(
    "/{strategy_id}/backtest-results",
    response_model=BacktestResultsResponse,
    summary="Full Backtest Results detail (10 metrics, trade log, chart series) — Page 13, Batch 12",
)
async def get_backtest_results(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> BacktestResultsResponse:
    await _get_or_404(db, strategy_id)
    result = await svc.get_backtest_results(db, strategy_id=strategy_id)
    return BacktestResultsResponse(
        strategy_id=strategy_id,
        has_run=result["has_run"],
        aggregate=PerformanceSnapshotRead.model_validate(result["aggregate"]) if result["aggregate"] else None,
        per_regime=[PerformanceSnapshotRead.model_validate(p) for p in result["per_regime"]],
        trades=[TradeRecordRead.model_validate(t) for t in result["trades"]],
        charts=BacktestChartSeries(**result["charts"]) if result["charts"] else None,
    )


@router.post(
    "/{strategy_id}/fail",
    response_model=ManualFailEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Manually flag an active strategy as failed (governance role + reason)",
)
async def fail_strategy(
    strategy_id: uuid.UUID,
    payload: ManualFailRequest,
    current_user: User = Depends(require_permission(P.STRATEGY_FAIL_MANUAL)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ManualFailEnqueued:
    strategy = await _get_or_404(db, strategy_id)
    if strategy.status != StrategyStatus.ACTIVE:
        # Only active strategies can fail (active→failed hook).
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only an active strategy can be failed (is {strategy.status.value})",
        )

    from app.worker.tasks import run_manual_failure

    result = run_manual_failure.delay(
        organization_id=str(current_user.organization_id),
        strategy_id=str(strategy_id),
        symbol=payload.symbol,
        reason=payload.reason,
        user_id=str(current_user.id),
        request_id=get_current_request_id(),
    )
    return ManualFailEnqueued(
        strategy_id=strategy_id,
        message="Failure flagging enqueued (context capture + SHAP). Poll GET /failures.",
        task_id=result.id,
    )


async def _latest_validation(db: AsyncSession, strategy_id: uuid.UUID) -> ValidationResult | None:
    return (
        await db.execute(
            select(ValidationResult)
            .where(ValidationResult.strategy_id == strategy_id)
            .order_by(ValidationResult.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


@router.post(
    "/{strategy_id}/validate",
    response_model=ValidateEnqueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run the 5-method validation suite (async)",
    dependencies=[Depends(validate_rate_limiter)],
)
async def validate_strategy(
    strategy_id: uuid.UUID,
    payload: ValidateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ValidateEnqueuedResponse:
    await _get_or_404(db, strategy_id)
    from app.worker.tasks import run_strategy_validation

    result = run_strategy_validation.delay(
        organization_id=str(current_user.organization_id),
        strategy_id=str(strategy_id),
        symbol=payload.symbol,
        request_id=get_current_request_id(),
    )
    return ValidateEnqueuedResponse(
        strategy_id=strategy_id,
        symbol=payload.symbol.strip().upper(),
        message="Validation enqueued (walk-forward + 1000 Monte-Carlo sims + 3 methods). "
        "Poll GET /strategies/{id}/validation.",
        task_id=result.id,
    )


@router.get(
    "/{strategy_id}/validation",
    response_model=ValidationResultRead,
    summary="Full validation breakdown (5 sub-scores, composite, classification)",
)
async def get_validation(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ValidationResult:
    await _get_or_404(db, strategy_id)
    result = await _latest_validation(db, strategy_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No validation result yet"
        )
    return result


@router.get(
    "/{strategy_id}/validation/monte-carlo-distribution",
    response_model=MonteCarloDistributionResponse,
    summary="Raw Monte-Carlo Sharpe/drawdown distribution for charting",
)
async def get_monte_carlo_distribution(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> MonteCarloDistributionResponse:
    await _get_or_404(db, strategy_id)
    result = await _latest_validation(db, strategy_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No validation result yet"
        )
    mc = (result.method_details or {}).get("monte_carlo", {})
    return MonteCarloDistributionResponse(
        strategy_id=strategy_id,
        n_simulations=mc.get("n_simulations", 0),
        tolerance=mc.get("tolerance"),
        p95_drawdown=mc.get("p95_drawdown"),
        median_sharpe=mc.get("median_sharpe"),
        sharpe_hist=mc.get("sharpe_hist", {}),
        drawdown_hist=mc.get("drawdown_hist", {}),
    )
