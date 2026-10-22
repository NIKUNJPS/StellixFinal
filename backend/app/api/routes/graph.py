"""Research Memory query endpoints: the 5 named research queries + generic record
detail / search. All tenant-scoped via the caller's JWT organization_id.

The index is in-process and derived from Postgres, so these reads never depend on an
external service; an empty list means the organization genuinely has no matching records.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user
from app.graph.constants import NODE_LABELS
from app.graph.sync_service import GraphSyncService
from app.models.user import User
from app.schemas.graph import (
    ActiveStrategyRef,
    FailedStrategiesByRegimeResponse,
    FailedStrategyByRegimeItem,
    HypothesesLeadingToActiveResponse,
    HypothesisLeadingToActiveItem,
    LineageEdge,
    LineageResponse,
    NodeDetailResponse,
    RecurringFailureModeItem,
    RecurringFailureModesResponse,
    RobustAcrossRegimesItem,
    RobustAcrossRegimesResponse,
    SearchResponse,
    SearchResultItem,
)

router = APIRouter(prefix="/graph", tags=["Research Memory"])

def _org(current_user: User) -> str:
    return str(current_user.organization_id)


@router.get(
    "/query/failed-strategies-by-regime",
    response_model=FailedStrategiesByRegimeResponse,
    summary="Strategies that failed in a given regime in the past N months, with failure causes",
)
async def failed_strategies_by_regime(
    regime: str = Query(..., max_length=32),
    months: int = Query(default=24, ge=1, le=600),
    current_user: User = Depends(get_current_user),
) -> FailedStrategiesByRegimeResponse:
    since = datetime.now(UTC) - timedelta(days=months * 30)
    repo = GraphSyncService().repository
    rows = await repo.failed_strategies_by_regime(_org(current_user), regime=regime, since=since)
    return FailedStrategiesByRegimeResponse(
        regime=regime, since=since, items=[FailedStrategyByRegimeItem(**r) for r in rows]
    )


@router.get(
    "/query/lineage/{strategy_id}",
    response_model=LineageResponse,
    summary="Full evolutionary lineage of a strategy (MUTATED_FROM/ADAPTED_FROM, both directions)",
)
async def lineage(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
) -> LineageResponse:
    repo = GraphSyncService().repository
    result = await repo.lineage(_org(current_user), strategy_id=str(strategy_id))
    if result["target"] is None:
        return LineageResponse(strategy_id=str(strategy_id), found=False)
    return LineageResponse(
        strategy_id=str(strategy_id),
        found=True,
        target=result["target"],
        ancestors=result["ancestors"],
        descendants=result["descendants"],
        edges=[LineageEdge(**e) for e in result["edges"]],
    )


@router.get(
    "/query/robust-across-regimes",
    response_model=RobustAcrossRegimesResponse,
    summary="Strategies valid across 4+ distinct regime types, ranked by robustness score",
)
async def robust_across_regimes(
    min_regimes: int = Query(default=4, ge=1, le=6),
    current_user: User = Depends(get_current_user),
) -> RobustAcrossRegimesResponse:
    repo = GraphSyncService().repository
    rows = await repo.robust_across_regimes(_org(current_user), min_regimes=min_regimes)
    return RobustAcrossRegimesResponse(
        min_regimes=min_regimes, items=[RobustAcrossRegimesItem(**r) for r in rows]
    )


@router.get(
    "/query/recurring-failure-modes",
    response_model=RecurringFailureModesResponse,
    summary="Failure modes (regime x trigger) that recur across 3+ occurrences",
)
async def recurring_failure_modes(
    min_occurrences: int = Query(default=3, ge=1),
    current_user: User = Depends(get_current_user),
) -> RecurringFailureModesResponse:
    repo = GraphSyncService().repository
    rows = await repo.recurring_failure_modes(_org(current_user), min_occurrences=min_occurrences)
    return RecurringFailureModesResponse(
        min_occurrences=min_occurrences, items=[RecurringFailureModeItem(**r) for r in rows]
    )


@router.get(
    "/query/hypotheses-leading-to-active",
    response_model=HypothesesLeadingToActiveResponse,
    summary="Research hypotheses that led to strategies currently Active",
)
async def hypotheses_leading_to_active(
    current_user: User = Depends(get_current_user),
) -> HypothesesLeadingToActiveResponse:
    repo = GraphSyncService().repository
    rows = await repo.hypotheses_leading_to_active(_org(current_user))
    return HypothesesLeadingToActiveResponse(
        items=[
            HypothesisLeadingToActiveItem(
                note_id=r["note_id"],
                hypothesis=r["hypothesis"],
                content=r["content"],
                active_strategies=[ActiveStrategyRef(**s) for s in r["active_strategies"]],
            )
            for r in rows
        ]
    )


@router.get(
    "/node/{node_type}/{node_id}",
    response_model=NodeDetailResponse,
    summary="Full node detail with all incoming/outgoing edges",
)
async def get_node(
    node_type: str,
    node_id: str,
    current_user: User = Depends(get_current_user),
) -> NodeDetailResponse:
    if node_type not in NODE_LABELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown node_type {node_type!r}; expected one of {sorted(NODE_LABELS)}",
        )
    repo = GraphSyncService().repository
    result = await repo.get_node(_org(current_user), node_type=node_type, node_id=node_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return NodeDetailResponse(**result)


@router.get(
    "/search",
    response_model=SearchResponse,
    summary="Search across node properties (name, content, hypothesis, ...)",
)
async def search_nodes(
    q: str = Query(..., min_length=1, max_length=255),
    node_type: str | None = Query(default=None, max_length=32),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    if node_type is not None and node_type not in NODE_LABELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown node_type {node_type!r}; expected one of {sorted(NODE_LABELS)}",
        )
    repo = GraphSyncService().repository
    rows = await repo.search_nodes(_org(current_user), q=q, node_type=node_type)
    return SearchResponse(
        q=q,
        node_type=node_type,
        items=[SearchResultItem(node_type=r.pop("node_type"), properties=r) for r in rows],
    )
