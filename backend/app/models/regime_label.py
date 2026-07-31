"""regime_labels — ensemble regime output per bar (TimescaleDB hypertable).

Matches SRC report §5.1: regime_label, confidence_score, model_votes (the four
sub-model labels), transition_probs (the HMM matrix). Same composite-PK hypertable
design as market_data / feature_matrix.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Float, PrimaryKeyConstraint, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.tenant import TenantScopedModel
from app.regime.taxonomy import RegimeLabel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class RegimeLabelRecord(Base, TenantScopedModel, TimestampMixin):
    __tablename__ = "regime_labels"
    __table_args__ = (
        PrimaryKeyConstraint("organization_id", "symbol", "timestamp", name="pk_regime_labels"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    regime_label: Mapped[RegimeLabel] = mapped_column(
        Enum(
            RegimeLabel,
            name="regime_label",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    # {"hmm": "...", "pelt": "...", "gmm": "...", "garch": "..."}
    model_votes: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    # HMM transition matrix (+ state→label map) as JSONB.
    transition_probs: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)
