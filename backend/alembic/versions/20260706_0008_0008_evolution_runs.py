"""Batch 8: evolution_runs table + evolution_run_status enum.

Revision ID: 0008_evolution_runs
Revises: 0007_research_notes_graph
Create Date: 2026-07-06
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_evolution_runs"
down_revision: str | None = "0007_research_notes_graph"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

evolution_run_status = postgresql.ENUM(
    "running", "completed", "failed", name="evolution_run_status", create_type=False,
)

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB()


def upgrade() -> None:
    evolution_run_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "evolution_runs",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("status", evolution_run_status, server_default="running", nullable=False),
        sa.Column("ga_config", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("seed_strategy_ids", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("generation_history", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("best_fitness", sa.Float(), nullable=True),
        sa.Column("generations_run", sa.Integer(), server_default="0", nullable=False),
        sa.Column("candidate_strategy_ids", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evolution_runs_organization_id", "evolution_runs", ["organization_id"])


def downgrade() -> None:
    op.drop_table("evolution_runs")
    evolution_run_status.drop(op.get_bind(), checkfirst=True)
