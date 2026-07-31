"""Sync-on-write correctness: creating a Strategy in Postgres results in a matching
Neo4j node within the same request (real-time dual-write, not a batch ETL job)."""

from __future__ import annotations

import pytest

from tests.helpers import bearer
from tests.helpers import register_activate_login as register


@pytest.mark.anyio
async def test_creating_a_strategy_syncs_a_matching_graph_node_same_request(client, fake_graph_repo):
    reg = await register(client, org_name="Sync Org", email="sync@graph.io", slug="sync-org")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]

    resp = await client.post(
        "/strategies",
        json={"name": "SMA Crossover", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    assert resp.status_code == 201
    strategy_id = resp.json()["id"]

    # No polling, no background job — the node must already exist right now.
    node = await fake_graph_repo.get_node(org_id, node_type="Strategy", node_id=strategy_id)
    assert node is not None
    assert node["node"]["name"] == "SMA Crossover"
    assert node["node"]["status"] == "draft"
    assert node["node"]["version"] == "v1.0"


@pytest.mark.anyio
async def test_strategy_status_change_resyncs_the_node(client, fake_graph_repo):
    reg = await register(client, org_name="Sync Org 2", email="sync2@graph.io", slug="sync-org-2")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]

    create = await client.post(
        "/strategies",
        json={
            "name": "Trend Follower",
            "entry_rules": {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]},
            "exit_rules": {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]},
            "risk_constraints": {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5},
        },
        headers=bearer(token),
    )
    strategy_id = create.json()["id"]

    submit = await client.post(f"/strategies/{strategy_id}/submit", headers=bearer(token))
    assert submit.status_code == 200

    node = await fake_graph_repo.get_node(org_id, node_type="Strategy", node_id=strategy_id)
    assert node["node"]["status"] == "candidate"


@pytest.mark.anyio
async def test_research_note_syncs_with_author_and_authored_by_edge(client, fake_graph_repo):
    reg = await register(client, org_name="Note Org", email="note@graph.io", slug="note-org")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]
    user_id = me["user"]["id"]

    resp = await client.post(
        "/research-notes",
        json={"content": "SMA crossovers lag momentum", "hypothesis": "Late entries underperform"},
        headers=bearer(token),
    )
    assert resp.status_code == 201
    note_id = resp.json()["id"]

    node = await fake_graph_repo.get_node(org_id, node_type="ResearchNote", node_id=note_id)
    assert node is not None
    assert node["node"]["hypothesis"] == "Late entries underperform"
    authored_by = [e for e in node["outgoing"] if e["edge_type"] == "AUTHORED_BY"]
    assert len(authored_by) == 1
    assert authored_by[0]["other"]["user_id"] == user_id


@pytest.mark.anyio
async def test_human_created_strategy_syncs_authored_by_researcher_edge(client, fake_graph_repo):
    """The 'researcher leaves, the strategy stays traceable to them' guarantee:
    a human-created Strategy must carry an AUTHORED_BY edge to a Researcher node
    that preserves the author's identity, independent of their user account."""
    reg = await register(client, org_name="Authorship Org", email="lead@authors.io", slug="authorship-org")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]
    author_id = me["user"]["id"]

    resp = await client.post(
        "/strategies",
        json={"name": "Authored Momentum", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    assert resp.status_code == 201
    strategy_id = resp.json()["id"]

    node = await fake_graph_repo.get_node(org_id, node_type="Strategy", node_id=strategy_id)
    authored = [e for e in node["outgoing"] if e["edge_type"] == "AUTHORED_BY"]
    assert len(authored) == 1, "human-created strategy must have exactly one AUTHORED_BY edge"
    assert authored[0]["other_labels"] == ["Researcher"]

    # The Researcher node carries the human's identity — this is what survives when
    # the person leaves and the strategy remains.
    researcher = await fake_graph_repo.get_node(org_id, node_type="Researcher", node_id=author_id)
    assert researcher is not None
    incoming_authored = [e for e in researcher["incoming"] if e["edge_type"] == "AUTHORED_BY"]
    assert any(e["other"].get("strategy_id") == strategy_id for e in incoming_authored)
