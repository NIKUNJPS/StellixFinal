"""Batch 4: strategies, strategy_versions, approval_records, performance_snapshots.

Revision ID: 0004_strategy_lifecycle
Revises: 0003_regime_labels
Create Date: 2026-07-01
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_strategy_lifecycle"
down_revision: str | None = "0003_regime_labels"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

strategy_creator = postgresql.ENUM(
    "human", "llm_generated", "ga_engine", name="strategy_creator", create_type=False
)
strategy_status = postgresql.ENUM(
    "draft", "candidate", "active", "failed", "retired", name="strategy_status", create_type=False
)
approval_action = postgresql.ENUM("approve", "reject", name="approval_action", create_type=False)

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB()


def _ts_cols() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    strategy_creator.create(op.get_bind(), checkfirst=True)
    strategy_status.create(op.get_bind(), checkfirst=True)
    approval_action.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "strategies",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("version", sa.String(length=16), server_default="v1.0", nullable=False),
        sa.Column("creator", strategy_creator, nullable=False),
        sa.Column("created_by_user_id", _UUID, nullable=True),
        sa.Column("status", strategy_status, server_default="draft", nullable=False),
        sa.Column("parameters", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("entry_rules", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("exit_rules", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("risk_constraints", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("robustness_score", sa.Float(), nullable=True),
        sa.Column("regime_compatibility", _JSONB, nullable=True),
        sa.Column("parent_strategy_id", _UUID, nullable=True),
        *_ts_cols(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_strategy_id"], ["strategies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_strategies_organization_id", "strategies", ["organization_id"])
    op.create_index("ix_strategies_status", "strategies", ["status"])

    op.create_table(
        "strategy_versions",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("version_number", sa.String(length=16), nullable=False),
        sa.Column("parameters_snapshot", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("change_reason", sa.String(length=512), nullable=True),
        *_ts_cols(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_strategy_versions_organization_id", "strategy_versions", ["organization_id"])
    op.create_index("ix_strategy_versions_strategy_id", "strategy_versions", ["strategy_id"])

    op.create_table(
        "approval_records",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("approved_by_user_id", _UUID, nullable=True),
        sa.Column("action", approval_action, nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        *_ts_cols(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approval_records_organization_id", "approval_records", ["organization_id"])
    op.create_index("ix_approval_records_strategy_id", "approval_records", ["strategy_id"])

    op.create_table(
        "performance_snapshots",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("regime_label", sa.String(length=32), nullable=False),
        sa.Column("sharpe_ratio", sa.Float(), nullable=True),
        sa.Column("max_drawdown", sa.Float(), nullable=True),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column("profit_factor", sa.Float(), nullable=True),
        sa.Column("calmar_ratio", sa.Float(), nullable=True),
        sa.Column("trade_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        *_ts_cols(),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_performance_snapshots_organization_id", "performance_snapshots", ["organization_id"])
    op.create_index("ix_performance_snapshots_strategy_id", "performance_snapshots", ["strategy_id"])


def downgrade() -> None:
    op.drop_table("performance_snapshots")
    op.drop_table("approval_records")
    op.drop_table("strategy_versions")
    op.drop_table("strategies")
    approval_action.drop(op.get_bind(), checkfirst=True)
    strategy_status.drop(op.get_bind(), checkfirst=True)
    strategy_creator.drop(op.get_bind(), checkfirst=True)
