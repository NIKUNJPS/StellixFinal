"""Strategy CRUD, versioning, and tenant isolation."""

from __future__ import annotations

from tests.helpers import bearer, register_org

_VALID_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_VALID_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


async def _create(client, token, name="Mean Reversion"):
    return await client.post(
        "/strategies",
        json={
            "name": name,
            "description": "buy oversold",
            "parameters": {"rsi_period": 14},
            "entry_rules": _VALID_ENTRY,
            "exit_rules": _VALID_EXIT,
            "risk_constraints": _RISK,
        },
        headers=bearer(token),
    )


async def test_create_starts_in_draft_with_v1_0(client):
    token, _org = await register_org(client, org_name="Create Co", email="c@create.io")
    resp = await _create(client, token)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["version"] == "v1.0"
    assert body["creator"] == "human"
    assert body["created_by_user_id"] is not None

    detail = (await client.get(f"/strategies/{body['id']}", headers=bearer(token))).json()
    assert len(detail["versions"]) == 1
    assert detail["versions"][0]["version_number"] == "v1.0"


async def test_update_bumps_version_and_snapshots(client):
    token, _org = await register_org(client, org_name="Ver Co", email="v@ver.io")
    sid = (await _create(client, token)).json()["id"]

    # Change entry rules → new version v1.1.
    new_entry = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 25}]}
    upd = await client.put(
        f"/strategies/{sid}",
        json={"entry_rules": new_entry, "change_reason": "tighter entry"},
        headers=bearer(token),
    )
    assert upd.status_code == 200
    assert upd.json()["version"] == "v1.1"

    versions = (await client.get(f"/strategies/{sid}/versions", headers=bearer(token))).json()
    assert [v["version_number"] for v in versions] == ["v1.0", "v1.1"]
    assert "entry_rules" in versions[1]["changed_keys"]


async def test_tenant_isolation_on_strategies(client):
    token_a, _org_a = await register_org(client, org_name="Iso A", email="a@iso.io")
    sid_a = (await _create(client, token_a, name="A-strat")).json()["id"]

    from app.main import app
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c_b:
        token_b, _org_b = await register_org(c_b, org_name="Iso B", email="b@iso.io")
        # Org B cannot fetch org A's strategy by id.
        got = await c_b.get(f"/strategies/{sid_a}", headers=bearer(token_b))
        assert got.status_code == 404
        # Org B's list does not include A's strategy.
        listing = (await c_b.get("/strategies", headers=bearer(token_b))).json()
        assert all(item["id"] != sid_a for item in listing["items"])
