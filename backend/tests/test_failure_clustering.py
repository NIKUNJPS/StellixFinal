"""Failure clustering similarity + linking tests."""

from __future__ import annotations

from app.failure.clustering import find_related, similarity


def _f(fid, regime, trigger, features):
    return {
        "id": fid,
        "regime_at_failure": regime,
        "trigger_condition": trigger,
        "feature_attribution": [{"feature_name": name} for name in features],
    }


def test_similarity_scores():
    a = _f("a", "Crisis", "drawdown_breach", ["sma_50", "macd", "rsi_14"])
    # identical → 0.4 + 0.3 + 0.3 = 1.0
    assert similarity(a, _f("b", "Crisis", "drawdown_breach", ["sma_50", "macd", "rsi_14"])) == 1.0
    # same regime + trigger, disjoint features → 0.4 + 0.3 + 0 = 0.7
    assert similarity(a, _f("b", "Crisis", "drawdown_breach", ["ema_12", "atr_14", "close"])) == 0.7
    # different regime + trigger, same features → 0 + 0 + 0.3 = 0.3
    assert similarity(a, _f("b", "Bull", "sharpe_decline", ["sma_50", "macd", "rsi_14"])) == 0.3
    # totally different → 0.0
    assert similarity(a, _f("b", "Bull", "sharpe_decline", ["ema_12", "atr_14", "close"])) == 0.0


def test_find_related_links_similar_excludes_dissimilar():
    target = _f("t", "Crisis", "drawdown_breach", ["sma_50", "macd", "rsi_14"])
    others = [
        _f("similar", "Crisis", "drawdown_breach", ["sma_50", "macd", "atr_14"]),  # sim high
        _f("dissimilar", "Bull", "sharpe_decline", ["ema_12", "close", "volume"]),  # sim 0
        _f("t", "Crisis", "drawdown_breach", ["sma_50", "macd", "rsi_14"]),  # self, skipped
    ]
    related = find_related(target, others)
    assert "similar" in related
    assert "dissimilar" not in related
    assert "t" not in related  # never links to itself
