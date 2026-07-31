"""Page 22 Settings: password change (current-password confirmation) and
active-session list/revoke."""

from __future__ import annotations

from tests.helpers import bearer, login, register_org


async def test_change_password_requires_correct_current_password(client):
    email = "u@changepwco.com"
    token, _org = await register_org(client, org_name="ChangePwCo", email=email, password="originalpass1")

    wrong = await client.post(
        "/users/me/change-password",
        json={"current_password": "wrongpass123", "new_password": "newpassword1"},
        headers=bearer(token),
    )
    assert wrong.status_code == 401

    right = await client.post(
        "/users/me/change-password",
        json={"current_password": "originalpass1", "new_password": "newpassword1"},
        headers=bearer(token),
    )
    assert right.status_code == 204

    assert (await login(client, email=email, password="originalpass1")).status_code == 401
    assert (await login(client, email=email, password="newpassword1")).status_code == 200


async def test_list_and_revoke_sessions(client):
    token, _org = await register_org(client, org_name="SessionsCo", email="s@sessionsco.com")

    listing = await client.get("/users/me/sessions", headers=bearer(token))
    assert listing.status_code == 200
    assert listing.json()["total"] == 1  # the session created at registration
    session_id = listing.json()["items"][0]["id"]
    assert listing.json()["items"][0]["revoked_at"] is None

    revoke = await client.post(f"/users/me/sessions/{session_id}/revoke", headers=bearer(token))
    assert revoke.status_code == 200
    assert revoke.json()["revoked_at"] is not None


async def test_cannot_revoke_another_users_session(client, db_session_factory):
    token_a, _org_a = await register_org(client, org_name="SessOrgA", email="a@sessorga.com")
    _token_b, _org_b = await register_org(client, org_name="SessOrgB", email="b@sessorgb.com")

    my_sessions = await client.get("/users/me/sessions", headers=bearer(token_a))
    my_session_id = my_sessions.json()["items"][0]["id"]

    # Org B's token attempting to revoke org A's session id must 404 (not found
    # in org B's own scope), never succeed cross-tenant.
    resp = await client.post(f"/users/me/sessions/{my_session_id}/revoke", headers=bearer(_token_b))
    assert resp.status_code == 404
