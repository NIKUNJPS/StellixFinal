"""StrategyVersion — immutable per-version snapshot for diff/history."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class StrategyVersion(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "strategy_versions"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[str] = mapped_column(String(16), nullable=False)
    # Full tunable state (parameters + entry/exit rules + risk_constraints).
    parameters_snapshot: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    change_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
