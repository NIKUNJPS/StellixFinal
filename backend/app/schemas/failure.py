"""Pydantic schemas for the failure endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.failure import FailureTrigger


class FailureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    strategy_id: uuid.UUID
    strategy_version: str
    failure_timestamp: datetime
    regime_at_failure: str
    trigger_condition: FailureTrigger
    performance_metrics_at_failure: dict
    feature_attribution: list | None
    market_context_snapshot: dict
    llm_generated_explanation: str | None
    llm_numeric_validation_passed: bool | None
    related_failure_ids: list
    created_at: datetime


class FailureListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    strategy_id: uuid.UUID
    regime_at_failure: str
    trigger_condition: FailureTrigger
    failure_timestamp: datetime
    llm_generated_explanation: str | None
    llm_numeric_validation_passed: bool | None
    created_at: datetime


class FailureListResponse(BaseModel):
    total: int
    count: int
    items: list[FailureListItem]


class FailureCluster(BaseModel):
    regime_at_failure: str
    trigger_condition: FailureTrigger
    count: int
    failure_ids: list[uuid.UUID]


class FailureClustersResponse(BaseModel):
    clusters: list[FailureCluster]


class FailureHeatmapCell(BaseModel):
    strategy_id: uuid.UUID
    strategy_name: str
    regime_at_failure: str
    count: int


class FailureHeatmapResponse(BaseModel):
    cells: list[FailureHeatmapCell]


class ManualFailRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    reason: str = Field(min_length=1, max_length=2000)


class ManualFailEnqueued(BaseModel):
    strategy_id: uuid.UUID
    message: str
    task_id: str | None = None
