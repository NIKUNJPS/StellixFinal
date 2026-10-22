"""Each of the 5 named queries tested against a hand-constructed small graph
fixture with known expected answers (populated directly via the repository, no
API/Postgres round-trip — this test is purely about query LOGIC correctness)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.graph.memory_repository import InMemoryGraphRepository

ORG = "99999999-9999-9999-9999-999999999999"
NOW = datetime(2026, 7, 5, tzinfo=UTC)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _build_fixture(repo: InMemoryGraphRepository) -> None:
    # --- Strategies -------------------------------------------------------- #
    await repo.merge_node(ORG, label="Strategy", key_value="alpha", properties={
        "name": "Alpha", "version": "v1.0", "status": "active", "robustness_score": 0.9,
    })
    await repo.merge_node(ORG, label="Strategy", key_value="beta", properties={
        "name": "Beta", "version": "v1.0", "status": "active", "robustness_score": 0.7,
    })
    await repo.merge_node(ORG, label="Strategy", key_value="gamma", properties={
        "name": "Gamma", "version": "v1.0", "status": "draft", "robustness_score": 0.95,
    })
    await repo.merge_node(ORG, label="Strategy", key_value="delta", properties={
        "name": "Delta", "version": "v1.0", "status": "draft", "robustness_score": 0.4,
    })
    await repo.merge_node(ORG, label="Strategy", key_value="epsilon", properties={
        "name": "Epsilon", "version": "v1.0", "status": "draft", "robustness_score": 0.5,
    })

    # --- Lineage: epsilon -[ADAPTED_FROM]-> delta -[MUTATED_FROM]-> alpha --- #
    await repo.merge_edge(ORG, edge_type="MUTATED_FROM", from_label="Strategy", from_key="delta",
                           to_label="Strategy", to_key="alpha")
    await repo.merge_edge(ORG, edge_type="ADAPTED_FROM", from_label="Strategy", from_key="epsilon",
                           to_label="Strategy", to_key="delta")

    # --- Regimes ------------------------------------------------------------ #
    for label in ("Bull", "Bear", "High-Volatility", "Low-Volatility", "Sideways"):
        await repo.merge_node(ORG, label="Regime", key_value=label, properties={
            "regime_label": label, "confidence_score": 0.8, "symbol": "SPY",
            "start_date": "2020-01-01T00:00:00", "end_date": "2020-06-01T00:00:00",
        })

    # --- VALID_IN: alpha=4 regimes, beta=3, gamma=5 ------------------------- #
    for label in ("Bull", "Bear", "High-Volatility", "Low-Volatility"):
        await repo.merge_edge(ORG, edge_type="VALID_IN", from_label="Strategy", from_key="alpha",
                               to_label="Regime", to_key=label)
    for label in ("Bull", "Bear", "Sideways"):
        await repo.merge_edge(ORG, edge_type="VALID_IN", from_label="Strategy", from_key="beta",
                               to_label="Regime", to_key=label)
    for label in ("Bull", "Bear", "High-Volatility", "Low-Volatility", "Sideways"):
        await repo.merge_edge(ORG, edge_type="VALID_IN", from_label="Strategy", from_key="gamma",
                               to_label="Regime", to_key=label)

    # --- Failures: 3x Bear+drawdown_breach (recent), 1x Bull+sharpe_decline,
    #     1x Bear+drawdown_breach that is TOO OLD (excluded by months=24) ------ #
    def _fail(fid, strategy_key, regime, trigger, ts):
        return repo.merge_edge(
            ORG, edge_type="FAILED_IN", from_label="Strategy", from_key=strategy_key,
            to_label="Regime", to_key=regime, edge_key={"failure_id": fid},
            properties={"trigger_condition": trigger, "llm_explanation": None, "failure_timestamp": _iso(ts)},
        )

    recent = NOW - timedelta(days=30)
    old = NOW - timedelta(days=900)  # ~30 months ago — outside a 24-month window
    await _fail("f-alpha-bear", "alpha", "Bear", "drawdown_breach", recent)
    await _fail("f-gamma-bear", "gamma", "Bear", "drawdown_breach", recent)
    await _fail("f-beta-bear-old", "beta", "Bear", "drawdown_breach", old)
    await _fail("f-beta-bull", "beta", "Bull", "sharpe_decline", recent)
    # A 2nd, distinct failure instance for alpha in Bear (same strategy, still +1 occurrence).
    await _fail("f-alpha-bear-2", "alpha", "Bear", "drawdown_breach", recent - timedelta(days=1))

    # --- ResearchNote / INSPIRED_BY ------------------------------------------ #
    await repo.merge_node(ORG, label="ResearchNote", key_value="note-sma", properties={
        "content": "SMA crossovers lag momentum", "hypothesis": "Late entries underperform",
        "created_at": "2020-01-01T00:00:00",
    })
    await repo.merge_node(ORG, label="ResearchNote", key_value="note-meanrev", properties={
        "content": "Mean reversion in sideways markets", "hypothesis": "RSI extremes revert",
        "created_at": "2020-01-01T00:00:00",
    })
    # alpha (active) and beta (active) both trace to note-sma; gamma (draft, NOT active) traces to note-meanrev.
    await repo.merge_edge(ORG, edge_type="INSPIRED_BY", from_label="Strategy", from_key="alpha",
                           to_label="ResearchNote", to_key="note-sma")
    await repo.merge_edge(ORG, edge_type="INSPIRED_BY", from_label="Strategy", from_key="beta",
                           to_label="ResearchNote", to_key="note-sma")
    await repo.merge_edge(ORG, edge_type="INSPIRED_BY", from_label="Strategy", from_key="gamma",
                           to_label="ResearchNote", to_key="note-meanrev")


@pytest.fixture
async def fixture_repo():
    repo = InMemoryGraphRepository()
    await _build_fixture(repo)
    return repo


@pytest.mark.anyio
async def test_failed_strategies_by_regime(fixture_repo):
    since = NOW - timedelta(days=24 * 30)
    rows = await fixture_repo.failed_strategies_by_regime(ORG, regime="Bear", since=since)
    strategy_ids = sorted(r["strategy_id"] for r in rows)
    # alpha (x2 recent failures) + gamma (x1) qualify; beta's Bear failure is too old.
    assert strategy_ids == ["alpha", "alpha", "gamma"]
    assert all(r["trigger_condition"] == "drawdown_breach" for r in rows)
    # Sorted by failure_timestamp desc.
    timestamps = [r["failure_timestamp"] for r in rows]
    assert timestamps == sorted(timestamps, reverse=True)


@pytest.mark.anyio
async def test_lineage_from_leaf_walks_both_ancestor_hops(fixture_repo):
    result = await fixture_repo.lineage(ORG, strategy_id="epsilon")
    assert result["target"]["name"] == "Epsilon"
    ancestor_names = sorted(a["name"] for a in result["ancestors"])
    assert ancestor_names == ["Alpha", "Delta"]
    assert result["descendants"] == []
    edge_pairs = {(e["from_id"], e["edge_type"], e["to_id"]) for e in result["edges"]}
    assert edge_pairs == {("epsilon", "ADAPTED_FROM", "delta"), ("delta", "MUTATED_FROM", "alpha")}


@pytest.mark.anyio
async def test_lineage_from_root_walks_both_descendant_hops(fixture_repo):
    result = await fixture_repo.lineage(ORG, strategy_id="alpha")
    assert result["target"]["name"] == "Alpha"
    assert result["ancestors"] == []
    descendant_names = sorted(d["name"] for d in result["descendants"])
    assert descendant_names == ["Delta", "Epsilon"]


@pytest.mark.anyio
async def test_lineage_unknown_strategy_returns_not_found(fixture_repo):
    result = await fixture_repo.lineage(ORG, strategy_id="does-not-exist")
    assert result["target"] is None


@pytest.mark.anyio
async def test_robust_across_regimes_threshold_and_ordering(fixture_repo):
    rows = await fixture_repo.robust_across_regimes(ORG, min_regimes=4)
    # beta has only 3 distinct regimes -> excluded. gamma (0.95) ranks above alpha (0.9).
    assert [r["strategy_id"] for r in rows] == ["gamma", "alpha"]
    assert [r["regime_count"] for r in rows] == [5, 4]


@pytest.mark.anyio
async def test_robust_across_regimes_lower_threshold_includes_beta(fixture_repo):
    rows = await fixture_repo.robust_across_regimes(ORG, min_regimes=3)
    assert set(r["strategy_id"] for r in rows) == {"gamma", "alpha", "beta"}


@pytest.mark.anyio
async def test_recurring_failure_modes_at_threshold(fixture_repo):
    # No time filter on this query (unlike failed_strategies_by_regime), so beta's
    # OLD Bear+drawdown_breach failure still counts: alpha x2 + gamma x1 + beta x1 = 4.
    rows = await fixture_repo.recurring_failure_modes(ORG, min_occurrences=3)
    assert len(rows) == 1
    row = rows[0]
    assert row["regime_label"] == "Bear"
    assert row["trigger_condition"] == "drawdown_breach"
    assert row["occurrence_count"] == 4
    assert row["strategy_count"] == 3
    assert row["strategy_ids"] == ["alpha", "beta", "gamma"]


@pytest.mark.anyio
async def test_recurring_failure_modes_below_threshold_excluded(fixture_repo):
    rows = await fixture_repo.recurring_failure_modes(ORG, min_occurrences=10)
    assert rows == []


@pytest.mark.anyio
async def test_hypotheses_leading_to_active_excludes_non_active_strategies(fixture_repo):
    rows = await fixture_repo.hypotheses_leading_to_active(ORG)
    by_note = {r["note_id"]: r for r in rows}
    assert "note-sma" in by_note
    assert "note-meanrev" not in by_note  # gamma is draft, not active
    active_names = sorted(s["name"] for s in by_note["note-sma"]["active_strategies"])
    assert active_names == ["Alpha", "Beta"]
