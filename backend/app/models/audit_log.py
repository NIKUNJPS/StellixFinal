"""AuditLog model — org-wide, immutable governance audit trail (Batch 10).

Distinct from Batch 9's LLMAuditLog (every LLM call specifically); this is every
governance-significant state change: approvals, rejections, kill-switch activation,
evolution candidate approval, compliance exports, role changes, login/failed login.

Batch 25: every row also snapshots WHO acted (email, display name, role at the time
of the action) and a human-readable description of WHAT happened, so a compliance
officer never has to cross-reference a raw UUID — and so a later role change or a
deleted user cannot rewrite who did what.

Append-only: UPDATE/DELETE revoked at the Postgres permission level (migration
0010), same pattern as `failures` and `llm_audit_log`.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


class AuditEventType(str, enum.Enum):
    STRATEGY_STATUS_CHANGE = "strategy_status_change"
    STRATEGY_APPROVED = "strategy_approved"
    STRATEGY_REJECTED = "strategy_rejected"
    KILL_SWITCH_ACTIVATED = "kill_switch_activated"
    EVOLUTION_CANDIDATE_APPROVED = "evolution_candidate_approved"
    DATA_EXPORT = "data_export"
    USER_ROLE_CHANGED = "user_role_changed"
    LOGIN = "login"
    FAILED_LOGIN = "failed_login"
    # Batch 25 — full research/governance coverage, not only auth + approvals.
    LOGOUT = "logout"
    STRATEGY_CREATED = "strategy_created"
    STRATEGY_VERSION_SAVED = "strategy_version_saved"
    STRATEGY_DELETED = "strategy_deleted"
    KILL_SWITCH_REVIEWED = "kill_switch_reviewed"
    LLM_EXPLANATION_GENERATED = "llm_explanation_generated"
    # Batch 26 — organization role administration (role assignment reuses the
    # long-reserved USER_ROLE_CHANGED).
    ROLE_CREATED = "role_created"
    ROLE_UPDATED = "role_updated"
    ROLE_DELETED = "role_deleted"
    ROLE_PERMISSIONS_CHANGED = "role_permissions_changed"
    # Batch 26 Part B: a strategy's Buy/Sell/Hold signal changed and was recorded.
    SIGNAL_GENERATED = "signal_generated"


class AuditLog(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "audit_log"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[AuditEventType] = mapped_column(
        Enum(AuditEventType, name="audit_event_type", native_enum=True, values_callable=_values),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    before_state: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)
    after_state: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Batch 25 — point-in-time actor + target snapshot (nullable: rows written before
    # migration 0019 never captured them, and system events have no human actor).
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
