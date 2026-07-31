"""Batch 2: market_data, feature_matrix (hypertables) + ingestion_jobs.

market_data and feature_matrix become TimescaleDB hypertables when the extension is
available; on a plain Postgres (no timescaledb) they remain regular tables — the
schema and queries are identical either way.

Revision ID: 0002_data_ingestion
Revises: 0001_initial
Create Date: 2026-06-28
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0002_data_ingestion"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ingestion_status = postgresql.ENUM(
    "pending", "running", "done", "failed", name="ingestion_status", create_type=False
)


def upgrade() -> None:
    ingestion_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "market_data",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Float(), nullable=False),
        sa.Column("high", sa.Float(), nullable=False),
        sa.Column("low", sa.Float(), nullable=False),
        sa.Column("close", sa.Float(), nullable=False),
        sa.Column("volume", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("organization_id", "symbol", "timestamp", name="pk_market_data"),
    )
    op.create_index("ix_market_data_organization_id", "market_data", ["organization_id"])

    op.create_table(
        "feature_matrix",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("features", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("log_return", sa.Float(), nullable=True),
        sa.Column("sma_20", sa.Float(), nullable=True),
        sa.Column("sma_50", sa.Float(), nullable=True),
        sa.Column("ema_12", sa.Float(), nullable=True),
        sa.Column("ema_26", sa.Float(), nullable=True),
        sa.Column("rsi_14", sa.Float(), nullable=True),
        sa.Column("macd", sa.Float(), nullable=True),
        sa.Column("macd_signal", sa.Float(), nullable=True),
        sa.Column("atr_14", sa.Float(), nullable=True),
        sa.Column("bollinger_upper", sa.Float(), nullable=True),
        sa.Column("bollinger_lower", sa.Float(), nullable=True),
        sa.Column("realized_vol_20", sa.Float(), nullable=True),
        sa.Column("autocorr_5", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("organization_id", "symbol", "timestamp", name="pk_feature_matrix"),
    )
    op.create_index("ix_feature_matrix_organization_id", "feature_matrix", ["organization_id"])

    op.create_table(
        "ingestion_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("interval", sa.String(length=8), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("status", ingestion_status, server_default="pending", nullable=False),
        sa.Column("rows_ingested", sa.Integer(), server_default="0", nullable=False),
        sa.Column("features_computed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("warnings", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ingestion_jobs_organization_id", "ingestion_jobs", ["organization_id"])

    # Convert the two time-series tables into hypertables IF TimescaleDB is present.
    # On a plain Postgres they remain regular tables (identical schema & queries).
    if not context.is_offline_mode():
        bind = op.get_bind()
        has_timescale = bind.execute(
            sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'")
        ).scalar()
        if has_timescale:
            bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
            bind.execute(
                sa.text(
                    "SELECT create_hypertable('market_data', 'timestamp', "
                    "if_not_exists => TRUE, migrate_data => TRUE)"
                )
            )
            bind.execute(
                sa.text(
                    "SELECT create_hypertable('feature_matrix', 'timestamp', "
                    "if_not_exists => TRUE, migrate_data => TRUE)"
                )
            )


def downgrade() -> None:
    op.drop_table("ingestion_jobs")
    op.drop_table("feature_matrix")
    op.drop_table("market_data")
    ingestion_status.drop(op.get_bind(), checkfirst=True)
