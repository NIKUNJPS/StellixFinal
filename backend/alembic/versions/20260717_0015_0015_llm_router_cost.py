"""Batch 18: record which model served each LLM call and what it cost.

Batch 9 assumed a single provider, so `model_used` was effectively a constant and
cost was implicit. With the Batch 18 cost router, a call may be served by Gemini or
Claude — at a ~10x price difference — so two things must be recorded per row:

  * `model_key`          — which provider lane served it ("gemini" | "claude"),
    distinct from `model_used` (the concrete model id, e.g. "gemini-2.5-flash").
    Stored separately so cost-by-lane reporting doesn't have to parse model ids.
  * `estimated_cost_usd` — the cost of THIS call, computed from the provider's real
    reported token usage at the price in effect when the call was made.

Cost is persisted rather than derived at read time on purpose: per-token prices
change, and a compliance log that recomputes historical spend against today's price
list would silently restate the past. Nullable because a provider may not report
usage, and because Batch 9-era rows predate the router and have no honest value to
backfill — NULL says "unknown", which is true; a 0.0 default would say "free",
which is not.

llm_audit_log remains append-only (Safeguard 4): migration 0009 REVOKEs UPDATE and
DELETE on it, and adding a column does not disturb those grants. No backfill of
existing rows is attempted for the same reason.

Revision ID: 0015_llm_router_cost
Revises: 0014_demo_requests
Create Date: 2026-07-17
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_llm_router_cost"
down_revision: str | None = "0014_demo_requests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "llm_audit_log",
        sa.Column("model_key", sa.String(16), nullable=True),
    )
    op.add_column(
        "llm_audit_log",
        sa.Column("estimated_cost_usd", sa.Numeric(12, 6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("llm_audit_log", "estimated_cost_usd")
    op.drop_column("llm_audit_log", "model_key")
