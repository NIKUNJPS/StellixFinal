"""Batch 12: dashboard-page supporting models.

notifications (real event-triggered, per-user), api_keys (SHA-256-hashed,
scoped programmatic auth), trade_records (persisted per-trade detail for the
Backtest Results page, extending Batch 4's backtest output),
password_reset_tokens (mirrors RefreshToken's hashing pattern). Plus:
Organization.benchmark_symbol, User.totp_secret/mfa_enabled/avatar_url/
preferences, and performance_snapshots.sortino_ratio/beta_vs_benchmark.

Revision ID: 0011_notifications_dashboard
Revises: 0010_governance_audit_log
Create Date: 2026-07-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_notifications_dashboard"
down_revision: str | None = "0010_governance_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB()

notification_type = postgresql.ENUM(
    "failure_detected", "evolution_completed", "approval_requested",
    name="notification_type", create_type=False,
)


def upgrade() -> None:
    # --- notifications -------------------------------------------------------- #
    notification_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "notifications",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("type", notification_type, nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=512), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_organization_id", "notifications", ["organization_id"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])

    # --- api_keys --------------------------------------------------------------- #
    op.create_table(
        "api_keys",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("key_prefix", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scopes", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key_hash", name="uq_api_keys_key_hash"),
    )
    op.create_index("ix_api_keys_organization_id", "api_keys", ["organization_id"])
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"])

    # --- trade_records ------------------------------------------------------------ #
    op.create_table(
        "trade_records",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("entry_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("entry_price", sa.Float(), nullable=False),
        sa.Column("exit_price", sa.Float(), nullable=False),
        sa.Column("pnl", sa.Float(), nullable=False),
        sa.Column("return_pct", sa.Float(), nullable=False),
        sa.Column("regime_at_entry", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trade_records_organization_id", "trade_records", ["organization_id"])
    op.create_index("ix_trade_records_strategy_id", "trade_records", ["strategy_id"])

    # --- password_reset_tokens ------------------------------------------------ #
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_password_reset_tokens_token_hash"),
    )
    op.create_index("ix_password_reset_tokens_organization_id", "password_reset_tokens", ["organization_id"])
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"])

    # --- organizations: benchmark_symbol -------------------------------------- #
    op.add_column(
        "organizations",
        sa.Column("benchmark_symbol", sa.String(length=32), server_default="SPY", nullable=False),
    )

    # --- users: MFA + avatar + preferences ------------------------------------ #
    op.add_column("users", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    op.add_column(
        "users",
        sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("users", sa.Column("avatar_url", sa.String(length=512), nullable=True))
    op.add_column(
        "users",
        sa.Column("preferences", _JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
    )

    # --- performance_snapshots: sortino_ratio + beta_vs_benchmark ------------- #
    op.add_column("performance_snapshots", sa.Column("sortino_ratio", sa.Float(), nullable=True))
    op.add_column("performance_snapshots", sa.Column("beta_vs_benchmark", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("performance_snapshots", "beta_vs_benchmark")
    op.drop_column("performance_snapshots", "sortino_ratio")

    op.drop_column("users", "preferences")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "totp_secret")

    op.drop_column("organizations", "benchmark_symbol")

    op.drop_table("password_reset_tokens")

    op.drop_table("trade_records")

    op.drop_table("api_keys")

    op.drop_table("notifications")
    notification_type.drop(op.get_bind(), checkfirst=True)
