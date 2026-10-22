"""A failure's instrument resolves from its own record first, then from its strategy.

Failure rows are append-only, so older rows that never recorded an instrument are
resolved read-side instead of being edited.
"""
from types import SimpleNamespace

from app.api.routes.failures import _failure_symbol


def _failure(snapshot):
    return SimpleNamespace(market_context_snapshot=snapshot)


def test_recorded_symbol_wins_over_strategy_symbol():
    assert _failure_symbol(_failure({"symbol": "QQQ"}), "spy") == "QQQ"


def test_falls_back_to_strategy_symbol_normalised():
    assert _failure_symbol(_failure({}), " spy ") == "SPY"


def test_none_when_neither_known():
    assert _failure_symbol(_failure(None), None) is None
