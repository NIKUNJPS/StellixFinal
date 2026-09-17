"""Batch 25: dual-approval kill switch + actor-attributed audit trail.

Three additive changes:

  * ``audit_event_type`` gains ``logout``, ``strategy_created``,
    ``strategy_version_saved``, ``strategy_deleted``, ``kill_switch_reviewed`` and
    ``llm_explanation_generated`` — the audit trail now covers the research and
    governance actions users actually take, not only auth + approvals.
  * ``audit_log`` gains a point-in-time actor/target snapshot (``actor_email``,
    ``actor_name``, ``actor_role``, ``entity_name``, ``description``). Existing rows are
    deliberately NOT backfilled: the table is append-only, and a user's *current*
    role is not evidence of the role they held when they acted. The API falls back
    to the live user record for those legacy rows and says so.
  * ``kill_switch_reviews`` — one row per kill, carrying the CIO review owed for any
    kill not made by a CIO (14-day deadline; overdue reviews are flagged, never
    silently expired).

``ALTER TYPE ... ADD VALUE`` runs in an autocommit block: Postgres forbids using a
newly added enum label inside the transaction that added it, and running it
outside the migration transaction keeps this safe on every supported version.

Revision ID: 0019_governance_audit_actor
Revises: 0018_email_verify_invites
Create Date: 2026-09-16
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_governance_audit_actor"
down_revision: str | None = "0018_email_verify_invites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)

_NEW_AUDIT_EVENT_TYPES = (
    "logout",
    "strategy_created",
    "strategy_version_saved",
    "strategy_deleted",
    "kill_switch_reviewed",
    "llm_explanation_generated",
)


def upgrade() -> None:
    # --- audit_event_type: new labels ----------------------------------------
    with op.get_context().autocommit_block():
        for label in _NEW_AUDIT_EVENT_TYPES:
            op.execute(f"ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS '{label}'")

    # --- audit_log: actor + target snapshot ----------------------------------
    op.add_column("audit_log", sa.Column("actor_email", sa.String(length=320), nullable=True))
    op.add_column("audit_log", sa.Column("actor_name", sa.String(length=255), nullable=True))
    op.add_column("audit_log", sa.Column("actor_role", sa.String(length=32), nullable=True))
    op.add_column("audit_log", sa.Column("entity_name", sa.String(length=255), nullable=True))
    op.add_column("audit_log", sa.Column("description", sa.Text(), nullable=True))
    op.create_index("ix_audit_log_actor_user_id", "audit_log", ["actor_user_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])

    # --- kill_switch_reviews --------------------------------------------------
    op.create_table(
        "kill_switch_reviews",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("strategy_id", _UUID, nullable=False),
        sa.Column("triggered_by_user_id", _UUID, nullable=True),
        sa.Column("triggered_by_role", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status_before_kill", sa.String(length=16), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("review_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_by_user_id", _UUID, nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("is_self_reviewed", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kill_switch_reviews_organization_id", "kill_switch_reviews", ["organization_id"])
    op.create_index("ix_kill_switch_reviews_strategy_id", "kill_switch_reviews", ["strategy_id"])


def downgrade() -> None:
    op.drop_index("ix_kill_switch_reviews_strategy_id", table_name="kill_switch_reviews")
    op.drop_index("ix_kill_switch_reviews_organization_id", table_name="kill_switch_reviews")
    op.drop_table("kill_switch_reviews")

    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_actor_user_id", table_name="audit_log")
    op.drop_column("audit_log", "description")
    op.drop_column("audit_log", "entity_name")
    op.drop_column("audit_log", "actor_role")
    op.drop_column("audit_log", "actor_name")
    op.drop_column("audit_log", "actor_email")
    # Postgres cannot drop a label from an enum type; the added audit_event_type
    # values are left in place (harmless — nothing references them after downgrade).
