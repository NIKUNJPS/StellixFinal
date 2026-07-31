"""Pydantic schemas for Organization. Field names match the ORM/API exactly."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.organization import OrganizationStatus, OrganizationTier


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    tier: OrganizationTier
    max_strategies: int | None
    is_active: bool
    # Batch 24: lifecycle status (the frontend can surface pending/suspended states).
    status: OrganizationStatus
    created_at: datetime
    updated_at: datetime
    # Batch 12: the Beta-vs-benchmark comparison symbol (default "SPY").
    benchmark_symbol: str
    # Batch 22: weekly-digest opt-out.
    weekly_digest_enabled: bool = True


class OrganizationUpdateRequest(BaseModel):
    """Admin-only org settings. Every field is optional so a caller can update just
    one (e.g. toggle the weekly digest) without resending the others."""

    benchmark_symbol: str | None = Field(default=None, min_length=1, max_length=32)
    # Batch 22: weekly-digest opt-out toggle.
    weekly_digest_enabled: bool | None = None

    @field_validator("benchmark_symbol")
    @classmethod
    def _up(cls, v: str | None) -> str | None:
        return v.strip().upper() if v is not None else v
