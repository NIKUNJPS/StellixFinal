"""Batch 9: llm_audit_log (append-only) + strategies.requires_review.

llm_audit_log is append-only (Safeguard 4): at the Postgres permission level we
REVOKE UPDATE and DELETE from PUBLIC, same pattern as Batch 6's failures table.

Also narrowly re-grants UPDATE on exactly two columns of the (otherwise still fully
append-only) `failures` table: `llm_generated_explanation` and
`llm_numeric_validation_passed`, both populated asynchronously by this batch's
explain_failure Celery chain (the latter drives the Failure Intelligence page's
numeric-validation warning badge). Every other column remains genuinely immutable
— this is a deliberate, targeted carve-out (Postgres column-level privileges), not
a blanket bypass. Without it, a correctly-configured least-privilege production
role (unlike this dev box's superuser connection, which bypasses all grants and
would mask the problem) would never be able to fill in the explanation at all.

Revision ID: 0009_llm_audit_log
Revises: 0008_evolution_runs
Create Date: 2026-07-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_llm_audit_log"
down_revision: str | None = "0008_evolution_runs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "llm_audit_log",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=False),
        sa.Column("user_id", _UUID, nullable=True),
        sa.Column("function_name", sa.String(length=64), nullable=False),
        sa.Column("full_prompt", sa.Text(), nullable=False),
        sa.Column("full_response", sa.Text(), nullable=False),
        sa.Column("model_used", sa.String(length=64), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("numeric_validation_passed", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_llm_audit_log_organization_id", "llm_audit_log", ["organization_id"])
    op.create_index("ix_llm_audit_log_function_name", "llm_audit_log", ["function_name"])

    # Append-only enforcement at the permission level (Safeguard 4).
    op.execute("REVOKE UPDATE, DELETE ON TABLE llm_audit_log FROM PUBLIC")

    op.add_column(
        "strategies",
        sa.Column("requires_review", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    op.add_column(
        "failures",
        sa.Column("llm_numeric_validation_passed", sa.Boolean(), nullable=True),
    )

    # Targeted carve-out: `failures` stays append-only for every column EXCEPT
    # these two, which Batch 9's async explain_failure task must be able to fill
    # in later.
    op.execute(
        "GRANT UPDATE (llm_generated_explanation, llm_numeric_validation_passed) "
        "ON TABLE failures TO PUBLIC"
    )


def downgrade() -> None:
    op.execute(
        "REVOKE UPDATE (llm_generated_explanation, llm_numeric_validation_passed) "
        "ON TABLE failures FROM PUBLIC"
    )
    op.drop_column("failures", "llm_numeric_validation_passed")
    op.drop_column("strategies", "requires_review")
    op.drop_table("llm_audit_log")
