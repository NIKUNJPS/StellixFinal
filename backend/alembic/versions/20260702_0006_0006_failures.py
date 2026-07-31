"""Batch 6: failures (append-only) + failure_trigger enum + REVOKE UPDATE/DELETE.

Failures are append-only (Pillar 2). At the Postgres permission level we REVOKE
UPDATE and DELETE from PUBLIC so no least-privilege application role can mutate a
failure. (The dev superuser bypasses this; the append-only test connects as a
non-superuser role via SET ROLE to prove the guarantee — see tests.)

Revision ID: 0006_failures
Revises: 0005_validation_results
Create Date: 2026-07-02
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_failures"
down_revision: str | None = "0005_validation_results"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

failure_trigger = postgresql.ENUM(
    "drawdown_breach", "sharpe_decline", "regime_mismatch", "manual",
    name="failure_trigger", create_type=False,
)

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB()


def upgrade() -> None:
    failure_trigger.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "failures",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("strategy_version", sa.String(length=16), nullable=False),
        sa.Column("failure_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("regime_at_failure", sa.String(length=32), nullable=False),
        sa.Column("trigger_condition", failure_trigger, nullable=False),
        sa.Column("performance_metrics_at_failure", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("feature_attribution", _JSONB, nullable=True),
        sa.Column("market_context_snapshot", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("llm_generated_explanation", sa.Text(), nullable=True),
        sa.Column("related_failure_ids", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_failures_organization_id", "failures", ["organization_id"])
    op.create_index("ix_failures_strategy_id", "failures", ["strategy_id"])

    # Append-only enforcement at the permission level.
    op.execute("REVOKE UPDATE, DELETE ON TABLE failures FROM PUBLIC")


def downgrade() -> None:
    op.drop_table("failures")
    failure_trigger.drop(op.get_bind(), checkfirst=True)
