"""API key management endpoints (Batch 12) — Settings > API Keys.

Managing keys always requires a real JWT session (you can't mint or revoke a
key using a key) — only *using* one against /strategies or /data goes through
the API-key auth path in app/api/deps.py.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import (
    ApiKeyCreatedResponse,
    ApiKeyCreateRequest,
    ApiKeyListResponse,
    ApiKeyRead,
)
from app.services import api_key as svc

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


@router.post("", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ApiKeyCreatedResponse:
    record, raw_key = await svc.create_api_key(
        db,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        name=payload.name,
        scopes=payload.scopes,
        expires_in_days=payload.expires_in_days,
    )
    return ApiKeyCreatedResponse(
        id=record.id,
        name=record.name,
        scopes=record.scopes,
        key_prefix=record.key_prefix,
        raw_key=raw_key,
        expires_at=record.expires_at,
    )


@router.get("", response_model=ApiKeyListResponse)
async def list_my_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ApiKeyListResponse:
    total, rows = await svc.list_api_keys(db, user_id=current_user.id)
    return ApiKeyListResponse(total=total, items=[ApiKeyRead.model_validate(r) for r in rows])


@router.post("/{api_key_id}/revoke", response_model=ApiKeyRead)
async def revoke_api_key(
    api_key_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ApiKey:
    record = (
        await db.execute(
            select(ApiKey).where(ApiKey.id == api_key_id).where(ApiKey.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    return await svc.revoke_api_key(db, api_key=record)
