"""Request bodies for the superadmin control plane (Batch 24).

Responses are plain dicts (internal founder tooling, shapes evolve fast); the
inputs are typed so mutations can't be malformed. ``reason`` is required wherever
the audit trail needs a justification (suspend / terminate / impersonate).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.organization import OrganizationTier


class ApproveOrgRequest(BaseModel):
    plan: OrganizationTier | None = None
    max_strategies: int | None = Field(default=None, ge=0)


class SuspendOrgRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class TerminateOrgRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class UpdateOrgLimitsRequest(BaseModel):
    max_strategies: int | None = Field(default=None, ge=0)
    monthly_revenue_usd: float | None = Field(default=None, ge=0)


class InternalNoteRequest(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class ImpersonateRequest(BaseModel):
    target_user_id: str
    reason: str = Field(min_length=1, max_length=2000)


class SuspendUserRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ApproveDemoRequest(BaseModel):
    plan: OrganizationTier = OrganizationTier.STARTER
    # Temporary password the founder relays to the new admin (no email infra). If
    # omitted, the route generates a strong random one and returns it once.
    temp_password: str | None = Field(default=None, min_length=8, max_length=128)


class RejectDemoRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
