"""Batch 15: demo_requests (public lead capture).

Not tenant-scoped — an anonymous public visitor has no organization yet. See
docs/schemas.md -> DemoRequest.

Revision ID: 0014_demo_requests
Revises: 0013_billing_subscriptions
Create Date: 2026-07-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_demo_requests"
down_revision: str | None = "0013_billing_subscriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB()

demo_firm_type = postgresql.ENUM(
    "hedge_fund", "prop_trading", "crypto_fund", "investment_bank",
    "asset_manager", "family_office", "academic_other",
    name="demo_firm_type", create_type=False,
)
demo_team_size = postgresql.ENUM(
    "size_1_5", "size_6_20", "size_21_50", "size_51_200", "size_200_plus",
    name="demo_team_size", create_type=False,
)


def upgrade() -> None:
    demo_firm_type.create(op.get_bind(), checkfirst=True)
    demo_team_size.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "demo_requests",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("work_email", sa.String(length=320), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("job_title", sa.String(length=255), nullable=False),
        sa.Column("firm_type", demo_firm_type, nullable=False),
        sa.Column("team_size", demo_team_size, nullable=False),
        sa.Column("use_case_description", sa.Text(), nullable=False),
        sa.Column("primary_interest", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("consent", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_demo_requests_work_email", "demo_requests", ["work_email"])


def downgrade() -> None:
    op.drop_table("demo_requests")
    demo_team_size.drop(op.get_bind(), checkfirst=True)
    demo_firm_type.drop(op.get_bind(), checkfirst=True)
