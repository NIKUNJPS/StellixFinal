"""Notification service (Batch 12) — real event-triggered, per-user.

``create_notification`` is the single write path every trigger goes through;
it respects the recipient's ``User.preferences["notifications"][type]``
toggle — an opted-out user genuinely gets no row, not a row the frontend
happens to hide. See docs/schemas.md -> Notification for the three trigger
points (failure detection, evolution completion, approval-eligibility).
"""

from __future__ import annotations

import uuid
from datetime import UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.user import User

DEFAULT_NOTIFICATION_PREFERENCES: dict[str, bool] = {
    NotificationType.FAILURE_DETECTED.value: True,
    NotificationType.EVOLUTION_COMPLETED.value: True,
    NotificationType.APPROVAL_REQUESTED.value: True,
    NotificationType.PAYMENT_FAILED.value: True,
}


def _wants_notification(user: User, notification_type: NotificationType) -> bool:
    prefs = (user.preferences or {}).get("notifications") or {}
    return bool(
        prefs.get(notification_type.value, DEFAULT_NOTIFICATION_PREFERENCES[notification_type.value])
    )


async def create_notification(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user: User,
    type: NotificationType,
    message: str,
    link: str | None = None,
    dedupe: bool = False,
) -> Notification | None:
    """Insert one notification for one user. Returns None (no row) if the user
    has opted out of this type, or — when ``dedupe=True`` — if they already
    have an unread notification of this exact (type, link)."""
    if not _wants_notification(user, type):
        return None
    if dedupe and link:
        existing = (
            await session.execute(
                select(Notification.id)
                .where(Notification.user_id == user.id)
                .where(Notification.type == type)
                .where(Notification.link == link)
                .where(Notification.read_at.is_(None))
                .limit(1)
            )
        ).first()
        if existing is not None:
            return None
    notification = Notification(
        organization_id=organization_id, user_id=user.id, type=type, message=message, link=link
    )
    session.add(notification)
    await session.flush()
    return notification


async def notify_users_with_roles(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    roles: set,
    type: NotificationType,
    message: str,
    link: str | None = None,
    dedupe: bool = False,
) -> list[Notification]:
    """Fan out one notification to every active org user with a role in `roles`."""
    users = (
        await session.execute(select(User).where(User.role.in_(roles)).where(User.is_active.is_(True)))
    ).scalars().all()
    created = []
    for u in users:
        n = await create_notification(
            session,
            organization_id=organization_id,
            user=u,
            type=type,
            message=message,
            link=link,
            dedupe=dedupe,
        )
        if n is not None:
            created.append(n)
    return created


async def notify_creator_and_roles(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    creator_user_id: uuid.UUID | None,
    roles: set,
    type: NotificationType,
    message: str,
    link: str | None = None,
    dedupe: bool = False,
) -> list[Notification]:
    """Fan out to ``creator_user_id`` (if set) UNION every active user with a
    role in ``roles``, deduplicated so a creator who also holds a governance
    role isn't notified twice for the same event."""
    recipients: dict[uuid.UUID, User] = {}
    if creator_user_id is not None:
        creator = (
            await session.execute(select(User).where(User.id == creator_user_id))
        ).scalar_one_or_none()
        if creator is not None:
            recipients[creator.id] = creator
    role_users = (
        await session.execute(select(User).where(User.role.in_(roles)).where(User.is_active.is_(True)))
    ).scalars().all()
    for u in role_users:
        recipients[u.id] = u

    created = []
    for u in recipients.values():
        n = await create_notification(
            session,
            organization_id=organization_id,
            user=u,
            type=type,
            message=message,
            link=link,
            dedupe=dedupe,
        )
        if n is not None:
            created.append(n)
    return created


async def list_notifications(
    session: AsyncSession, *, user_id: uuid.UUID, unread_only: bool, limit: int, offset: int
) -> tuple[int, list[Notification]]:
    conditions = [Notification.user_id == user_id]
    if unread_only:
        conditions.append(Notification.read_at.is_(None))
    from sqlalchemy import func

    total = await session.scalar(select(func.count()).select_from(Notification).where(*conditions))
    rows = (
        await session.execute(
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return total or 0, rows


async def mark_read(session: AsyncSession, *, notification: Notification) -> Notification:
    from datetime import datetime

    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(notification)
    return notification


async def mark_all_read(session: AsyncSession, *, user_id: uuid.UUID) -> int:
    from datetime import datetime

    from sqlalchemy import update

    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return result.rowcount or 0
