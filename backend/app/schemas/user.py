"""Pydantic schemas for User. Never exposes ``hashed_password``."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole
from app.schemas.organization import OrganizationRead


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    full_name: str | None
    role: UserRole
    is_active: bool
    # Batch 24: the ONLY thing that unlocks /superadmin/* on the frontend.
    is_super_admin: bool = False
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Batch 12
    mfa_enabled: bool
    avatar_url: str | None
    preferences: dict


class EffectiveRole(BaseModel):
    """Batch 26: the role that actually grants a user's permissions."""

    id: uuid.UUID
    name: str
    is_system_default: bool
    # The original role key ("researcher", ...) for system roles; None for custom roles.
    system_key: str | None


class OrganizationMemberRead(BaseModel):
    """Batch 25: one row of the read-only organization member directory."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str | None
    role: UserRole
    is_active: bool
    email_verified: bool
    mfa_enabled: bool
    last_login_at: datetime | None
    created_at: datetime
    # Batch 26: effective role (may be an org custom role).
    effective_role: EffectiveRole | None = None


class OrganizationMemberListResponse(BaseModel):
    total: int
    items: list[OrganizationMemberRead]


class MeResponse(BaseModel):
    """GET /auth/me — current user plus their organization."""

    user: UserRead
    organization: OrganizationRead
    # Batch 26: resolved server-side from the database on every call — the frontend
    # uses these instead of hardcoding role names.
    effective_role: EffectiveRole | None = None
    permissions: list[str] = []
