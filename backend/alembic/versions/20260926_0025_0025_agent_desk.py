"""Batch 30 (ADR 0009): multi-agent desk — agent_analyses, agent_backtest_runs,
agents.run permission, and two audit event labels.

``agents.run`` is a frozen delta on top of 0020 + 0023, same idempotent pattern as
0023: permission row, then grants to the system roles that hold it in
``app/rbac/catalog.py`` (Admin holds it by the catalog's "every permission except three"
formula, so it is listed explicitly here). Compliance Officer is deliberately not
granted it — read-only on the desk, like its other view-only grants.

Revision ID: 0025_agent_desk
Revises: 0024_strategy_signals
Create Date: 2026-09-26
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025_agent_desk"
down_revision: str | None = "0024_strategy_signals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_NAMESPACE = uuid.UUID("5b0d6c0e-2f0a-4c7e-9a52-6b1f3c8e9d21")

# --- frozen delta (kept identical to app/rbac/catalog.py) --------------------------
NEW_PERMISSIONS = [
    ("agents.run", "Research", "Start multi-agent desk analyses and agent backtests (each run makes real LLM calls)"),
]
AGENTS_RUN_GRANTED_TO = ["researcher", "quant_engineer", "risk_manager", "cio", "admin"]


def _permission_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.permission.{key}")


def _system_role_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.system_role.{key}")


_STATUS = postgresql.ENUM("queued", "running", "completed", "failed", name="agent_analysis_status", create_type=False)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'agent_analysis_completed'")
        op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'agent_backtest_completed'")

    _STATUS.create(op.get_bind(), checkfirst=True)

    ts = [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]

    op.create_table(
        "agent_backtest_runs",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("requested_by_user_id", _UUID, nullable=True),
        sa.Column("tickers", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("trade_dates", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("selected_analysts", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("status", _STATUS, nullable=False, server_default="queued"),
        sa.Column("total_cells", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_cells", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_cells", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *ts,
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_backtest_runs_organization_id", "agent_backtest_runs", ["organization_id"])

    op.create_table(
        "agent_analyses",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("requested_by_user_id", _UUID, nullable=True),
        sa.Column("backtest_run_id", _UUID, nullable=True),
        sa.Column("ticker", sa.String(length=32), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("asset_type", sa.String(length=16), nullable=False, server_default="stock"),
        sa.Column("status", _STATUS, nullable=False, server_default="queued"),
        sa.Column("selected_analysts", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("llm_provider", sa.String(length=32), nullable=False),
        sa.Column("deep_model", sa.String(length=64), nullable=False),
        sa.Column("quick_model", sa.String(length=64), nullable=False),
        sa.Column("config_snapshot", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("regime_at_analysis", sa.String(length=32), nullable=True),
        sa.Column("regime_confidence", sa.Float(), nullable=True),
        sa.Column("regime_context", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("progress", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("reports", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("rating", sa.String(length=16), nullable=True),
        sa.Column("trader_action", sa.String(length=8), nullable=True),
        sa.Column("time_horizon", sa.String(length=128), nullable=True),
        sa.Column("position_sizing", sa.String(length=128), nullable=True),
        sa.Column("research_note_id", _UUID, nullable=True),
        sa.Column("llm_call_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("benchmark", sa.String(length=32), nullable=True),
        sa.Column("holding_days", sa.Integer(), nullable=True),
        sa.Column("settled_raw_return", sa.Float(), nullable=True),
        sa.Column("settled_alpha", sa.Float(), nullable=True),
        sa.Column("settled_resolution_date", sa.Date(), nullable=True),
        sa.Column("settled_reflection", sa.Text(), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        *ts,
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["backtest_run_id"], ["agent_backtest_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["research_note_id"], ["research_notes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_analyses_organization_id", "agent_analyses", ["organization_id"])
    op.create_index("ix_agent_analyses_backtest_run_id", "agent_analyses", ["backtest_run_id"])
    op.create_index(
        "ix_agent_analyses_org_ticker_date", "agent_analyses", ["organization_id", "ticker", "trade_date"]
    )

    conn = op.get_bind()
    for key, category, description in NEW_PERMISSIONS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, key, category, description) "
                "VALUES (:id, :key, :category, :description) ON CONFLICT (key) DO NOTHING"
            ),
            {"id": _permission_id(key), "key": key, "category": category, "description": description},
        )
    for role_key in AGENTS_RUN_GRANTED_TO:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "VALUES (:role_id, :permission_id) ON CONFLICT DO NOTHING"
            ),
            {"role_id": _system_role_id(role_key), "permission_id": _permission_id("agents.run")},
        )


def downgrade() -> None:
    conn = op.get_bind()
    perm = _permission_id("agents.run")
    conn.execute(sa.text("DELETE FROM role_permissions WHERE permission_id = :p"), {"p": perm})
    conn.execute(sa.text("DELETE FROM permissions WHERE id = :p"), {"p": perm})
    op.drop_index("ix_agent_analyses_org_ticker_date", table_name="agent_analyses")
    op.drop_index("ix_agent_analyses_backtest_run_id", table_name="agent_analyses")
    op.drop_index("ix_agent_analyses_organization_id", table_name="agent_analyses")
    op.drop_table("agent_analyses")
    op.drop_index("ix_agent_backtest_runs_organization_id", table_name="agent_backtest_runs")
    op.drop_table("agent_backtest_runs")
    op.execute("DROP TYPE IF EXISTS agent_analysis_status")
    # Postgres cannot drop the added audit_event_type labels; they are left in place.
