"""Failure intelligence endpoints (Batch 6)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.core.logging import get_current_request_id
from app.core.rate_limit import llm_rate_limiter
from app.models.failure import Failure, FailureTrigger
from app.models.strategy import Strategy
from app.models.user import User
from app.schemas.failure import (
    ExplanationEnqueued,
    FailureCluster,
    FailureClustersResponse,
    FailureHeatmapCell,
    FailureHeatmapResponse,
    FailureListItem,
    FailureListResponse,
    FailureRead,
)
from app.services.llm_explain import explanation_status
from app.services.system_health import is_worker_online

router = APIRouter(prefix="/failures", tags=["Failure Intelligence"])


@router.get("", response_model=FailureListResponse)
async def list_failures(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    strategy_id: uuid.UUID | None = Query(default=None),
    regime: str | None = Query(default=None),
    trigger_condition: FailureTrigger | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> FailureListResponse:
    conditions = []
    if strategy_id is not None:
        conditions.append(Failure.strategy_id == strategy_id)
    if regime is not None:
        conditions.append(Failure.regime_at_failure == regime)
    if trigger_condition is not None:
        conditions.append(Failure.trigger_condition == trigger_condition)
    if start is not None:
        conditions.append(Failure.failure_timestamp >= start)
    if end is not None:
        conditions.append(Failure.failure_timestamp <= end)

    total = await db.scalar(select(func.count()).select_from(Failure).where(*conditions))
    rows = (
        await db.execute(
            select(Failure, Strategy.name, Strategy.symbol)
            .join(Strategy, Strategy.id == Failure.strategy_id)
            .where(*conditions)
            .order_by(Failure.failure_timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return FailureListResponse(
        total=total or 0,
        count=len(rows),
        items=[
            FailureListItem.model_validate(failure).model_copy(
                update={
                    "llm_explanation_status": explanation_status(failure),
                    "symbol": _failure_symbol(failure, strategy_symbol),
                    "strategy_name": name,
                }
            )
            for failure, name, strategy_symbol in rows
        ],
    )


@router.get("/clusters", response_model=FailureClustersResponse)
async def failure_clusters(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> FailureClustersResponse:
    """Group failures by (regime × trigger_condition) with counts for the bubble chart."""
    rows = (await db.execute(select(Failure))).scalars().all()
    groups: dict[tuple[str, FailureTrigger], list[uuid.UUID]] = defaultdict(list)
    for f in rows:
        groups[(f.regime_at_failure, f.trigger_condition)].append(f.id)
    clusters = [
        FailureCluster(
            regime_at_failure=regime,
            trigger_condition=trigger,
            count=len(ids),
            failure_ids=ids,
        )
        for (regime, trigger), ids in sorted(groups.items(), key=lambda kv: -len(kv[1]))
    ]
    return FailureClustersResponse(clusters=clusters)


@router.get("/heatmap", response_model=FailureHeatmapResponse)
async def failure_heatmap(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> FailureHeatmapResponse:
    """Count of failures grouped by (strategy, regime) — the Main Dashboard's
    D3 heatmap (Batch 12): strategy x regime matrix, color intensity = count.
    Distinct from /failures/clusters above (regime x trigger_condition, Batch 6)."""
    rows = (
        await db.execute(
            select(Failure.strategy_id, Strategy.name, Failure.regime_at_failure, func.count())
            .join(Strategy, Strategy.id == Failure.strategy_id)
            .group_by(Failure.strategy_id, Strategy.name, Failure.regime_at_failure)
        )
    ).all()
    return FailureHeatmapResponse(
        cells=[
            FailureHeatmapCell(
                strategy_id=strategy_id, strategy_name=name, regime_at_failure=regime, count=count
            )
            for strategy_id, name, regime, count in rows
        ]
    )


def _failure_symbol(failure: Failure, strategy_symbol: str | None) -> str | None:
    """The instrument a failure belongs to. The failure row is append-only, so older rows
    that never recorded one are resolved read-side from the strategy's own instrument
    (the symbol it was backtested and monitored on) instead of being edited."""
    recorded = (failure.market_context_snapshot or {}).get("symbol")
    return recorded or (strategy_symbol.strip().upper() if strategy_symbol else None)


async def _get_failure_or_404(db: AsyncSession, failure_id: uuid.UUID) -> Failure:
    failure = (
        await db.execute(select(Failure).where(Failure.id == failure_id))
    ).scalar_one_or_none()
    if failure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Failure not found")
    return failure


@router.get("/{failure_id}", response_model=FailureRead)
async def get_failure(
    failure_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> FailureRead:
    failure = await _get_failure_or_404(db, failure_id)
    strategy = await db.get(Strategy, failure.strategy_id)
    status_value = explanation_status(failure)
    return FailureRead.model_validate(failure).model_copy(
        update={
            "llm_explanation_status": status_value,
            "symbol": _failure_symbol(failure, strategy.symbol if strategy else None),
            "strategy_name": strategy.name if strategy else None,
            "background_worker_online": await is_worker_online() if status_value == "queued" else None,
        }
    )


@router.post(
    "/{failure_id}/explanation",
    response_model=ExplanationEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue AI explanation generation for a failure that has none yet",
    dependencies=[Depends(llm_rate_limiter)],
)
async def request_failure_explanation(
    failure_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ExplanationEnqueued:
    """Batch 25: recovers failures whose automatic explanation never ran (no key at
    the time, no worker, a crashed task). Never overwrites a real explanation, and
    refuses honestly when no capable provider is configured."""
    failure = await _get_failure_or_404(db, failure_id)
    status_value = explanation_status(failure)
    if status_value == "generated":
        return ExplanationEnqueued(
            failure_id=failure.id, llm_explanation_status=status_value, message="An explanation already exists."
        )
    if status_value == "unavailable":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI explanations are unavailable: no Anthropic API key is configured on the server.",
        )

    from app.worker.tasks import run_failure_explanation

    try:
        result = run_failure_explanation.delay(
            organization_id=str(current_user.organization_id),
            failure_id=str(failure.id),
            requested_by_user_id=str(current_user.id),
            request_id=get_current_request_id(),
        )
    except Exception as exc:  # noqa: BLE001 — broker unreachable
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The background job queue is unavailable; try again later.",
        ) from exc
    return ExplanationEnqueued(
        failure_id=failure.id,
        llm_explanation_status="queued",
        message="Explanation generation queued. It appears here once a background worker finishes it.",
        task_id=result.id,
    )
