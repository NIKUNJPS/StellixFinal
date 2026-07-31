"""Pydantic schemas for the governance & compliance endpoints (Batch 10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.audit_log import AuditEventType
from app.models.compliance_export import ComplianceExportStatus
from app.models.strategy import StrategyCreator


class KillSwitchRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ActiveStrategySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    version: str
    creator: StrategyCreator
    robustness_score: float | None
    regime_compatibility: dict | None
    created_at: datetime
    updated_at: datetime


class ActiveStrategiesResponse(BaseModel):
    total: int
    items: list[ActiveStrategySummary]


class ApprovalQueueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    creator: StrategyCreator
    robustness_score: float | None
    regime_compatibility: dict | None
    created_at: datetime


class ApprovalQueueResponse(BaseModel):
    total: int
    items: list[ApprovalQueueItem]


class AuditLogEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    event_type: AuditEventType
    entity_type: str
    entity_id: uuid.UUID
    before_state: dict | None
    after_state: dict | None
    justification: str | None
    ip_address: str | None
    created_at: datetime


class GovernanceAuditLogListResponse(BaseModel):
    total: int
    count: int
    items: list[AuditLogEntryRead]


class ComplianceExportRequest(BaseModel):
    start_date: date
    end_date: date
    export_format: Literal["json", "pdf"] = "json"

    @model_validator(mode="after")
    def _validate_range(self) -> ComplianceExportRequest:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class ComplianceExportEnqueued(BaseModel):
    job_id: uuid.UUID
    message: str
    task_id: str | None = None


class ComplianceExportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ComplianceExportStatus
    export_format: str
    start_date: date
    end_date: date
    error: str | None
    created_at: datetime
    updated_at: datetime
