"""Batch 17 coverage top-up for two zero-coverage critical paths surfaced by the
final coverage audit:

* app/graph/tenant_query.py :: run_scoped — the fail-closed tenant-scoping guard for
  Cypher (constitution §3: Neo4j has no row-level security, so a query that forgets
  the organization filter must raise, never silently cross tenants).
* app/validation/engine.py :: run_validation — the orchestrator that runs the five
  validation methods and assembles the composite report (the individual methods are
  covered by test_validation.py; this covers the wiring/renormalization).
"""

from __future__ import annotations

import pandas as pd
import pytest
from app.graph.tenant_query import GraphTenantError, run_scoped
from app.validation import engine, methods
from app.validation.composite import ValidationClassification


# --------------------------------------------------------------------------- #
# tenant_query.run_scoped — fail-closed tenant scoping
# --------------------------------------------------------------------------- #
class _FakeRecord:
    def __init__(self, data: dict):
        self._data = data

    def data(self) -> dict:
        return self._data


class _FakeResult:
    def __init__(self, records: list[dict]):
        self._records = [_FakeRecord(r) for r in records]

    def __aiter__(self):
        async def _gen():
            for r in self._records:
                yield r

        return _gen()


class _FakeSession:
    def __init__(self, records: list[dict]):
        self._records = records
        self.calls: list[tuple[str, dict]] = []

    async def run(self, query: str, **params):
        self.calls.append((query, params))
        return _FakeResult(self._records)


async def test_run_scoped_rejects_a_query_without_the_tenant_filter():
    session = _FakeSession([])
    with pytest.raises(GraphTenantError):
        await run_scoped(session, "MATCH (n:Strategy) RETURN n", organization_id="org-1")
    # Fail-closed: the query must never have reached the session.
    assert session.calls == []


async def test_run_scoped_runs_and_forwards_org_and_params():
    session = _FakeSession([{"name": "Alpha"}, {"name": "Beta"}])
    rows = await run_scoped(
        session,
        "MATCH (n:Strategy {organization_id: $organization_id}) "
        "WHERE n.name = $name RETURN n.name AS name",
        organization_id="org-1",
        name="Alpha",
    )
    assert rows == [{"name": "Alpha"}, {"name": "Beta"}]
    # organization_id is injected, and caller params pass through unchanged.
    (query, params) = session.calls[0]
    assert params == {"organization_id": "org-1", "name": "Alpha"}


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
