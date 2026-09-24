"""Batch 26 Part B: strategy_signals table + signal_generated audit event.

``strategy_signals`` records the Buy/Sell/Hold research signal for an Active strategy,
append-on-change (a new row only when the signal type changes; ``last_evaluated_at`` is
bumped on the current row on every re-evaluation). ``signal_generated`` joins the audit
trail the same way 0019/0021 added labels — the comprehensive audit trail (Batch 25)
needs no schema change to log it, only the new enum value.

Revision ID: 0024_strategy_signals
Revises: 0023_quant_engineer_signals_view
Create Date: 2026-09-22
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024_strategy_signals"
down_revision: str | None = "0023_quant_engineer_signals_view"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # New audit label — added outside the migration transaction (see 0019).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'signal_generated'")

    op.create_table(
        "strategy_signals",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("signal_type", sa.Enum("BUY", "SELL", "HOLD", name="signal_type"), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("regime_at_signal", sa.String(length=64), nullable=True),
        sa.Column("rule_snapshot", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("robustness_score_at_signal", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_strategy_signals_organization_id", "strategy_signals", ["organization_id"])
    op.create_index("ix_strategy_signals_strategy_id", "strategy_signals", ["strategy_id"])
    # The current signal for a strategy = its most recent row; this index serves that lookup.
    op.create_index(
        "ix_strategy_signals_strategy_evaluated", "strategy_signals", ["strategy_id", "evaluated_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_strategy_signals_strategy_evaluated", table_name="strategy_signals")
    op.drop_index("ix_strategy_signals_strategy_id", table_name="strategy_signals")
    op.drop_index("ix_strategy_signals_organization_id", table_name="strategy_signals")
    op.drop_table("strategy_signals")
    op.execute("DROP TYPE IF EXISTS signal_type")
    # Postgres cannot drop the added audit_event_type label; it is left in place.
