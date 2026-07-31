"""Failure-trigger predicate tests + detection priority."""

from __future__ import annotations

from types import SimpleNamespace

from app.failure.detection import _detect_trigger
from app.failure.triggers import (
    check_drawdown_breach,
    check_regime_mismatch,
    check_sharpe_decline,
)
from app.models.failure import FailureTrigger


def test_drawdown_breach():
    assert check_drawdown_breach(-0.35, 30) is True   # 35% > 30% limit
    assert check_drawdown_breach(-0.20, 30) is False  # 20% within limit
    assert check_drawdown_breach(None, 30) is False
    assert check_drawdown_breach(-0.9, None) is False  # no limit configured


def test_sharpe_decline():
    assert check_sharpe_decline(0.3) is True
    assert check_sharpe_decline(0.6) is False
    assert check_sharpe_decline(None) is False


def test_regime_mismatch():
    compat = {"Bull": 0.8, "Bear": 0.3, "High-Volatility": -0.2}
    assert check_regime_mismatch("Crisis", compat) is True   # Crisis not validated
    assert check_regime_mismatch("Bull", compat) is False    # validated positive
    assert check_regime_mismatch("High-Volatility", compat) is True   # present but NEGATIVE Sharpe → not validated
    assert check_regime_mismatch("X", None) is False         # never validated → don't fire
    assert check_regime_mismatch("X", {"Bull": -0.5}) is False  # no positive-Sharpe regimes


def _bt(max_dd, sharpe=1.0, win=0.6):
    return SimpleNamespace(aggregate={"max_drawdown": max_dd, "sharpe_ratio": sharpe, "win_rate": win})


def test_detection_priority():
    strat = {"risk_constraints": {"max_drawdown_pct": 30}}
    compat = {"Bull": 0.8}
    # drawdown breach wins first
    assert _detect_trigger(strat, compat, _bt(-0.4), 1.0, "Bull") == FailureTrigger.DRAWDOWN_BREACH
    # then sharpe decline
    assert _detect_trigger(strat, compat, _bt(-0.1), 0.2, "Bull") == FailureTrigger.SHARPE_DECLINE
    # then regime mismatch
    assert _detect_trigger(strat, compat, _bt(-0.1), 1.0, "Crisis") == FailureTrigger.REGIME_MISMATCH
    # none
    assert _detect_trigger(strat, compat, _bt(-0.1), 1.0, "Bull") is None
