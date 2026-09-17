"""Team-invitation schemas (Batch 25)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.invitation import InvitationStatus
from app.models.user import UserRole
from app.schemas.auth import _PASSWORD_MAX_LENGTH, _validate_password_strength


class InvitationCreate(BaseModel):
    email: EmailStr
    # Defaults to the least-privileged role — an admin must opt in to anything more.
    role: UserRole = UserRole.RESEARCHER
    # Batch 26: a system role or one of this organization's custom roles. When set it
    # takes precedence over ``role``.
    role_id: uuid.UUID | None = None


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: UserRole
    role_id: uuid.UUID | None = None
    status: InvitationStatus
    invited_by: uuid.UUID | None
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime
    # Non-production + SMTP unconfigured only, same rule as dev_reset_link. Lets an
    # admin walk the flow locally without a mail server.
    dev_invite_link: str | None = None


class InvitationListResponse(BaseModel):
    items: list[InvitationRead]


class AcceptInvitationRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)
    password: str = Field(max_length=_PASSWORD_MAX_LENGTH)
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class AcceptInvitationResponse(BaseModel):
    message: str = "Welcome aboard. You can now sign in."
    email: str
    organization_slug: str
