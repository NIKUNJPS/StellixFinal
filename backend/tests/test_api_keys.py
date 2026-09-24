"""API key auth (Batch 12): create/list/revoke, and — the batch's own explicit
DoD wording — "a request using a valid API key (instead of a JWT) successfully
authenticates and is correctly tenant-scoped; an expired/revoked key is
rejected"."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db.tenant import bind_organization
from app.models.api_key import ApiKey
from sqlalchemy import select

from tests.helpers import bearer, register_org


async def test_create_list_revoke_api_key(client):
    token, _org = await register_org(client, org_name="ApiKeyCrudCo", email="a@apikeycrudco.com")

    created = await client.post(
        "/api-keys", json={"name": "CI Key", "scopes": ["strategies:read"]}, headers=bearer(token)
    )
    assert created.status_code == 201
    body = created.json()
    assert body["raw_key"].startswith("slx_")
    key_id = body["id"]

    listing = await client.get("/api-keys", headers=bearer(token))
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["key_prefix"] == body["key_prefix"]
    # The raw key is never returned again — only shown once, at creation.
    assert "raw_key" not in listing.json()["items"][0]

    revoked = await client.post(f"/api-keys/{key_id}/revoke", headers=bearer(token))
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None


async def test_valid_api_key_authenticates_and_is_tenant_scoped(client, db_session_factory):
    token_a, org_a = await register_org(client, org_name="ApiKeyOrgA", email="a@apikeyorga.com")
    _token_b, org_b = await register_org(client, org_name="ApiKeyOrgB", email="b@apikeyorgb.com")

    await client.post(
        "/strategies",
        json={"name": "Org B Strategy"},
        headers=bearer(_token_b),
    )

    created = await client.post(
        "/api-keys", json={"name": "Read Key", "scopes": ["strategies:read"]}, headers=bearer(token_a)
    )
    raw_key = created.json()["raw_key"]

    resp = await client.get("/strategies", headers=bearer(raw_key))
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()["items"]]
    assert "Org B Strategy" not in names  # tenant-scoped: org A's key can't see org B's data


async def test_api_key_without_required_scope_is_rejected(client):
    token, _org = await register_org(client, org_name="ScopeCo", email="s@scopeco.com")
    created = await client.post(
        "/api-keys", json={"name": "Read Only", "scopes": ["strategies:read"]}, headers=bearer(token)
    )
    raw_key = created.json()["raw_key"]

    resp = await client.post("/strategies", json={"name": "Should Fail", "symbol": "SPY"}, headers=bearer(raw_key))
    assert resp.status_code == 403
    assert "strategies:write" in resp.json()["detail"]


async def test_jwt_bypasses_scope_checks(client):
    """A human (JWT) caller is governed by RBAC, not API-key scopes — creating
    a strategy via a normal login session must not require any 'scope'."""
    token, _org = await register_org(client, org_name="JwtBypassCo", email="j@jwtbypassco.com")
    resp = await client.post("/strategies", json={"name": "Human Strategy", "symbol": "SPY"}, headers=bearer(token))
    assert resp.status_code == 201


async def test_revoked_api_key_is_rejected(client):
    token, _org = await register_org(client, org_name="RevokeApiCo", email="r@revokeapico.com")
    created = await client.post(
        "/api-keys", json={"name": "To Revoke", "scopes": ["strategies:read"]}, headers=bearer(token)
    )
    raw_key = created.json()["raw_key"]
    key_id = created.json()["id"]

    assert (await client.get("/strategies", headers=bearer(raw_key))).status_code == 200

    await client.post(f"/api-keys/{key_id}/revoke", headers=bearer(token))

    resp = await client.get("/strategies", headers=bearer(raw_key))
    assert resp.status_code == 401
    assert "revoked" in resp.json()["detail"].lower() or "invalid" in resp.json()["detail"].lower()


async def test_expired_api_key_is_rejected(client, db_session_factory):
    token, org = await register_org(client, org_name="ExpireApiCo", email="e@expireapico.com")
    created = await client.post(
        "/api-keys",
        json={"name": "Expires Soon", "scopes": ["strategies:read"], "expires_in_days": 30},
        headers=bearer(token),
    )
    raw_key = created.json()["raw_key"]
    key_id = created.json()["id"]

    # Force it into the past directly (the API only accepts future offsets).
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        import uuid as uuid_mod

        record = (
            await session.execute(select(ApiKey).where(ApiKey.id == uuid_mod.UUID(key_id)))
        ).scalar_one()
        record.expires_at = datetime.now(UTC) - timedelta(days=1)
        await session.commit()

    resp = await client.get("/strategies", headers=bearer(raw_key))
    assert resp.status_code == 401


async def test_invalid_api_key_is_rejected(client):
    resp = await client.get("/strategies", headers=bearer("slx_totallymadeupvalue12345"))
    assert resp.status_code == 401


async def test_unknown_scope_rejected_at_creation(client):
    token, _org = await register_org(client, org_name="BadScopeCo", email="bs@badscopeco.com")
    resp = await client.post(
        "/api-keys", json={"name": "Bad Scope", "scopes": ["admin:everything"]}, headers=bearer(token)
    )
    assert resp.status_code == 422
