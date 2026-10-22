"""Batch 30b: agent_analyses.portfolio — portfolio-aware desk runs.

Nullable JSONB in TradingAgents' PortfolioContext shape ({cash, currency, positions}).
NULL means no portfolio was given, which the agents must not read as a flat book.

Revision ID: 0026_agent_portfolio
Revises: 0025_agent_desk
Create Date: 2026-09-26
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026_agent_portfolio"
down_revision: str | None = "0025_agent_desk"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agent_analyses", sa.Column("portfolio", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_analyses", "portfolio")
