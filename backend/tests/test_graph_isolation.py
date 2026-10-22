"""Tenant isolation leakage test for the knowledge graph — the most important test
in Batch 7 (written FIRST, before the correctness tests, per the batch's own
instruction — same TDD-first discipline as Batch 6's failure-isolation test).

Two orgs are seeded with graph data using the SAME node key values (same
strategy_id, same regime label, same failure_id, same note_id) — the strictest
possible check that isolation comes from the (organization_id, label, key) composite
identity, not from the test data happening to differ.
"""

from __future__ import annotations

import pytest
from app.graph.memory_repository import InMemoryGraphRepository

from tests.helpers import bearer
from tests.helpers import register_activate_login as register


async def _seed_org(repo: InMemoryGraphRepository, org_id: str, *, name_suffix: str) -> None:
    """Seed one org with a full set of graph data, using identical key VALUES
    (shared UUIDs/labels) across orgs — only organization_id differs."""
    strategy_id = "11111111-1111-1111-1111-111111111111"
    parent_id = "22222222-2222-2222-2222-222222222222"
    failure_id = "33333333-3333-3333-3333-333333333333"
    note_id = "44444444-4444-4444-4444-444444444444"

    await repo.merge_node(
        org_id,
        label="Strategy",
        key_value=parent_id,
        properties={"name": f"Parent {name_suffix}", "version": "v1.0", "status": "retired", "robustness_score": 0.5},
    )
    await repo.merge_node(
        org_id,
        label="Strategy",
        key_value=strategy_id,
        properties={"name": f"Shared Name {name_suffix}", "version": "v1.0", "status": "active", "robustness_score": 0.9},
    )
    await repo.merge_edge(
        org_id, edge_type="MUTATED_FROM", from_label="Strategy", from_key=strategy_id,
        to_label="Strategy", to_key=parent_id,
    )

    for label in ("Bull", "Bear", "High-Volatility", "Low-Volatility"):
        await repo.merge_node(
            org_id, label="Regime", key_value=label,
            properties={"regime_label": label, "confidence_score": 0.8, "symbol": "SPY",
                        "start_date": "2020-01-01T00:00:00", "end_date": "2020-06-01T00:00:00"},
        )
        await repo.merge_edge(
            org_id, edge_type="VALID_IN", from_label="Strategy", from_key=strategy_id,
            to_label="Regime", to_key=label,
        )

    await repo.merge_node(
        org_id, label="Failure", key_value=failure_id,
        properties={"trigger_condition": "manual", "llm_explanation": None,
                    "failure_timestamp": "2020-05-29T00:00:00"},
    )
    await repo.merge_edge(
        org_id, edge_type="FAILED_IN", from_label="Strategy", from_key=strategy_id,
        to_label="Regime", to_key="Bear", edge_key={"failure_id": failure_id},
        properties={"trigger_condition": "manual", "llm_explanation": None,
                    "failure_timestamp": "2020-05-29T00:00:00"},
    )

    await repo.merge_node(
        org_id, label="ResearchNote", key_value=note_id,
        properties={"content": f"Note {name_suffix}", "hypothesis": "SMA crossovers lag", "created_at": "2020-01-01T00:00:00"},
    )
    await repo.merge_edge(
        org_id, edge_type="INSPIRED_BY", from_label="Strategy", from_key=strategy_id,
        to_label="ResearchNote", to_key=note_id,
    )


@pytest.mark.anyio
async def test_all_five_named_queries_never_leak_across_orgs(client, fake_graph_repo):
    reg_a = await register(client, org_name="Graph Org A", email="a@graph.io", slug="graph-org-a")
    reg_b = await register(client, org_name="Graph Org B", email="b@graph.io", slug="graph-org-b")
    token_a = reg_a.json()["access_token"]
    token_b = reg_b.json()["access_token"]

    me_a = (await client.get("/auth/me", headers=bearer(token_a))).json()
    me_b = (await client.get("/auth/me", headers=bearer(token_b))).json()
    org_a = me_a["user"]["organization_id"]
    org_b = me_b["user"]["organization_id"]
    assert org_a != org_b

    await _seed_org(fake_graph_repo, org_a, name_suffix="A")
    await _seed_org(fake_graph_repo, org_b, name_suffix="B")

    strategy_id = "11111111-1111-1111-1111-111111111111"

    # 1. failed-strategies-by-regime
    resp = await client.get(
        "/graph/query/failed-strategies-by-regime?regime=Bear&months=120", headers=bearer(token_a)
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Shared Name A"
    assert "B" not in items[0]["name"]

    # 2. lineage
    resp = await client.get(f"/graph/query/lineage/{strategy_id}", headers=bearer(token_a))
    assert resp.status_code == 200
    body = resp.json()
    assert body["target"]["name"] == "Shared Name A"
    assert all(a["name"] != "Parent B" for a in body["ancestors"])
    assert len(body["ancestors"]) == 1 and body["ancestors"][0]["name"] == "Parent A"

    # 3. robust-across-regimes
    resp = await client.get("/graph/query/robust-across-regimes?min_regimes=4", headers=bearer(token_a))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Shared Name A"

    # 4. recurring-failure-modes
    resp = await client.get(
        "/graph/query/recurring-failure-modes?min_occurrences=1", headers=bearer(token_a)
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["strategy_ids"] == [strategy_id]
    assert items[0]["strategy_count"] == 1  # NOT 2 — org B's identical strategy_id must not be counted

    # 5. hypotheses-leading-to-active
    resp = await client.get("/graph/query/hypotheses-leading-to-active", headers=bearer(token_a))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["content"] == "Note A"
    assert len(items[0]["active_strategies"]) == 1
    assert items[0]["active_strategies"][0]["name"] == "Shared Name A"

    # Sanity: org B sees ITS OWN "A"-suffixed-equivalent data, not org A's or a merge of both.
    resp_b = await client.get(
        "/graph/query/failed-strategies-by-regime?regime=Bear&months=120", headers=bearer(token_b)
    )
    items_b = resp_b.json()["items"]
    assert len(items_b) == 1
    assert items_b[0]["name"] == "Shared Name B"
