"""AgentAnalysis + AgentBacktestRun — the multi-agent desk (Batch 30, ADR 0009).

An AgentAnalysis is one TradingAgents run (analysts -> bull/bear debate -> trader ->
risk debate -> portfolio manager) for one ticker on one trade date, conditioned on the
Stellix regime that was knowable on that date. Content is write-once: once a row is
``completed`` its reports and rating never change; settlement later fills the
``settled_*`` fields exactly once (append-first, Pillar 3). Failed runs are kept with
their error (Pillar 2). See docs/schemas.md -> Multi-Agent Desk.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


class AgentRunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


_STATUS_ENUM = Enum(AgentRunStatus, name="agent_analysis_status", native_enum=True, values_callable=_values)


class AgentBacktestRun(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "agent_backtest_runs"

    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    tickers: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    trade_dates: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    selected_analysts: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    status: Mapped[AgentRunStatus] = mapped_column(_STATUS_ENUM, nullable=False, default=AgentRunStatus.QUEUED)
    total_cells: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_cells: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_cells: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Realised alpha grouped by regime x rating — see app/agents/scoring.py.
    summary: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentAnalysis(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "agent_analyses"
    __table_args__ = (Index("ix_agent_analyses_org_ticker_date", "organization_id", "ticker", "trade_date"),)

    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    backtest_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("agent_backtest_runs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    ticker: Mapped[str] = mapped_column(String(32), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    asset_type: Mapped[str] = mapped_column(String(16), nullable=False, default="stock")
    status: Mapped[AgentRunStatus] = mapped_column(_STATUS_ENUM, nullable=False, default=AgentRunStatus.QUEUED)
    selected_analysts: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    llm_provider: Mapped[str] = mapped_column(String(32), nullable=False)
    deep_model: Mapped[str] = mapped_column(String(64), nullable=False)
    quick_model: Mapped[str] = mapped_column(String(64), nullable=False)
    config_snapshot: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    # Batch 30b: the caller's book (TradingAgents PortfolioContext shape). NULL = no
    # portfolio given, which is NOT the same as {"positions": []} (a flat book).
    portfolio: Mapped[dict | None] = mapped_column(_JSONB, nullable=True)

    # Pillar 1: the regime knowable on trade_date, and exactly what was injected.
    regime_at_analysis: Mapped[str | None] = mapped_column(String(32), nullable=True)
    regime_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    regime_context: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)

    progress: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    reports: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    # Buy / Overweight / Hold / Underweight / Sell, or REVIEW (no parseable rating).
    rating: Mapped[str | None] = mapped_column(String(16), nullable=True)
    trader_action: Mapped[str | None] = mapped_column(String(8), nullable=True)
    time_horizon: Mapped[str | None] = mapped_column(String(128), nullable=True)
    position_sizing: Mapped[str | None] = mapped_column(String(128), nullable=True)

    research_note_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("research_notes.id", ondelete="SET NULL"), nullable=True
    )
    llm_call_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Settlement (Pillar 2): filled once, when the holding window has traded.
    benchmark: Mapped[str | None] = mapped_column(String(32), nullable=True)
    holding_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settled_raw_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    settled_alpha: Mapped[float | None] = mapped_column(Float, nullable=True)
    # When the outcome became knowable — the point-in-time cutoff for reusing the lesson.
    settled_resolution_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    settled_reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
