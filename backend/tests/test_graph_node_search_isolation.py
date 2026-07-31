"""Cross-org leakage check for the generic node-detail/search endpoints
(GET /graph/node/{type}/{id}, GET /graph/search) — distinct from
test_graph_isolation.py, which covers the 5 named analytical queries. Two orgs are
built with overlapping-looking data (same node key values, similar searchable text)
so isolation can only pass if it comes from the (organization_id, label, key)
composite identity, not from incidental data differences."""

from __future__ import annotations

import pytest

from tests.helpers import bearer
from tests.helpers import register_activate_login as register

SHARED_STRATEGY_ID = "55555555-5555-5555-5555-555555555555"


async def _seed(repo, org_id: str, *, marker: str) -> None:
    await repo.merge_node(
        org_id, label="Strategy", key_value=SHARED_STRATEGY_ID,
        properties={"name": f"Momentum Breakout {marker}", "version": "v1.0", "status": "active", "robustness_score": 0.8},
    )
    await repo.merge_node(
        org_id, label="ResearchNote", key_value=f"note-{marker}",
        properties={"content": f"Momentum hypothesis {marker}", "hypothesis": "trend persists", "created_at": "2020-01-01T00:00:00"},
    )


@pytest.mark.anyio
async def test_get_node_never_returns_another_orgs_node_for_the_same_id(client, fake_graph_repo):
    reg_a = await register(client, org_name="Node Org A", email="nodea@graph.io", slug="node-org-a")
    reg_b = await register(client, org_name="Node Org B", email="nodeb@graph.io", slug="node-org-b")
    token_a = reg_a.json()["access_token"]
    token_b = reg_b.json()["access_token"]

    me_a = (await client.get("/auth/me", headers=bearer(token_a))).json()
    me_b = (await client.get("/auth/me", headers=bearer(token_b))).json()
    org_a, org_b = me_a["user"]["organization_id"], me_b["user"]["organization_id"]

    await _seed(fake_graph_repo, org_a, marker="A")
    await _seed(fake_graph_repo, org_b, marker="B")

    resp_a = await client.get(f"/graph/node/Strategy/{SHARED_STRATEGY_ID}", headers=bearer(token_a))
    assert resp_a.status_code == 200
    assert resp_a.json()["node"]["name"] == "Momentum Breakout A"

    resp_b = await client.get(f"/graph/node/Strategy/{SHARED_STRATEGY_ID}", headers=bearer(token_b))
    assert resp_b.status_code == 200
    assert resp_b.json()["node"]["name"] == "Momentum Breakout B"
    assert resp_b.json()["node"]["name"] != resp_a.json()["node"]["name"]


@pytest.mark.anyio
async def test_get_node_404s_when_id_only_exists_in_another_org(client, fake_graph_repo):
    reg_a = await register(client, org_name="Node Org C", email="nodec@graph.io", slug="node-org-c")
    reg_b = await register(client, org_name="Node Org D", email="noded@graph.io", slug="node-org-d")
    token_a = reg_a.json()["access_token"]
    token_b = reg_b.json()["access_token"]
    me_b = (await client.get("/auth/me", headers=bearer(token_b))).json()
    org_b = me_b["user"]["organization_id"]

    # Only org B has this node.
    await fake_graph_repo.merge_node(
        org_b, label="Strategy", key_value="only-in-b",
        properties={"name": "Org B Only", "version": "v1.0", "status": "active", "robustness_score": 0.5},
    )

    resp = await client.get("/graph/node/Strategy/only-in-b", headers=bearer(token_a))
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_search_never_returns_another_orgs_matches(client, fake_graph_repo):
    reg_a = await register(client, org_name="Search Org A", email="searcha@graph.io", slug="search-org-a")
    reg_b = await register(client, org_name="Search Org B", email="searchb@graph.io", slug="search-org-b")
    token_a = reg_a.json()["access_token"]
    token_b = reg_b.json()["access_token"]
    me_a = (await client.get("/auth/me", headers=bearer(token_a))).json()
    me_b = (await client.get("/auth/me", headers=bearer(token_b))).json()
    org_a, org_b = me_a["user"]["organization_id"], me_b["user"]["organization_id"]

    await _seed(fake_graph_repo, org_a, marker="A")
    await _seed(fake_graph_repo, org_b, marker="B")

    resp = await client.get("/graph/search?q=Momentum", headers=bearer(token_a))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all("Breakout B" not in item["properties"].get("name", "") for item in items)
    assert all("hypothesis B" not in item["properties"].get("content", "") for item in items)
    # Org A's own matching data IS present.
    names = [item["properties"].get("name") for item in items if item["node_type"] == "Strategy"]
    assert "Momentum Breakout A" in names
