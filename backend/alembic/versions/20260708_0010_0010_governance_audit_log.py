"""Batch 10: audit_log (append-only) + compliance_export_jobs + ResearchNote extension.

audit_log is append-only (governance layer): REVOKE UPDATE, DELETE from PUBLIC, same
pattern as Batch 6's failures and Batch 9's llm_audit_log.

ResearchNote gains the full Research Notebook fields (title, method, status, tags,
related_strategy_ids, related_failure_ids, updated_at) plus a GENERATED tsvector
column + GIN index for Postgres full-text search (title + content + hypothesis).

Revision ID: 0010_governance_audit_log
Revises: 0009_llm_audit_log
Create Date: 2026-07-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_governance_audit_log"
down_revision: str | None = "0009_llm_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_JSONB = postgresql.JSONB()

audit_event_type = postgresql.ENUM(
    "strategy_status_change", "strategy_approved", "strategy_rejected",
    "kill_switch_activated", "evolution_candidate_approved", "data_export",
    "user_role_changed", "login", "failed_login",
    name="audit_event_type", create_type=False,
)
research_note_status = postgresql.ENUM(
    "in_progress", "completed", "abandoned", name="research_note_status", create_type=False,
)
compliance_export_status = postgresql.ENUM(
    "pending", "running", "completed", "failed", name="compliance_export_status", create_type=False,
)


def upgrade() -> None:
    # --- audit_log (append-only) ------------------------------------------- #
    audit_event_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "audit_log",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("actor_user_id", _UUID, nullable=True),
        sa.Column("event_type", audit_event_type, nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", _UUID, nullable=False),
        sa.Column("before_state", _JSONB, nullable=True),
        sa.Column("after_state", _JSONB, nullable=True),
        sa.Column("justification", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_organization_id", "audit_log", ["organization_id"])
    op.create_index("ix_audit_log_event_type", "audit_log", ["event_type"])
    op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"])
    op.execute("REVOKE UPDATE, DELETE ON TABLE audit_log FROM PUBLIC")

    # --- compliance_export_jobs --------------------------------------------- #
    compliance_export_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "compliance_export_jobs",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("requested_by_user_id", _UUID, nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("export_format", sa.String(length=16), nullable=False),
        sa.Column("status", compliance_export_status, server_default="pending", nullable=False),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_compliance_export_jobs_organization_id", "compliance_export_jobs", ["organization_id"])

    # --- research_notes extension (Research Notebook) ----------------------- #
    research_note_status.create(op.get_bind(), checkfirst=True)
    op.add_column("research_notes", sa.Column("title", sa.String(length=255), server_default="", nullable=False))
    op.add_column("research_notes", sa.Column("method", sa.Text(), nullable=True))
    op.add_column(
        "research_notes",
        sa.Column("status", research_note_status, server_default="in_progress", nullable=False),
    )
    op.add_column("research_notes", sa.Column("tags", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column(
        "research_notes",
        sa.Column("related_strategy_ids", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
    )
    op.add_column(
        "research_notes",
        sa.Column("related_failure_ids", _JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
    )
    op.add_column(
        "research_notes",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(
        """
        ALTER TABLE research_notes ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(hypothesis, '')
            )
        ) STORED
        """
    )
    op.create_index(
        "ix_research_notes_search_vector", "research_notes", ["search_vector"], postgresql_using="gin"
    )


def downgrade() -> None:
    op.drop_index("ix_research_notes_search_vector", table_name="research_notes")
    op.drop_column("research_notes", "search_vector")
    op.drop_column("research_notes", "updated_at")
    op.drop_column("research_notes", "related_failure_ids")
    op.drop_column("research_notes", "related_strategy_ids")
    op.drop_column("research_notes", "tags")
    op.drop_column("research_notes", "status")
    op.drop_column("research_notes", "method")
    op.drop_column("research_notes", "title")
    research_note_status.drop(op.get_bind(), checkfirst=True)

    op.drop_table("compliance_export_jobs")
    compliance_export_status.drop(op.get_bind(), checkfirst=True)

    op.drop_table("audit_log")
    audit_event_type.drop(op.get_bind(), checkfirst=True)
