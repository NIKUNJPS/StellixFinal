"""performance_snapshots — regime-conditioned backtest metrics (Pillar 1).

Performance is never stored without a regime context. One row per regime present plus
one aggregate row (`regime_label = "ALL"`).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

# Sentinel regime_label for the global (all-regimes) aggregate row.
AGGREGATE_LABEL = "ALL"


class PerformanceSnapshot(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "performance_snapshots"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Taxonomy label or "ALL" for the aggregate — String (not the enum) to allow "ALL".
    regime_label: Mapped[str] = mapped_column(String(32), nullable=False)

    sharpe_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_drawdown: Mapped[float | None] = mapped_column(Float, nullable=True)
    win_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    profit_factor: Mapped[float | None] = mapped_column(Float, nullable=True)
    calmar_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    trade_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Batch 12: mean(returns)/downside_deviation and cov/var vs Organization.benchmark_symbol.
    sortino_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    beta_vs_benchmark: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Batch 12: per-bar portfolio metrics, aggregate-only (same basis as beta_vs_benchmark).
    annualized_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    volatility: Mapped[float | None] = mapped_column(Float, nullable=True)

    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
