"""Strategy model — the core research artifact (Batch 4).

Referenced by Validation, Failure Intelligence, Evolution, and Research Memory in
later batches, so the schema is stable from here. See docs/schemas.md → Strategy.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import JSON, Boolean, Enum, Float, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


class StrategyCreator(str, enum.Enum):
    HUMAN = "human"
    LLM_GENERATED = "llm_generated"
    GA_ENGINE = "ga_engine"


class StrategyStatus(str, enum.Enum):
    DRAFT = "draft"
    CANDIDATE = "candidate"
    ACTIVE = "active"
    FAILED = "failed"
    RETIRED = "retired"


class Strategy(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "strategies"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(16), nullable=False, default="v1.0")
    # Batch 26 Part B: the instrument this strategy trades. Required at creation going
    # forward (enforced in the API/frontend, not the DB), so signal generation knows
    # which symbol's bars to evaluate. Nullable in the DB because strategies created
    # before this column existed have no recoverable symbol — those rows stay NULL.
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)

    creator: Mapped[StrategyCreator] = mapped_column(
        Enum(StrategyCreator, name="strategy_creator", native_enum=True, values_callable=_values),
        nullable=False,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[StrategyStatus] = mapped_column(
        Enum(StrategyStatus, name="strategy_status", native_enum=True, values_callable=_values),
        nullable=False,
        default=StrategyStatus.DRAFT,
    )

    parameters: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    entry_rules: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    exit_rules: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    risk_constraints: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)

    # The 5-method validation composite, and the ONLY score the activation gate reads.
    # Written solely by run_strategy_validation; see ADR 0008.
    robustness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # A single backtest's own 60/40 robustness (Batch 4). Display only — it is NOT
    # evidence of validation and must never gate activation (ADR 0008).
    backtest_robustness: Mapped[float | None] = mapped_column(Float, nullable=True)
    regime_compatibility: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)

    parent_strategy_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True
    )
    # Batch 7: backs the Research Memory INSPIRED_BY relationship (Strategy -> ResearchNote).
    inspired_by_note_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("research_notes.id", ondelete="SET NULL"), nullable=True
    )
    # Batch 9 (LLM Safeguard 3): derived server-side from creator==llm_generated,
    # never client-settable. See docs/schemas.md -> LLM Research Assistant.
    requires_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
