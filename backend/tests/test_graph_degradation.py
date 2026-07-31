"""Graceful degradation: a Neo4j-unreachable error during sync must not crash the
API — Postgres-side behavior never depends on Neo4j being up."""

from __future__ import annotations

import pytest
from app.graph import sync_service
from neo4j.exceptions import ServiceUnavailable

from tests.helpers import bearer
from tests.helpers import register_activate_login as register


class _AlwaysDownRepository:
    """Every method raises, simulating an unreachable Neo4j instance."""

    def __getattr__(self, name: str):
        async def _raise(*args, **kwargs):
            raise ServiceUnavailable("Neo4j is down (test double)")

        return _raise


@pytest.fixture
def down_graph_repo():
    sync_service.set_repository_override(_AlwaysDownRepository())
    try:
        yield
    finally:
        sync_service.set_repository_override(None)


@pytest.mark.anyio
async def test_creating_a_strategy_succeeds_even_when_neo4j_is_unreachable(client, down_graph_repo):
    reg = await register(client, org_name="Down Org", email="down@graph.io", slug="down-org")
    token = reg.json()["access_token"]

    resp = await client.post(
        "/strategies",
        json={"name": "Resilient Strategy", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    # The Postgres-side create must succeed regardless of Neo4j being unreachable.
    assert resp.status_code == 201
    assert resp.json()["name"] == "Resilient Strategy"


@pytest.mark.anyio
async def test_query_endpoint_returns_503_not_a_silent_empty_list(client, down_graph_repo):
    reg = await register(client, org_name="Down Org 2", email="down2@graph.io", slug="down-org-2")
    token = reg.json()["access_token"]

    resp = await client.get(
        "/graph/query/robust-across-regimes", headers=bearer(token)
    )
    # A read query must surface unavailability honestly, not return `{"items": []}`
    # (which would be indistinguishable from "the graph is genuinely empty").
    assert resp.status_code == 503
