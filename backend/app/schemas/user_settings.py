"""Pydantic schemas for Page 22 (User Settings) — profile/security/preferences,
distinct from app/schemas/user.py's UserRead/MeResponse (Batch 1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.auth import _validate_password_strength

_PASSWORD_MAX_LENGTH = 128


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=_PASSWORD_MAX_LENGTH)
    new_password: str = Field(min_length=10, max_length=_PASSWORD_MAX_LENGTH)

    _check_new_password = field_validator("new_password")(_validate_password_strength)


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_info: str | None
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class SessionListResponse(BaseModel):
    total: int
    items: list[SessionRead]


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)


class PreferencesUpdateRequest(BaseModel):
    default_regime_filter: str | None = Field(default=None, max_length=32)
    default_date_range_days: int | None = Field(default=None, ge=1, le=3650)
    notifications: dict[str, bool] | None = None
