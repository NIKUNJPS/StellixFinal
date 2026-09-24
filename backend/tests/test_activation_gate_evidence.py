"""ADR 0008: the activation gate requires validated evidence for the current version.

Before this, ``strategies.robustness_score`` was written by three code paths and only
one of them ran the 5-method validation suite. A plain backtest — an endpoint any
authenticated user can call — silently overwrote a validated composite with a single
backtest's own robustness, and the gate could not tell the difference. In the live dev
database that had produced 64 strategies whose gate score disagreed with their own
validation result, 10 with a gate score and no validation at all, and one ACTIVE
strategy that had never been validated.
"""

from __future__ import annotations

import uuid

import pytest
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.strategy import lifecycle


def _strategy(version: str = "v1.0", robustness: float | None = 0.85) -> Strategy:
    return Strategy(
        id=uuid.uuid4(),
        name="Gate Test",
        creator=StrategyCreator.HUMAN,
        status=StrategyStatus.CANDIDATE,
        version=version,
        parameters={},
        entry_rules={},
        exit_rules={},
        risk_constraints={},
        robustness_score=robustness,
    )


def test_never_validated_cannot_activate_even_with_a_passing_score():
    """The exact hole ADR 0008 documents: a high score with no validation behind it."""
    with pytest.raises(lifecycle.ActivationGateNotMet, match="no validation result"):
        lifecycle.assert_activatable(_strategy(), has_approval=True, validated_version=None)


def test_validation_from_an_earlier_version_cannot_activate_the_current_one():
    """Editing rules bumps the version; evidence for the old rules is not evidence
    for the new ones."""
    with pytest.raises(lifecycle.ActivationGateNotMet, match="version v1.0"):
        lifecycle.assert_activatable(_strategy(version="v1.1"), has_approval=True, validated_version="v1.0")


def test_validated_current_version_with_approval_activates():
    lifecycle.assert_activatable(_strategy(), has_approval=True, validated_version="v1.0")


def test_validated_but_below_threshold_still_blocked():
    with pytest.raises(lifecycle.ActivationGateNotMet, match="must be >= 0.7"):
        lifecycle.assert_activatable(
            _strategy(robustness=0.6736), has_approval=True, validated_version="v1.0"
        )


def test_validated_and_passing_but_unapproved_still_blocked():
    with pytest.raises(lifecycle.ActivationGateNotMet, match="approve"):
        lifecycle.assert_activatable(_strategy(), has_approval=False, validated_version="v1.0")


def test_backtest_writes_the_display_field_not_the_gate_field():
    """``run_strategy_backtest`` assigns ``backtest_robustness``; the gate field is
    only ever assigned from ``report.composite_score`` in ``run_strategy_validation``.
    Asserted on the source so a future edit that re-points either writer fails here."""
    from pathlib import Path

    source = Path(__file__).resolve().parents[1] / "app" / "services" / "strategy.py"
    text = source.read_text(encoding="utf-8")
    assert "strategy.backtest_robustness = result.robustness_score" in text
    assert "strategy.robustness_score = result.robustness_score" not in text
    assert "strategy.robustness_score = report.composite_score" in text

    evolution = source.parent / "evolution.py"
    evo_text = evolution.read_text(encoding="utf-8")
    assert "strategy.backtest_robustness = result.robustness_score" in evo_text
    assert "strategy.robustness_score = result.robustness_score" not in evo_text
