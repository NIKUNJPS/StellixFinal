"""LLMAuditLog model — append-only log of every LLM call (Batch 9, Safeguard 4).

Immutable: ``created_at`` only (no ``updated_at``); UPDATE/DELETE additionally
revoked at the Postgres permission level (migration 0009), same pattern as
Batch 6's ``failures`` table.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel


class LLMAuditLog(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "llm_audit_log"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    function_name: Mapped[str] = mapped_column(String(64), nullable=False)
    full_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    full_response: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str] = mapped_column(String(64), nullable=False)
    # Batch 18: which provider lane served this call ("gemini" | "claude"), kept
    # separate from the concrete model id in model_used so cost-by-lane reporting
    # never has to parse model id strings. Nullable — Batch 9-era rows predate the
    # router (see migration 0015 for why they aren't backfilled).
    model_key: Mapped[str | None] = mapped_column(String(16), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Cost of THIS call, from the provider's real reported usage at the price in
    # effect when it ran. Never recomputed at read time — prices change.
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    numeric_validation_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
