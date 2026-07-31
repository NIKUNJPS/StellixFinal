"""Batch 14: billing/subscriptions.

subscriptions (Stripe sync record, one per organization once they've ever
completed Checkout — see docs/schemas.md -> Subscription) + a new
notification_type value (payment_failed) for the invoice.payment_failed
webhook trigger.

Revision ID: 0013_billing_subscriptions
Revises: 0012_backtest_bar_metrics
Create Date: 2026-07-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_billing_subscriptions"
down_revision: str | None = "0012_backtest_bar_metrics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)

# Reuses the EXISTING organization_tier enum (already created by the initial
# migration for Organization.tier) — create_type=False, no second CREATE TYPE.
organization_tier = postgresql.ENUM(
    "starter", "pro", "enterprise",
    name="organization_tier", create_type=False,
)
subscription_status = postgresql.ENUM(
    "active", "past_due", "canceled", "trialing",
    name="subscription_status", create_type=False,
)


def upgrade() -> None:
    # --- notification_type: add payment_failed -------------------------------- #
    # ALTER TYPE ... ADD VALUE cannot run inside the same transaction Alembic
    # wraps each migration in on older Postgres; autocommit_block() is the
    # Alembic-documented way to run it outside that block regardless of PG
    # version. IF NOT EXISTS makes a re-run idempotent.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_failed'")

    # --- subscriptions ---------------------------------------------------------- #
    subscription_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "subscriptions",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("tier", organization_tier, nullable=False),
        sa.Column("status", subscription_status, nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_subscriptions_organization_id"),
        sa.UniqueConstraint("stripe_customer_id", name="uq_subscriptions_stripe_customer_id"),
        sa.UniqueConstraint("stripe_subscription_id", name="uq_subscriptions_stripe_subscription_id"),
    )
    op.create_index("ix_subscriptions_organization_id", "subscriptions", ["organization_id"])
    op.create_index("ix_subscriptions_stripe_customer_id", "subscriptions", ["stripe_customer_id"])


def downgrade() -> None:
    op.drop_table("subscriptions")
    subscription_status.drop(op.get_bind(), checkfirst=True)

    # Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value
    # requires recreating the whole type (rename old, create new, migrate
    # every column, drop old). No column in this schema can hold
    # 'payment_failed' after subscriptions/notifications using it are gone
    # in a real downgrade sequence, so this is deliberately left a no-op
    # rather than a type-recreation dance for a label that can't be
    # referenced by any remaining row.
    pass
