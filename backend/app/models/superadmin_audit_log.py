"""SuperAdminAuditLog — append-only record of every founder/control-plane action.

Deliberately SEPARATE from the tenant-facing ``audit_log`` (Batch 10): that one is
org-scoped governance evidence; this one records CROSS-tenant actions taken by an
internal Stellix operator (approve/suspend an org, impersonate a user, read another
tenant's data). SOC 2 requires that cross-org access by a privileged operator be
independently logged — this is that log.

Not a ``TenantScopedModel``: superadmin actions span all tenants and the operator's
own home org is irrelevant to the record. Immutable: ``created_at`` only, and
UPDATE/DELETE revoked at the Postgres role level (migration 0016), same pattern as
audit_log / llm_audit_log / failures.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin

# JSONB on Postgres, plain JSON on SQLite (the hermetic test DB) — the pattern used
# by every other JSON column in this codebase (see user.py / demo_request.py).
_JSONB = JSON().with_variant(JSONB(), "postgresql")


class SuperAdminAuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "superadmin_audit_log"

    super_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    before_value: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)
    after_value: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
