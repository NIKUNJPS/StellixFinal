"""Batch 25: production-grade auth — email verification + team invitations.

Three changes, all additive:

  * ``users.email_verified`` — proves the registrant controls the mailbox. Existing
    users are backfilled to TRUE: they were created by seeding or by an operator, so
    demanding re-verification would lock them out of a working system. Only new
    self-registrations start FALSE.
  * ``email_verification_tokens`` — mirrors password_reset_tokens exactly (SHA-256
    hash only, never the raw token; ``used_at`` set on redemption, never deleted).
  * ``invitations`` — an org admin invites a colleague, carrying the RBAC role they
    will receive. Tenant-scoped via ``organization_id`` so an invite can never grant
    access to a different organisation.

The ``user_role`` PG enum already exists (users.role), so it is referenced with
create_type=False rather than re-created. ``invitation_status`` is VARCHAR + a small
vocabulary, consistent with the Batch 24 status columns.

Revision ID: 0018_email_verify_invites
Revises: 0017_weekly_digest_toggle
Create Date: 2026-07-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_email_verify_invites"
down_revision: str | None = "0017_weekly_digest_toggle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # --- users.email_verified ------------------------------------------------
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # Existing accounts are already trusted (seeded / operator-created): verifying
    # them retroactively would lock real users out.
    op.execute("UPDATE users SET email_verified = true")

    # --- email_verification_tokens -------------------------------------------
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("organization_id", _UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", _UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- invitations ----------------------------------------------------------
    op.create_table(
        "invitations",
        sa.Column("id", _UUID, primary_key=True),
        sa.Column("organization_id", _UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("email", sa.String(320), nullable=False, index=True),
        sa.Column(
            "role",
            postgresql.ENUM(
                "researcher", "risk_manager", "cio", "compliance_officer", "admin",
                name="user_role", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("invited_by", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("invitations")
    op.drop_table("email_verification_tokens")
    op.drop_column("users", "email_verified")
