"""Batch 3: regime_labels hypertable.

Revision ID: 0003_regime_labels
Revises: 0002_data_ingestion
Create Date: 2026-06-28
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0003_regime_labels"
down_revision: str | None = "0002_data_ingestion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

regime_label = postgresql.ENUM(
    "Bull",
    "Bear",
    "High-Volatility",
    "Low-Volatility",
    "Sideways",
    "Crisis",
    name="regime_label",
    create_type=False,
)


def upgrade() -> None:
    regime_label.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "regime_labels",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("regime_label", regime_label, nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("model_votes", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("transition_probs", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("organization_id", "symbol", "timestamp", name="pk_regime_labels"),
    )
    op.create_index("ix_regime_labels_organization_id", "regime_labels", ["organization_id"])

    if not context.is_offline_mode():
        bind = op.get_bind()
        has_timescale = bind.execute(
            sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'")
        ).scalar()
        if has_timescale:
            bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
            bind.execute(
                sa.text(
                    "SELECT create_hypertable('regime_labels', 'timestamp', "
                    "if_not_exists => TRUE, migrate_data => TRUE)"
                )
            )


def downgrade() -> None:
    op.drop_table("regime_labels")
    regime_label.drop(op.get_bind(), checkfirst=True)
