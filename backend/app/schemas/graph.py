"""Pydantic schemas for the knowledge-graph endpoints (Batch 7)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class FailedStrategyByRegimeItem(BaseModel):
    strategy_id: str
    name: str | None
    status: str | None
    failure_id: str | None
    trigger_condition: str | None
    llm_explanation: str | None
    failure_timestamp: str


class FailedStrategiesByRegimeResponse(BaseModel):
    regime: str
    since: datetime
    items: list[FailedStrategyByRegimeItem]


class LineageEdge(BaseModel):
    from_id: str
    edge_type: str
    to_id: str


class LineageResponse(BaseModel):
    strategy_id: str
    found: bool
    target: dict[str, Any] | None = None
    ancestors: list[dict[str, Any]] = []
    descendants: list[dict[str, Any]] = []
    edges: list[LineageEdge] = []


class RobustAcrossRegimesItem(BaseModel):
    strategy_id: str
    name: str | None
    robustness_score: float | None
    regime_count: int


class RobustAcrossRegimesResponse(BaseModel):
    min_regimes: int
    items: list[RobustAcrossRegimesItem]


class RecurringFailureModeItem(BaseModel):
    regime_label: str | None
    trigger_condition: str | None
    occurrence_count: int
    strategy_count: int
    strategy_ids: list[str]


class RecurringFailureModesResponse(BaseModel):
    min_occurrences: int
    items: list[RecurringFailureModeItem]


class ActiveStrategyRef(BaseModel):
    strategy_id: str
    name: str | None


class HypothesisLeadingToActiveItem(BaseModel):
    note_id: str
    hypothesis: str | None
    content: str | None
    active_strategies: list[ActiveStrategyRef]


class HypothesesLeadingToActiveResponse(BaseModel):
    items: list[HypothesisLeadingToActiveItem]


class GraphEdgeRef(BaseModel):
    edge_type: str
    other_labels: list[str]
    other: dict[str, Any]
    edge_properties: dict[str, Any]


class NodeDetailResponse(BaseModel):
    node_type: str
    node: dict[str, Any]
    outgoing: list[GraphEdgeRef]
    incoming: list[GraphEdgeRef]


class SearchResultItem(BaseModel):
    node_type: str
    properties: dict[str, Any]


class SearchResponse(BaseModel):
    q: str
    node_type: str | None
    items: list[SearchResultItem]
