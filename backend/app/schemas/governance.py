"""Pydantic schemas for the governance & compliance endpoints (Batch 10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.audit_log import AuditEventType
from app.models.compliance_export import ComplianceExportStatus
from app.models.strategy import StrategyCreator, StrategyStatus


class KillSwitchRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ActorSummary(BaseModel):
    """Who acted, resolved to a readable identity — never a bare UUID."""

    user_id: uuid.UUID | None
    email: str | None
    full_name: str | None
    role: str | None


class KillSwitchReviewRead(BaseModel):
    id: uuid.UUID
    strategy_id: uuid.UUID
    strategy_name: str
    strategy_status: StrategyStatus
    reason: str
    status_before_kill: str
    triggered_by: ActorSummary
    triggered_at: datetime
    review_deadline: datetime
    # pending | overdue | reviewed | self_reviewed
    review_state: Literal["pending", "overdue", "reviewed", "self_reviewed"]
    is_self_reviewed: bool
    reviewed_by: ActorSummary | None
    reviewed_at: datetime | None
    review_note: str | None


class KillSwitchReviewListResponse(BaseModel):
    total: int
    awaiting_review_count: int
    overdue_count: int
    items: list[KillSwitchReviewRead]


class KillSwitchReviewAcknowledgeRequest(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class StrategyControlItem(BaseModel):
    """A strategy a risk_manager/cio can act on from the governance control room."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    version: str
    status: StrategyStatus
    creator: StrategyCreator
    robustness_score: float | None
    updated_at: datetime


class StrategyControlListResponse(BaseModel):
    total: int
    items: list[StrategyControlItem]


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
    # Batch 25 — readable actor/target. ``actor_identity_source`` says where the
    # identity came from: "recorded" (snapshotted at the moment of the action),
    # "current_profile" (a pre-Batch-25 row, resolved from the user's profile as it is
    # today), or "system" (no human actor).
    actor_email: str | None = None
    actor_name: str | None = None
    actor_role: str | None = None
    actor_identity_source: Literal["recorded", "current_profile", "system"] = "system"
    entity_name: str | None = None
    description: str | None = None


class GovernanceAuditLogListResponse(BaseModel):
    total: int
    count: int
    # organization: every event (admin/compliance_officer); risk_actions: risk and
    # approval events org-wide (cio); own_risk_actions: the caller's own risk and
    # approval actions (risk_manager).
    scope: Literal["organization", "risk_actions", "own_risk_actions"] = "organization"
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
    # Batch 25 — honest processing state. ``worker_online`` is None when it could not
    # be determined (Redis unreachable); ``status_message`` is what the UI shows.
    worker_online: bool | None = None
    status_message: str = ""


class ComplianceExportJobListResponse(BaseModel):
    items: list[ComplianceExportJobRead]
