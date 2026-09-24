"""Batch 26 Part B: strategies.symbol.

Adds the instrument a strategy trades. Nullable, because strategies created before
this column existed have no recoverable symbol — those rows stay NULL and the
application treats a NULL-symbol strategy as one that can never generate a signal
(signals need bars for a specific symbol). New strategies are required to carry a
symbol, enforced in the API schema (StrategyCreateRequest), not the DB.

Backfill is deliberately surgical: only a currently-``active`` strategy whose name
begins with ``SPY`` gets ``symbol = 'SPY'``. That is the one case where the value is
an unambiguous, certain fact (the strategy was validated and approved on SPY bars and
says so in its own name). Every other NULL-symbol row is left alone rather than
guessed — see docs/schemas.md → Strategy.

Revision ID: 0022_strategy_symbol
Revises: 0021_validated_gate_score
Create Date: 2026-09-22
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_strategy_symbol"
down_revision: str | None = "0021_validated_gate_score"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("strategies", sa.Column("symbol", sa.String(length=32), nullable=True))
    # The one certain backfill: the currently-active SPY strategy (see module docstring).
    op.execute(
        "UPDATE strategies SET symbol = 'SPY' "
        "WHERE symbol IS NULL AND status = 'active' AND name LIKE 'SPY%'"
    )


def downgrade() -> None:
    op.drop_column("strategies", "symbol")
