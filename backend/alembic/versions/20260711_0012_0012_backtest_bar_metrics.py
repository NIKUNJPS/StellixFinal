"""Batch 12 (follow-up): annualized_return + volatility on performance_snapshots.

Page 13 (Backtest Results) lists these as 2 of its 10 headline metrics
alongside Sortino/Beta, which the 0011 migration already added — these two
were missed in that pass. Same aggregate-only convention as beta_vs_benchmark
(per-bar basis, not per-regime; see app/strategy/backtest.py
compute_bar_level_metrics).

Revision ID: 0012_backtest_bar_metrics
Revises: 0011_notifications_dashboard
Create Date: 2026-07-11
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_backtest_bar_metrics"
down_revision: str | None = "0011_notifications_dashboard"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("performance_snapshots", sa.Column("annualized_return", sa.Float(), nullable=True))
    op.add_column("performance_snapshots", sa.Column("volatility", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("performance_snapshots", "volatility")
    op.drop_column("performance_snapshots", "annualized_return")
