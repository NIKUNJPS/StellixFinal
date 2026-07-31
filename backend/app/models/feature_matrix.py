"""feature_matrix — engineered features per bar (TimescaleDB hypertable).

Commonly-queried indicators are real (nullable Float) columns for fast filtering;
the flexible ``features`` JSONB column holds the full/extensible indicator set so new
indicators can be added without a migration. Same composite-PK design as market_data.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, PrimaryKeyConstraint, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.tenant import TenantScopedModel

# JSONB on Postgres, JSON on SQLite (tests) — same Python dict interface.
_JSONB = JSON().with_variant(JSONB(), "postgresql")


class FeatureMatrix(Base, TenantScopedModel, TimestampMixin):
    __tablename__ = "feature_matrix"
    __table_args__ = (
        PrimaryKeyConstraint("organization_id", "symbol", "timestamp", name="pk_feature_matrix"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Flexible, extensible indicator bag.
    features: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)

    # Fast-filter indicator columns (nullable — warm-up rows are NULL, never back-filled).
    log_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    sma_20: Mapped[float | None] = mapped_column(Float, nullable=True)
    sma_50: Mapped[float | None] = mapped_column(Float, nullable=True)
    ema_12: Mapped[float | None] = mapped_column(Float, nullable=True)
    ema_26: Mapped[float | None] = mapped_column(Float, nullable=True)
    rsi_14: Mapped[float | None] = mapped_column(Float, nullable=True)
    macd: Mapped[float | None] = mapped_column(Float, nullable=True)
    macd_signal: Mapped[float | None] = mapped_column(Float, nullable=True)
    atr_14: Mapped[float | None] = mapped_column(Float, nullable=True)
    bollinger_upper: Mapped[float | None] = mapped_column(Float, nullable=True)
    bollinger_lower: Mapped[float | None] = mapped_column(Float, nullable=True)
    realized_vol_20: Mapped[float | None] = mapped_column(Float, nullable=True)
    autocorr_5: Mapped[float | None] = mapped_column(Float, nullable=True)
