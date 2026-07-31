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


class MeResponse(BaseModel):
    """GET /auth/me — current user plus their organization."""

    user: UserRead
    organization: OrganizationRead
