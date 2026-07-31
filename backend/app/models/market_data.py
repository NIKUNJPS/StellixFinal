"""market_data — raw OHLCV bars (TimescaleDB hypertable, partitioned by timestamp).

Composite primary key ``(organization_id, symbol, timestamp)``. We deliberately do NOT
use a UUID surrogate key: a hypertable's unique indexes must include the partitioning
column (``timestamp``), which a surrogate PK would not, blocking ``create_hypertable``.
The PK doubles as the required composite index on (organization_id, symbol, timestamp).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.tenant import TenantScopedModel


class MarketData(Base, TenantScopedModel, TimestampMixin):
    __tablename__ = "market_data"
    __table_args__ = (
        PrimaryKeyConstraint("organization_id", "symbol", "timestamp", name="pk_market_data"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False)
    # Which provider produced this bar (market_data.source).
    source: Mapped[str] = mapped_column(String(32), nullable=False)
