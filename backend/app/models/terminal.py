"""Market Terminal user data (Batch 31, ADR 0010): workspace, watchlists, holdings, alerts.

Every model is tenant-scoped (``TenantScopedModel``) AND owned by one user: the
service layer filters on ``owner_user_id`` for every read and write, so another member
of the same organization can never see or change your book. See docs/schemas.md ->
Market Terminal.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


def _owner() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)


class TerminalWorkspace(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "terminal_workspaces"
    __table_args__ = (UniqueConstraint("organization_id", "owner_user_id", name="uq_terminal_workspace_owner"),)

    owner_user_id: Mapped[uuid.UUID] = _owner()
    widgets: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    layout: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    active_symbol: Mapped[str] = mapped_column(String(32), nullable=False, default="SPY")


class TerminalWatchlist(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "terminal_watchlists"

    owner_user_id: Mapped[uuid.UUID] = _owner()
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    symbols: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)


class HoldingPortfolio(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "holding_portfolios"

    owner_user_id: Mapped[uuid.UUID] = _owner()
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    cash: Mapped[float | None] = mapped_column(Float, nullable=True)


class HoldingSide(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"


class HoldingTransaction(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "holding_transactions"

    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("holding_portfolios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    side: Mapped[HoldingSide] = mapped_column(
        Enum(HoldingSide, name="holding_side", native_enum=True, values_callable=_values), nullable=False
    )
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    fee: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PriceAlertCondition(str, enum.Enum):
    ABOVE = "above"
    BELOW = "below"


class PriceAlertStatus(str, enum.Enum):
    ACTIVE = "active"
    TRIGGERED = "triggered"
    CANCELLED = "cancelled"


class PriceAlert(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "price_alerts"

    owner_user_id: Mapped[uuid.UUID] = _owner()
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    condition: Mapped[PriceAlertCondition] = mapped_column(
        Enum(PriceAlertCondition, name="price_alert_condition", native_enum=True, values_callable=_values),
        nullable=False,
    )
    target_price: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[PriceAlertStatus] = mapped_column(
        Enum(PriceAlertStatus, name="price_alert_status", native_enum=True, values_callable=_values),
        nullable=False,
        default=PriceAlertStatus.ACTIVE,
    )
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
