"""RBAC and tenant-isolation tests.

The tenant-isolation attack test is the single most important test in Batch 1: an
admin of organization A must NOT be able to fetch a user belonging to organization B
through an id-taking endpoint.
"""

from __future__ import annotations

from app.main import app
from app.models.user import UserRole
from httpx import ASGITransport, AsyncClient

from tests.helpers import bearer, create_org_user, login
from tests.helpers import register_activate_login as register


async def test_researcher_gets_403_on_admin_route(client, db_session_factory):
    _org, researcher = await create_org_user(
        db_session_factory,
        org_name="RBAC Co",
        slug="rbac-co",
        email="researcher@rbac.co",
        role=UserRole.RESEARCHER,
    )
    lr = await login(client, email="researcher@rbac.co")
    assert lr.status_code == 200
    token = lr.json()["access_token"]

    # /users/{id} is admin-only.
    resp = await client.get(f"/users/{researcher.id}", headers=bearer(token))
    assert resp.status_code == 403


async def test_admin_can_fetch_user_in_own_org(client):
    reg = await register(client, org_name="AdminCo", email="admin@adminco.com")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    uid = me["user"]["id"]

    resp = await client.get(f"/users/{uid}", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@adminco.com"


async def test_tenant_isolation_attack(client):
    """Org-A admin must not be able to read Org-B's user by id."""
    reg_a = await register(client, org_name="Alpha LLC", email="admin@alpha.com")
    token_a = reg_a.json()["access_token"]

    # Org B is created on a separate, cookie-isolated client (same app + DB).
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c_b:
        reg_b = await register(c_b, org_name="Bravo LLC", email="admin@bravo.com")
        token_b = reg_b.json()["access_token"]
        me_b = (await c_b.get("/auth/me", headers=bearer(token_b))).json()
        victim_id = me_b["user"]["id"]

    # The attack: Org-A admin (passes the admin RBAC gate) requests Org-B's user id.
    resp = await client.get(f"/users/{victim_id}", headers=bearer(token_a))
    assert resp.status_code == 404  # NOT 200 — existence in another tenant is invisible
    assert "admin@bravo.com" not in resp.text
