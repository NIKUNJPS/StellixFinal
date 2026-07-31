"""Pydantic schemas for the API key endpoints (Batch 12)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

_ALLOWED_SCOPES = {"strategies:read", "strategies:write", "data:read", "data:write"}
_MAX_SCOPES = 10


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: list[str] = Field(default_factory=list, max_length=_MAX_SCOPES)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)

    @field_validator("scopes")
    @classmethod
    def _check_scopes(cls, v: list[str]) -> list[str]:
        unknown = set(v) - _ALLOWED_SCOPES
        if unknown:
            raise ValueError(f"Unknown scope(s) {sorted(unknown)}; expected one of {sorted(_ALLOWED_SCOPES)}")
        return v


class ApiKeyCreatedResponse(BaseModel):
    """Returned ONLY at creation time — the raw key is never retrievable again."""

    id: uuid.UUID
    name: str
    scopes: list[str]
    key_prefix: str
    raw_key: str
    expires_at: datetime | None


class ApiKeyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    scopes: list[str]
    key_prefix: str
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class ApiKeyListResponse(BaseModel):
    total: int
    items: list[ApiKeyRead]
