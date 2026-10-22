"""Batch 7: research_notes table + Strategy.inspired_by_note_id (knowledge graph).

research_notes is the minimal Postgres source-of-truth for researcher hypotheses,
synced 1:1 into the ResearchNote record of Research Memory (a Neo4j node until ADR 0012). Strategy.inspired_by_note_id is a
nullable FK backing the INSPIRED_BY graph edge (Strategy -> ResearchNote).

Revision ID: 0007_research_notes_graph
Revises: 0006_failures
Create Date: 2026-07-05
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_research_notes_graph"
down_revision: str | None = "0006_failures"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "research_notes",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("hypothesis", sa.Text(), nullable=True),
        sa.Column("author_user_id", _UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_research_notes_organization_id", "research_notes", ["organization_id"])

    op.add_column(
        "strategies",
        sa.Column("inspired_by_note_id", _UUID, nullable=True),
    )
    op.create_foreign_key(
        "fk_strategies_inspired_by_note_id",
        "strategies",
        "research_notes",
        ["inspired_by_note_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_strategies_inspired_by_note_id", "strategies", type_="foreignkey")
    op.drop_column("strategies", "inspired_by_note_id")
    op.drop_table("research_notes")
