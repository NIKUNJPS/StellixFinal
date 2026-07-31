"""Forgot/reset password (Batch 12): never reveals account existence, and the
reset token is single-use."""

from __future__ import annotations

from tests.helpers import login, register_org


async def test_forgot_password_returns_dev_link_for_a_real_account(client):
    email = "real@forgotco.com"
    await register_org(client, org_name="ForgotCo", email=email, password="goodpass123")

    resp = await client.post("/auth/forgot-password", json={"email": email})
    assert resp.status_code == 200
    body = resp.json()
    assert body["dev_reset_link"] is not None
    assert "token=" in body["dev_reset_link"]


async def test_forgot_password_does_not_reveal_unknown_email(client):
    resp = await client.post("/auth/forgot-password", json={"email": "nobody@nowhere.io"})
    assert resp.status_code == 200
    assert resp.json()["dev_reset_link"] is None
    # Same 200 + message shape either way — no observable difference.


async def test_reset_password_changes_password_and_is_one_time_use(client):
    email = "reset@resetco.com"
    await register_org(client, org_name="ResetCo", email=email, password="originalpass1")

    forgot = await client.post("/auth/forgot-password", json={"email": email})
    token = forgot.json()["dev_reset_link"].split("token=")[1]

    reset = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "brandnewpass1"}
    )
    assert reset.status_code == 204

    old_login = await login(client, email=email, password="originalpass1")
    assert old_login.status_code == 401

    new_login = await login(client, email=email, password="brandnewpass1")
    assert new_login.status_code == 200

    reuse = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "yetanotherpass1"}
    )
    assert reuse.status_code == 400


async def test_reset_password_rejects_unknown_token(client):
    resp = await client.post(
        "/auth/reset-password", json={"token": "not-a-real-token", "new_password": "somepassword1"}
    )
    assert resp.status_code == 400
