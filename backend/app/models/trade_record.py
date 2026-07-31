"""TradeRecord model — persisted per-trade detail from a backtest (Batch 12).

Extends Batch 4's backtest output: run_regime_aware_backtest() always computed
this (BacktestResult.trades), but only the aggregate PerformanceSnapshot rows
were ever persisted. Replaced wholesale on every re-run of the same strategy's
backtest, same semantics as PerformanceSnapshot.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel


class TradeRecord(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "trade_records"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # vectorbt's own label ("Long" / "Short"), not re-enumerated.
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False)
    return_pct: Mapped[float] = mapped_column(Float, nullable=False)
    regime_at_entry: Mapped[str | None] = mapped_column(String(32), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<TradeRecord id={self.id} strategy_id={self.strategy_id} pnl={self.pnl}>"
