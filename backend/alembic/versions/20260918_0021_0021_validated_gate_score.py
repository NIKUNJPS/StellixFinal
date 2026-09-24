"""ADR 0008: the activation gate reads only the validated composite.

``strategies.robustness_score`` is the number ``assert_activatable`` checks against the
0.70 threshold. Three code paths wrote to it and only one — ``run_strategy_validation``
— wrote the 5-method composite; ``run_strategy_backtest`` and the GA's candidate
registration wrote a single backtest's own 60/40 robustness instead. Any user could
therefore overwrite a validated score with an unvalidated one through
``POST /strategies/{id}/backtest``, which needs no special permission.

This migration:

  * adds ``strategies.backtest_robustness`` — where the single-backtest number now
    lives (display only, never the gate);
  * adds ``validation_results.strategy_version`` — the version a result validated, so
    the gate can require evidence for the rules actually being activated;
  * repairs existing rows: every strategy's gate score becomes its latest validated
    composite, or NULL when it was never validated;
  * demotes any ACTIVE strategy with no validation record back to candidate — it never
    cleared the real gate.

Backfill assumption for ``strategy_version``: editing a strategy's rules bumps its
version, resets ``robustness_score`` to NULL and returns it to draft (see
``update_strategy``), so a strategy's most recent validation result corresponds to its
current version. Only that most recent result per strategy is backfilled; older ones
stay NULL because the version they validated is not recoverable.

Revision ID: 0021_validated_gate_score
Revises: 0020_dynamic_rbac
Create Date: 2026-09-18
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_validated_gate_score"
down_revision: str | None = "0020_dynamic_rbac"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("strategies", sa.Column("backtest_robustness", sa.Float(), nullable=True))
    op.add_column("validation_results", sa.Column("strategy_version", sa.String(length=20), nullable=True))

    # Keep the number that is already there: it is a real backtest result, just not
    # evidence of validation. It moves to the display-only column.
    op.execute("UPDATE strategies SET backtest_robustness = robustness_score WHERE robustness_score IS NOT NULL")

    # Record which version the latest validation result covers.
    op.execute(
        """
        UPDATE validation_results v
           SET strategy_version = s.version
          FROM strategies s
         WHERE s.id = v.strategy_id
           AND v.id = (
                 SELECT v2.id FROM validation_results v2
                  WHERE v2.strategy_id = v.strategy_id
                  ORDER BY v2.created_at DESC
                  LIMIT 1
               )
        """
    )

    # The gate score becomes the validated composite, or NULL when nothing validated it.
    op.execute(
        """
        UPDATE strategies s
           SET robustness_score = (
                 SELECT v.composite_score FROM validation_results v
                  WHERE v.strategy_id = s.id
                  ORDER BY v.created_at DESC
                  LIMIT 1
               )
        """
    )

    # An ACTIVE strategy with no validation record never cleared the gate.
    op.execute(
        """
        UPDATE strategies
           SET status = 'candidate'
         WHERE status = 'active'
           AND NOT EXISTS (SELECT 1 FROM validation_results v WHERE v.strategy_id = strategies.id)
        """
    )


def downgrade() -> None:
    # Restore the pre-migration behaviour as closely as the data allows: strategies
    # whose gate score was nulled here get their backtest number back. Strategies
    # demoted from active are NOT re-activated — reversing a governance decision
    # silently would be worse than leaving them as candidates.
    op.execute(
        "UPDATE strategies SET robustness_score = backtest_robustness "
        "WHERE robustness_score IS NULL AND backtest_robustness IS NOT NULL"
    )
    op.drop_column("validation_results", "strategy_version")
    op.drop_column("strategies", "backtest_robustness")
