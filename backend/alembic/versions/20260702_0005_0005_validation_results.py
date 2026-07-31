"""Batch 5: validation_results + organizations.risk_tolerance_max_drawdown_pct.

Revision ID: 0005_validation_results
Revises: 0004_strategy_lifecycle
Create Date: 2026-07-02
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_validation_results"
down_revision: str | None = "0004_strategy_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

validation_classification = postgresql.ENUM(
    "auto_fail", "candidate", "eligible_active", name="validation_classification", create_type=False
)

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "risk_tolerance_max_drawdown_pct",
            sa.Float(),
            server_default="30.0",
            nullable=False,
        ),
    )

    validation_classification.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "validation_results",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("walk_forward_score", sa.Float(), nullable=True),
        sa.Column("regime_cv_score", sa.Float(), nullable=True),
        sa.Column("monte_carlo_score", sa.Float(), nullable=True),
        sa.Column("persistence_score", sa.Float(), nullable=True),
        sa.Column("stress_test_score", sa.Float(), nullable=True),
        sa.Column("composite_score", sa.Float(), nullable=False),
        sa.Column("classification", validation_classification, nullable=False),
        sa.Column("method_details", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_validation_results_organization_id", "validation_results", ["organization_id"])
    op.create_index("ix_validation_results_strategy_id", "validation_results", ["strategy_id"])


def downgrade() -> None:
    op.drop_table("validation_results")
    validation_classification.drop(op.get_bind(), checkfirst=True)
    op.drop_column("organizations", "risk_tolerance_max_drawdown_pct")
