"""MERGE idempotency: syncing the same strategy/failure/performance/note twice must
not create duplicate nodes (count before/after, assert unchanged)."""

from __future__ import annotations

import pytest

from tests.helpers import bearer
from tests.helpers import register_activate_login as register


@pytest.mark.anyio
async def test_resyncing_the_same_strategy_does_not_duplicate_the_node(client, fake_graph_repo):
    reg = await register(client, org_name="Idem Org", email="idem@graph.io", slug="idem-org")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]

    create = await client.post(
        "/strategies",
        json={"name": "Idempotent Strategy", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    strategy_id = create.json()["id"]

    count_after_create = await fake_graph_repo.count_nodes(org_id, node_type="Strategy")
    assert count_after_create == 1

    # Re-sync via an update (name change) — same strategy_id, should MERGE not duplicate.
    update = await client.put(
        f"/strategies/{strategy_id}", json={"name": "Idempotent Strategy Renamed"}, headers=bearer(token)
    )
    assert update.status_code == 200

    count_after_update = await fake_graph_repo.count_nodes(org_id, node_type="Strategy")
    assert count_after_update == 1  # unchanged — MERGE upserted, did not create a 2nd node

    node = await fake_graph_repo.get_node(org_id, node_type="Strategy", node_id=strategy_id)
    assert node["node"]["name"] == "Idempotent Strategy Renamed"


@pytest.mark.anyio
async def test_repository_merge_node_called_twice_directly_is_idempotent(fake_graph_repo):
    """Lower-level check directly against the repository, independent of the API."""
    org_id = "11111111-1111-1111-1111-111111111111"
    for _ in range(3):
        await fake_graph_repo.merge_node(
            org_id,
            label="Strategy",
            key_value="same-key",
            properties={"name": "X", "version": "v1.0", "status": "draft", "robustness_score": None},
        )
    assert await fake_graph_repo.count_nodes(org_id, node_type="Strategy") == 1


@pytest.mark.anyio
async def test_repository_merge_edge_called_twice_directly_is_idempotent(fake_graph_repo):
    org_id = "11111111-1111-1111-1111-111111111111"
    await fake_graph_repo.merge_node(org_id, label="Strategy", key_value="s1", properties={"name": "S1"})
    await fake_graph_repo.merge_node(org_id, label="Regime", key_value="Bull", properties={"regime_label": "Bull"})

    for _ in range(3):
        await fake_graph_repo.merge_edge(
            org_id, edge_type="VALID_IN", from_label="Strategy", from_key="s1",
            to_label="Regime", to_key="Bull",
        )
    node = await fake_graph_repo.get_node(org_id, node_type="Strategy", node_id="s1")
    valid_in_edges = [e for e in node["outgoing"] if e["edge_type"] == "VALID_IN"]
    assert len(valid_in_edges) == 1  # not 3
