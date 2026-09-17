"""Notification endpoints (Batch 12): list (with unread count) and mark-read.

Every row is already scoped to the caller (Notification.user_id == the
authenticated user) — there is no "list another user's notifications" path.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db, require_permission
from app.core.config import settings
from app.models.notification import Notification
from app.models.organization import Organization
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.notification import MarkAllReadResponse, NotificationListResponse, NotificationRead
from app.services import notification as svc
from app.services.webhook import post_webhook
from app.services.weekly_digest import build_digest_content, gather_weekly_stats

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post(
    "/digest/preview",
    summary="Build + deliver this org's weekly digest now (admin only)",
)
async def preview_weekly_digest(
    current_user: User = Depends(require_permission(P.DIGEST_SEND)),
    db: AsyncSession = Depends(get_tenant_db),
) -> dict:
    """Batch 22: gather the caller's org's weekly stats, render the digest, deliver it
    best-effort over the same webhook/log channel the beat sweep uses, and return the
    content so the UI can render it (there is no email inbox to check). Numbers come
    only from real DB queries (app/services/weekly_digest.py)."""
    org = await db.get(Organization, current_user.organization_id)
    stats = await gather_weekly_stats(db, current_user.organization_id)
    content = build_digest_content(org.name, stats)
    await post_webhook(settings.DEMO_WEBHOOK_URL, content)
    return content


@router.get("", response_model=NotificationListResponse)
async def list_my_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> NotificationListResponse:
    total, rows = await svc.list_notifications(
        db, user_id=current_user.id, unread_only=unread_only, limit=limit, offset=offset
    )
    unread_count = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.read_at.is_(None))
    )
    return NotificationListResponse(
        total=total,
        unread_count=unread_count or 0,
        count=len(rows),
        items=[NotificationRead.model_validate(r) for r in rows],
    )


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> Notification:
    notification = (
        await db.execute(
            select(Notification)
            .where(Notification.id == notification_id)
            .where(Notification.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return await svc.mark_read(db, notification=notification)


@router.post("/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> MarkAllReadResponse:
    count = await svc.mark_all_read(db, user_id=current_user.id)
    return MarkAllReadResponse(marked_count=count)
