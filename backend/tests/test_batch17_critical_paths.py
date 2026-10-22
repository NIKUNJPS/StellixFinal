"""Batch 17 coverage top-up for a zero-coverage critical path surfaced by the final
coverage audit (Research Memory's tenant isolation is covered by
test_graph_isolation.py and test_graph_node_search_isolation.py):

* app/validation/engine.py :: run_validation — the orchestrator that runs the five
  validation methods and assembles the composite report (the individual methods are
  covered by test_validation.py; this covers the wiring/renormalization).
"""

from __future__ import annotations

import pandas as pd
from app.validation import engine, methods
from app.validation.composite import ValidationClassification


# --------------------------------------------------------------------------- #
# validation/engine.run_validation — orchestration + effective-weight assembly
# --------------------------------------------------------------------------- #
class _FakeBacktest:
    per_regime = {"Bull": {"sharpe_ratio": 1.2}, "Bear": {"sharpe_ratio": -0.3}}
    trades = pd.DataFrame({"return": [0.1, -0.05, 0.02]})


_STRATEGY = {"entry_rules": {}, "exit_rules": {}, "risk_constraints": {"max_drawdown_pct": 30.0}}


def _stub_methods(monkeypatch, *, stress):
    """Replace the five real methods with canned (sub_score, pass, details) tuples so
    the test exercises engine.run_validation's assembly, not the methods themselves."""
    monkeypatch.setattr(methods, "walk_forward", lambda *a, **k: (1.0, True, {"folds": 5}))
    monkeypatch.setattr(methods, "regime_cv", lambda *a, **k: (0.5, True, {"regimes": 4}))
    monkeypatch.setattr(methods, "monte_carlo", lambda *a, **k: (0.8, True, {"p95_dd": 0.2}))
    monkeypatch.setattr(methods, "persistence", lambda *a, **k: (0.0, False, {"pvalue": 0.4}))
    monkeypatch.setattr(methods, "stress_test", lambda *a, **k: stress)


def test_run_validation_assembles_composite_and_report(monkeypatch):
    _stub_methods(monkeypatch, stress=(1.0, True, {"survived": True}))
    report = engine.run_validation(
        _STRATEGY, pd.DataFrame(), pd.DataFrame(), _FakeBacktest(), risk_tolerance=0.30
    )
    # 0.30*1 + 0.30*0.5 + 0.20*0.8 + 0.10*0 + 0.10*1 = 0.71 → ELIGIBLE_ACTIVE (>0.70)
    assert report.composite_score == 0.71
    assert report.classification == ValidationClassification.ELIGIBLE_ACTIVE
    assert set(report.sub_scores) == {
        "walk_forward", "regime_cv", "monte_carlo", "persistence", "stress_test",
    }
    assert report.passes["persistence"] is False
    # All five methods present → effective weights equal the base weights, summing to 1.
    eff = report.method_details["effective_weights"]
    assert set(eff) == set(report.sub_scores)
    assert abs(sum(eff.values()) - 1.0) < 0.01  # individually 4dp-rounded
    assert report.method_details["stress_test_applicable"] is True


def test_run_validation_renormalizes_when_stress_is_not_applicable(monkeypatch):
    # stress_test N/A (sub_score None) → its 0.10 weight redistributes over the other 4.
    _stub_methods(monkeypatch, stress=(None, None, {"applicable": False}))
    report = engine.run_validation(
        _STRATEGY, pd.DataFrame(), pd.DataFrame(), _FakeBacktest(), risk_tolerance=0.30
    )
    assert report.method_details["stress_test_applicable"] is False
    eff = report.method_details["effective_weights"]
    # stress_test drops out; the remaining four renormalize to sum to 1.
    assert "stress_test" not in eff
    assert abs(sum(eff.values()) - 1.0) < 0.01  # individually 4dp-rounded
    # composite over 4 present methods: (0.30*1 + 0.30*0.5 + 0.20*0.8 + 0.10*0)/0.90
    assert report.composite_score == round((0.30 + 0.15 + 0.16 + 0.0) / 0.90, 4)
