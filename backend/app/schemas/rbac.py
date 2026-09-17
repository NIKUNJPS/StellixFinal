"""Pydantic schemas for dynamic RBAC (Batch 26)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    category: str
    description: str


class PermissionCatalogResponse(BaseModel):
    items: list[PermissionRead]


class PermissionCreateRequest(BaseModel):
    key: str = Field(min_length=3, max_length=100, pattern=r"^[a-z0-9_]+(\.[a-z0-9_]+)+$")
    category: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=500)


class RoleRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    name: str
    description: str
    is_system_default: bool
    system_key: str | None
    scope: str  # "system" | "organization"
    permissions: list[str]
    member_count: int
    created_at: datetime


class RoleListResponse(BaseModel):
    items: list[RoleRead]


class SystemRoleListResponse(BaseModel):
    items: list[RoleRead]
    # {organization_id: {"organization_name": str, "custom_role_count": int}}
    custom_roles_by_organization: list[dict]


class RoleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    permissions: list[str] = Field(default_factory=list, max_length=200)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permissions: list[str] | None = Field(default=None, max_length=200)


class RolePermissionsUpdateRequest(BaseModel):
    permissions: list[str] = Field(max_length=200)


class RoleAssignmentRequest(BaseModel):
    role_id: uuid.UUID


class EffectiveRoleRead(BaseModel):
    id: uuid.UUID
    name: str
    is_system_default: bool
    system_key: str | None
