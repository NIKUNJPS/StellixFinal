"""Failure model — first-class, append-only failed-strategy records (Pillar 2).

Immutable: ``created_at`` only (NO ``updated_at``, so NO ``TimestampMixin``); UPDATE and
DELETE are additionally revoked at the Postgres permission level (migration 0006).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class FailureTrigger(str, enum.Enum):
    DRAWDOWN_BREACH = "drawdown_breach"
    SHARPE_DECLINE = "sharpe_decline"
    REGIME_MISMATCH = "regime_mismatch"
    MANUAL = "manual"


class Failure(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "failures"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    strategy_version: Mapped[str] = mapped_column(String(16), nullable=False)
    failure_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    regime_at_failure: Mapped[str] = mapped_column(String(32), nullable=False)

    trigger_condition: Mapped[FailureTrigger] = mapped_column(
        Enum(
            FailureTrigger,
            name="failure_trigger",
            native_enum=True,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
    )

    performance_metrics_at_failure: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    # Top-5 SHAP features, or NULL when the strategy has < 10 trades.
    feature_attribution: Mapped[list | None] = mapped_column(_JSONB, nullable=True)
    market_context_snapshot: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    llm_generated_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Batch 9 Safeguard 5: whether explain_failure's numeric_claims matched this same
    # row's real data. NULL until the explanation is generated.
    llm_numeric_validation_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Array of related-failure UUID strings (populated bidirectionally by clustering).
    related_failure_ids: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)

    # Immutable — no updated_at.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
