"""Research Notebook CRUD + autosave + graph sync (Batch 10, extending Batch 7)."""

from __future__ import annotations

from tests.helpers import bearer
from tests.helpers import register_activate_login as register


async def test_create_research_note_with_full_fields(client):
    reg = await register(client, org_name="Notebook Co", email="admin@notebook.co")
    token = reg.json()["access_token"]

    resp = await client.post(
        "/research-notes",
        json={
            "title": "RSI Hypothesis",
            "content": "Body text about RSI oversold reversals.",
            "hypothesis": "RSI < 30 predicts a bounce",
            "method": "Backtest partitioned by regime",
            "tags": ["rsi", "mean-reversion"],
            "status": "in_progress",
        },
        headers=bearer(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "RSI Hypothesis"
    assert body["tags"] == ["rsi", "mean-reversion"]
    assert body["status"] == "in_progress"
    assert body["related_strategy_ids"] == []
    assert body["created_at"] == body["updated_at"]


async def test_create_note_defaults_title_and_status(client):
    reg = await register(client, org_name="Notebook Defaults Co", email="admin@nbdefaults.co")
    token = reg.json()["access_token"]

    resp = await client.post(
        "/research-notes", json={"content": "Minimal note, only content set."}, headers=bearer(token)
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == ""
    assert body["status"] == "in_progress"
    assert body["tags"] == []


async def test_get_single_note(client):
    reg = await register(client, org_name="Notebook Get Co", email="admin@nbget.co")
    token = reg.json()["access_token"]
    created = (
        await client.post("/research-notes", json={"title": "T", "content": "C"}, headers=bearer(token))
    ).json()

    resp = await client.get(f"/research-notes/{created['id']}", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


async def test_get_missing_note_404(client):
    reg = await register(client, org_name="Notebook 404 Co", email="admin@nb404.co")
    token = reg.json()["access_token"]
    resp = await client.get(
        "/research-notes/00000000-0000-0000-0000-000000000000", headers=bearer(token)
    )
    assert resp.status_code == 404


async def test_put_full_update_replaces_fields(client):
    reg = await register(client, org_name="Notebook Put Co", email="admin@nbput.co")
    token = reg.json()["access_token"]
    created = (
        await client.post(
            "/research-notes",
            json={"title": "Original", "content": "C", "tags": ["a"]},
            headers=bearer(token),
        )
    ).json()

    resp = await client.put(
        f"/research-notes/{created['id']}",
        json={"status": "completed", "tags": ["b", "c"]},
        headers=bearer(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["tags"] == ["b", "c"]
    assert body["title"] == "Original"  # untouched field preserved
    # updated_at must not regress. We assert monotonicity (>=) rather than strict
    # inequality: production Postgres now() is microsecond-precision so an update
    # always advances it, but the SQLite test DB's CURRENT_TIMESTAMP is only
    # second-precision, so a sub-second create→update legitimately ties. The
    # status/tags assertions above already prove the row was updated.
    assert body["updated_at"] >= body["created_at"]


async def test_autosave_partial_update_only_touches_sent_fields(client):
    reg = await register(client, org_name="Notebook Autosave Co", email="admin@nbautosave.co")
    token = reg.json()["access_token"]
    created = (
        await client.post(
            "/research-notes",
            json={"title": "Keep Me", "content": "original content", "hypothesis": "keep this too"},
            headers=bearer(token),
        )
    ).json()

    resp = await client.patch(
        f"/research-notes/{created['id']}/autosave",
        json={"content": "autosaved content"},
        headers=bearer(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content"] == "autosaved content"
    assert body["title"] == "Keep Me"
    assert body["hypothesis"] == "keep this too"


async def test_list_notes_filters_by_status_and_tag(client):
    reg = await register(client, org_name="Notebook List Co", email="admin@nblist.co")
    token = reg.json()["access_token"]
    await client.post(
        "/research-notes",
        json={"title": "Abandoned one", "content": "x", "status": "abandoned", "tags": ["dead-end"]},
        headers=bearer(token),
    )
    await client.post(
        "/research-notes",
        json={"title": "Active one", "content": "y", "status": "in_progress", "tags": ["promising"]},
        headers=bearer(token),
    )

    status_resp = await client.get("/research-notes?status=abandoned", headers=bearer(token))
    assert status_resp.status_code == 200
    status_body = status_resp.json()
    assert status_body["total"] == 1
    assert status_body["items"][0]["title"] == "Abandoned one"

    tag_resp = await client.get("/research-notes?tag=promising", headers=bearer(token))
    assert tag_resp.status_code == 200
    tag_body = tag_resp.json()
    assert tag_body["total"] == 1
    assert tag_body["items"][0]["title"] == "Active one"


async def test_note_syncs_authored_by_and_inspired_by_edges(client, fake_graph_repo):
    reg = await register(client, org_name="Notebook Graph Co", email="admin@nbgraph.co")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]
    user_id = me["user"]["id"]

    strategy = (
        await client.post(
            "/strategies",
            json={"name": "Related Strategy", "entry_rules": {}, "exit_rules": {}},
            headers=bearer(token),
        )
    ).json()

    note = (
        await client.post(
            "/research-notes",
            json={
                "title": "Linked Note",
                "content": "About the related strategy",
                "related_strategy_ids": [strategy["id"]],
            },
            headers=bearer(token),
        )
    ).json()

    node = await fake_graph_repo.get_node(org_id, node_type="ResearchNote", node_id=note["id"])
    assert node is not None
    assert node["node"]["title"] == "Linked Note"
    assert node["node"]["status"] == "in_progress"

    authored_by = [e for e in node["outgoing"] if e["edge_type"] == "AUTHORED_BY"]
    assert len(authored_by) == 1
    assert authored_by[0]["other"]["user_id"] == user_id

    inspired_by = [e for e in node["outgoing"] if e["edge_type"] == "INSPIRED_BY"]
    assert len(inspired_by) == 1
    assert inspired_by[0]["other"]["strategy_id"] == strategy["id"]


async def test_updating_related_strategy_ids_resyncs_inspired_by_edge(client, fake_graph_repo):
    reg = await register(client, org_name="Notebook Graph Update Co", email="admin@nbgraphupd.co")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    org_id = me["user"]["organization_id"]

    strategy = (
        await client.post(
            "/strategies", json={"name": "S", "entry_rules": {}, "exit_rules": {}}, headers=bearer(token)
        )
    ).json()
    note = (
        await client.post("/research-notes", json={"title": "N", "content": "c"}, headers=bearer(token))
    ).json()

    resp = await client.put(
        f"/research-notes/{note['id']}",
        json={"related_strategy_ids": [strategy["id"]]},
        headers=bearer(token),
    )
    assert resp.status_code == 200

    node = await fake_graph_repo.get_node(org_id, node_type="ResearchNote", node_id=note["id"])
    inspired_by = [e for e in node["outgoing"] if e["edge_type"] == "INSPIRED_BY"]
    assert len(inspired_by) == 1
    assert inspired_by[0]["other"]["strategy_id"] == strategy["id"]
