"""Notification model — per-user, event-triggered (Batch 12).

Real events only (failure detection, evolution completion, a strategy becoming
approval-eligible) — see app/services/notification.py for the creation helper
and docs/schemas.md -> Notification for the trigger points.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel


class NotificationType(str, enum.Enum):
    FAILURE_DETECTED = "failure_detected"
    EVOLUTION_COMPLETED = "evolution_completed"
    APPROVAL_REQUESTED = "approval_requested"
    PAYMENT_FAILED = "payment_failed"
    # Batch 31 (ADR 0010): a Market Terminal price alert fired.
    PRICE_ALERT = "price_alert"


class Notification(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(
            NotificationType,
            name="notification_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Notification id={self.id} type={self.type.value} user_id={self.user_id} read={self.read_at is not None}>"
