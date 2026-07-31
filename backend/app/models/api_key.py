"""ApiKey model — hashed programmatic-access credential (Batch 12).

Raw key is never stored, only its SHA-256 hash (same pattern as
RefreshToken.token_hash). `key_prefix` is stored in the clear purely for
display ("which key is this?") — it is not secret and cannot be used to
authenticate on its own.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class ApiKey(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "api_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # e.g. ["strategies:read", "strategies:write", "data:read", "data:write"].
    scopes: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<ApiKey id={self.id} prefix={self.key_prefix} revoked={self.revoked_at is not None}>"
