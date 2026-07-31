"""Batch 22: weekly-digest opt-out toggle.

Adds a single boolean ``organizations.weekly_digest_enabled`` (default true) so an
org can opt out of the weekly digest. The digest itself is delivered over the
existing webhook/log notification channel — there is no SMTP in this deployment —
and the Celery beat sweep (send_weekly_digests) skips orgs where this is False.

Revision ID: 0017_weekly_digest_toggle
Revises: 0016_superadmin_control_plane
Create Date: 2026-07-20
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_weekly_digest_toggle"
down_revision: str | None = "0016_superadmin_control_plane"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "weekly_digest_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("organizations", "weekly_digest_enabled")
