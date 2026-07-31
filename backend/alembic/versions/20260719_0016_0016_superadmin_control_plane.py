"""Batch 24: superadmin control plane + multi-tenant onboarding.

Adds the founder-facing control-plane surface on top of the existing
application-level (ORM) multi-tenancy — there is no Postgres RLS in this schema
(tenancy is enforced structurally by TenantScopedModel + the with_loader_criteria
listener, ADR-0002), so nothing here touches row security.

Reconciliations with the existing schema (see the Batch 24 Step 0 report):
  * organizations already carries ``is_active`` (bool) and ``tier`` (the plan).
    We ADD a richer ``status`` lifecycle column rather than a second boolean, and
    backfill every EXISTING org to 'active' (they are already onboarded and live —
    the demo org must keep logging in). New self-registrations are set to
    'pending_approval' by the register service; the server_default is the safety net.
  * demo_requests already EXISTS (Batch 15, public lead capture). We EXTEND it with
    the review/approval workflow columns instead of creating a duplicate table.

New status columns use VARCHAR + server_default (not native pg enums): the
vocabularies are small and this keeps the migration simple and fully reversible;
the Python models validate the enum. superadmin_audit_log is append-only at the DB
role level, the same REVOKE pattern as audit_log / llm_audit_log / failures.

Revision ID: 0016_superadmin_control_plane
Revises: 0015_llm_router_cost
Create Date: 2026-07-19
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_superadmin_control_plane"
down_revision: str | None = "0015_llm_router_cost"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    # --- organizations: lifecycle + onboarding + control-plane metadata -------
    op.add_column(
        "organizations",
        sa.Column("status", sa.String(20), nullable=False, server_default="pending_approval"),
    )
    # Everything that exists today is already active — do NOT lock out live tenants
    # (or the demo org) behind the new approval gate.
    op.execute("UPDATE organizations SET status = 'active' WHERE is_active = true")
    op.execute("UPDATE organizations SET status = 'suspended' WHERE is_active = false")

    op.add_column(
        "organizations",
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "organizations",
        sa.Column("approved_by", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("organizations", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("suspended_by", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("organizations", sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("suspended_reason", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("terminated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("company_size", sa.String(64), nullable=True))
    op.add_column("organizations", sa.Column("aum_usd_millions", sa.Integer(), nullable=True))
    op.add_column("organizations", sa.Column("primary_asset_class", sa.String(64), nullable=True))
    op.add_column("organizations", sa.Column("internal_notes", sa.Text(), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("monthly_revenue_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )

    # --- users: the founder flag ---------------------------------------------
    op.add_column(
        "users",
        sa.Column("is_super_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # --- demo_requests: review/approval workflow (extend, don't duplicate) ----
    op.add_column(
        "demo_requests",
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.add_column(
        "demo_requests",
        sa.Column("reviewed_by", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("demo_requests", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("demo_requests", sa.Column("rejection_reason", sa.Text(), nullable=True))

    # --- superadmin_audit_log (append-only) -----------------------------------
    op.create_table(
        "superadmin_audit_log",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "super_admin_id", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=True),
        sa.Column("target_id", _UUID, nullable=True),
        sa.Column("before_value", _JSONB, nullable=True),
        sa.Column("after_value", _JSONB, nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_superadmin_audit_log_created_at", "superadmin_audit_log", ["created_at"]
    )
    # Append-only at the DB role level — same carve-out as audit_log / llm_audit_log.
    op.execute("REVOKE UPDATE, DELETE ON TABLE superadmin_audit_log FROM PUBLIC")


def downgrade() -> None:
    op.execute("GRANT UPDATE, DELETE ON TABLE superadmin_audit_log TO PUBLIC")
    op.drop_index("ix_superadmin_audit_log_created_at", table_name="superadmin_audit_log")
    op.drop_table("superadmin_audit_log")

    op.drop_column("demo_requests", "rejection_reason")
    op.drop_column("demo_requests", "reviewed_at")
    op.drop_column("demo_requests", "reviewed_by")
    op.drop_column("demo_requests", "status")

    op.drop_column("users", "is_super_admin")

    for col in (
        "monthly_revenue_usd",
        "internal_notes",
        "primary_asset_class",
        "aum_usd_millions",
        "company_size",
        "terminated_at",
        "suspended_reason",
        "suspended_at",
        "suspended_by",
        "approved_at",
        "approved_by",
        "onboarding_completed",
        "status",
    ):
        op.drop_column("organizations", col)
