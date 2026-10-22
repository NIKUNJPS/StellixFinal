"""Batch 31 (ADR 0010): Market Terminal — workspace, watchlists, holdings, price alerts.

Revision ID: 0027_market_terminal
Revises: 0026_agent_portfolio
Create Date: 2026-09-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0027_market_terminal"
down_revision: str | None = "0026_agent_portfolio"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_SIDE = postgresql.ENUM("buy", "sell", name="holding_side", create_type=False)
_COND = postgresql.ENUM("above", "below", name="price_alert_condition", create_type=False)
_STATUS = postgresql.ENUM("active", "triggered", "cancelled", name="price_alert_status", create_type=False)


def _base(owner: bool = True) -> list[sa.Column]:
    cols = [
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
    ]
    if owner:
        cols.append(sa.Column("owner_user_id", _UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False))
    return cols


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'price_alert'")
    bind = op.get_bind()
    for enum in (_SIDE, _COND, _STATUS):
        enum.create(bind, checkfirst=True)

    op.create_table(
        "terminal_workspaces",
        *_base(),
        sa.Column("widgets", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("layout", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("active_symbol", sa.String(32), server_default="SPY", nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "owner_user_id", name="uq_terminal_workspace_owner"),
    )
    op.create_table(
        "terminal_watchlists",
        *_base(),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("symbols", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        *_ts(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "holding_portfolios",
        *_base(),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("base_currency", sa.String(8), server_default="USD", nullable=False),
        sa.Column("cash", sa.Float(), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "holding_transactions",
        *_base(owner=False),
        sa.Column("portfolio_id", _UUID, sa.ForeignKey("holding_portfolios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("side", _SIDE, nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("fee", sa.Float(), server_default="0", nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("quantity > 0", name="ck_holding_tx_quantity_positive"),
        sa.CheckConstraint("price > 0", name="ck_holding_tx_price_positive"),
        sa.CheckConstraint("fee >= 0", name="ck_holding_tx_fee_nonnegative"),
    )
    op.create_table(
        "price_alerts",
        *_base(),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("condition", _COND, nullable=False),
        sa.Column("target_price", sa.Float(), nullable=False),
        sa.Column("status", _STATUS, server_default="active", nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("triggered_price", sa.Float(), nullable=True),
        sa.Column("note", sa.String(255), nullable=True),
        *_ts(),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("target_price > 0", name="ck_price_alert_target_positive"),
    )
    for table in ("terminal_workspaces", "terminal_watchlists", "holding_portfolios", "price_alerts"):
        op.create_index(f"ix_{table}_organization_id", table, ["organization_id"])
        op.create_index(f"ix_{table}_owner_user_id", table, ["owner_user_id"])
    op.create_index("ix_holding_transactions_organization_id", "holding_transactions", ["organization_id"])
    op.create_index("ix_holding_transactions_portfolio_id", "holding_transactions", ["portfolio_id"])
    op.create_index("ix_price_alerts_symbol", "price_alerts", ["symbol"])
    op.create_index("ix_price_alerts_active", "price_alerts", ["status"], postgresql_where=sa.text("status = 'active'"))


def downgrade() -> None:
    op.drop_table("price_alerts")
    op.drop_table("holding_transactions")
    op.drop_table("holding_portfolios")
    op.drop_table("terminal_watchlists")
    op.drop_table("terminal_workspaces")
    for name in ("price_alert_status", "price_alert_condition", "holding_side"):
        op.execute(f"DROP TYPE IF EXISTS {name}")
    # Postgres cannot drop the added notification_type label; it is left in place.
