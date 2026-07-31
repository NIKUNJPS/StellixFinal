"""EmailVerificationToken model (Batch 25).

Proves the person who registered actually controls the mailbox they typed. Mirrors
PasswordResetToken exactly: the raw token is never stored — only its SHA-256 hash —
and ``used_at`` is set (never deleted) once redeemed, keeping a permanent record that
verification happened.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel


class EmailVerificationToken(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "email_verification_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return (
            f"<EmailVerificationToken id={self.id} user_id={self.user_id} "
            f"used={self.used_at is not None}>"
        )
