"""Full-text search endpoint plumbing (Batch 10) — hermetic. Runs against SQLite's
ILIKE-substring fallback (no tsvector there), so this exercises pagination/filter
wiring, not real relevance ranking — see test_research_note_search_integration.py
for genuine websearch_to_tsquery/ts_rank behavior against real Postgres."""

from __future__ import annotations

from tests.helpers import bearer
from tests.helpers import register_activate_login as register


async def _create(client, token, *, title, content, hypothesis=None):
    payload = {"title": title, "content": content}
    if hypothesis is not None:
        payload["hypothesis"] = hypothesis
    resp = await client.post("/research-notes", json=payload, headers=bearer(token))
    assert resp.status_code == 201
    return resp.json()


async def test_search_returns_relevant_notes_and_excludes_irrelevant_ones(client):
    reg = await register(client, org_name="Search Co", email="admin@search.co")
    token = reg.json()["access_token"]

    await _create(
        client, token, title="RSI Mean Reversion Hypothesis",
        content="Investigating whether RSI oversold signals produce reliable entries.",
        hypothesis="RSI below 30 predicts a bounce",
    )
    await _create(
        client, token, title="GARCH Volatility Clustering Review",
        content="Reviewing whether GARCH conditional volatility clusters ahead of Crisis regimes.",
    )
    await _create(
        client, token, title="Dead end on moving average crossovers",
        content="Simple SMA crossover entries showed no edge after transaction costs.",
    )

    resp = await client.get("/research-notes?q=RSI", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "RSI Mean Reversion Hypothesis"

    resp2 = await client.get("/research-notes?q=GARCH", headers=bearer(token))
    body2 = resp2.json()
    assert body2["total"] == 1
    assert body2["items"][0]["title"] == "GARCH Volatility Clustering Review"

    resp3 = await client.get("/research-notes?q=nonexistentxyzterm", headers=bearer(token))
    assert resp3.json()["total"] == 0


async def test_search_combines_with_status_filter(client):
    reg = await register(client, org_name="Search Combo Co", email="admin@searchcombo.co")
    token = reg.json()["access_token"]

    note = await _create(client, token, title="Momentum idea", content="Momentum breakout entries")
    await client.put(f"/research-notes/{note['id']}", json={"status": "abandoned"}, headers=bearer(token))
    await _create(client, token, title="Another momentum idea", content="Momentum pullback entries")

    resp = await client.get("/research-notes?q=momentum&status=abandoned", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Momentum idea"
