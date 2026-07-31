"""Failure intelligence endpoints (Batch 6)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.models.failure import Failure, FailureTrigger
from app.models.strategy import Strategy
from app.models.user import User
from app.schemas.failure import (
    FailureCluster,
    FailureClustersResponse,
    FailureHeatmapCell,
    FailureHeatmapResponse,
    FailureListItem,
    FailureListResponse,
    FailureRead,
)

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
            select(Failure)
            .where(*conditions)
            .order_by(Failure.failure_timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return FailureListResponse(
        total=total or 0,
        count=len(rows),
        items=[FailureListItem.model_validate(r) for r in rows],
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


@router.get("/{failure_id}", response_model=FailureRead)
async def get_failure(
    failure_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Failure:
    failure = (
        await db.execute(select(Failure).where(Failure.id == failure_id))
    ).scalar_one_or_none()
    if failure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Failure not found")
    return failure
