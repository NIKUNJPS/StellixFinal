"""The four failure-trigger predicates (pure functions, independently testable)."""

from __future__ import annotations

SHARPE_DECLINE_THRESHOLD = 0.5


def check_drawdown_breach(realized_max_drawdown: float | None, max_drawdown_pct: float | None) -> bool:
    """True when realized max drawdown exceeds the strategy's configured tolerance.

    ``realized_max_drawdown`` is a fraction ≤ 0 (e.g. -0.35); ``max_drawdown_pct`` is the
    ``risk_constraints`` limit in percent (e.g. 30).
    """
    if realized_max_drawdown is None or max_drawdown_pct is None:
        return False
    return abs(realized_max_drawdown) > (max_drawdown_pct / 100.0)


def check_sharpe_decline(recent_sharpe: float | None, threshold: float = SHARPE_DECLINE_THRESHOLD) -> bool:
    """True when the rolling recent Sharpe has dropped below ``threshold`` (0.5)."""
    return recent_sharpe is not None and recent_sharpe < threshold


def check_regime_mismatch(current_regime: str | None, regime_compatibility: dict | None) -> bool:
    """True when the strategy is trading in a regime it was NOT validated to work in.

    "Validated" = a key in ``regime_compatibility`` with a positive Sharpe. If the
    strategy has no validated regimes at all (never backtested), we do NOT fire this
    (there is nothing to compare against — avoids false positives on unvalidated ones).
    """
    if not regime_compatibility or current_regime is None:
        return False
    valid = [r for r, sharpe in regime_compatibility.items() if sharpe is not None and sharpe > 0]
    if not valid:
        return False
    return current_regime not in valid
