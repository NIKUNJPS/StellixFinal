"""StrategySignal — a Buy/Sell/Hold research signal for an Active strategy (Batch 26 B).

A signal is a *deterministic* rule-evaluation output: replay the strategy's position
state over its symbol's bars, then read the entry/exit EVENT on the latest bar. It is
about the STRATEGY and its SYMBOL — never about any viewing user's holdings, and never
a prediction. Rows are append-on-change: a new row is written only when ``signal_type``
differs from the strategy's last recorded signal; every re-evaluation bumps
``last_evaluated_at`` on the current (latest) row regardless. See docs/schemas.md.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


class SignalType(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class StrategySignal(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "strategy_signals"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    signal_type: Mapped[SignalType] = mapped_column(
        Enum(SignalType, name="signal_type", native_enum=True, values_callable=_values), nullable=False
    )
    # When this signal first became the strategy's current signal (the change point).
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Bumped on every re-evaluation that leaves the signal unchanged; == evaluated_at
    # at insert time. The strategy's latest row is its live signal.
    last_evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # The real current regime for the symbol at signal time (join to regime_labels), or NULL.
    regime_at_signal: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # The exact rule logic that fired (entry rule for BUY, exit rule for SELL) or a
    # {"event": "none", "note": "no change", ...} snapshot for HOLD.
    rule_snapshot: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    # The ADR-0008-corrected robustness_score at signal time — NEVER backtest_robustness.
    robustness_score_at_signal: Mapped[float | None] = mapped_column(Float, nullable=True)
