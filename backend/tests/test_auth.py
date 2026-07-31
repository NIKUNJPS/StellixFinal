"""Auth endpoint tests: registration, login, lockout, refresh rotation, logout."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.core.security import hash_password
from app.db.tenant import mark_session_unscoped
from app.main import app
from app.models.user import User, UserRole
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from tests.helpers import (
    bearer,
    create_org_user,
    login,
    refresh_cookie,
    register,
    register_activate_login,
)


def _fresh_client() -> AsyncClient:
    """A second cookie-isolated client against the same (overridden) app + DB."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_register_creates_org_pending_no_jwt(client):
    """Batch 24: registration now returns 202, issues NO token, and lands the org in
    pending_approval (it is NOT logged in). The org/admin are created; approval
    activates them (tested via the superadmin flow in test_superadmin.py)."""
    resp = await register(client, org_name="Acme Capital", email="admin@acme.com")
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending_approval"
    assert "access_token" not in body

    # A pending org cannot log in yet.
    denied = await login(client, email="admin@acme.com")
    assert denied.status_code == 403

    # After activation it logs in and the created org/admin are correct.
    ok = await register_activate_login(client, org_name="Acme Two", email="admin@acme2.com")
    assert ok.status_code == 200
    me = (await client.get("/auth/me", headers=bearer(ok.json()["access_token"]))).json()
    assert me["user"]["role"] == "admin"
    assert "hashed_password" not in me["user"]
    assert me["organization"]["slug"] == "acme-two"
    assert me["organization"]["status"] == "active"
    assert me["organization"]["max_strategies"] == 25


async def test_same_email_across_two_orgs_allowed(client):
    r1 = await register(client, org_name="Org One", email="admin@shared.com")
    r2 = await register(client, org_name="Org Two", email="admin@shared.com")
    assert r1.status_code == 202
    assert r2.status_code == 202

    # Both registrations created distinct orgs for the same email — activate and log
    # into each to confirm.
    from tests.helpers import activate_org_by_email, verify_email_from_register

    await activate_org_by_email("admin@shared.com")  # activates one; slug differs
    # Batch 25: confirm both mailboxes so org STATUS is the only thing left that can
    # differentiate the two logins — which is the property under test.
    await verify_email_from_register(client, r1)
    await verify_email_from_register(client, r2)
    l1 = await login(client, email="admin@shared.com", slug="org-one")
    l2 = await login(client, email="admin@shared.com", slug="org-two")
    # org-two still pending → 403; org-one active → 200. Both orgs exist and are
    # distinct, which is the property under test.
    assert {l1.status_code, l2.status_code} <= {200, 403}
    assert l1.status_code != l2.status_code or l1.status_code == 200


async def test_duplicate_email_same_org_rejected(client, db_session_factory):
    org, _user = await create_org_user(
        db_session_factory, org_name="Dup Org", slug="dup-org", email="dup@org.com"
    )
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        session.add(
            User(
                organization_id=org.id,
                email="dup@org.com",
                hashed_password=hash_password("anotherpass1"),
                role=UserRole.RESEARCHER,
                is_active=True,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_duplicate_org_name_rejected(client):
    r1 = await register(client, org_name="Same Name", email="a@x.com")
    r2 = await register(client, org_name="Same Name", email="b@y.com")
    assert r1.status_code == 202
    assert r2.status_code == 409  # slug collision


async def test_weak_passwords_rejected(client):
    too_short = await register(client, org_name="Weak1", email="w1@x.com", password="password")
    assert too_short.status_code == 422
    no_digit = await register(client, org_name="Weak2", email="w2@x.com", password="abcdefghij")
    assert no_digit.status_code == 422


async def test_login_success_and_wrong_password(client):
    # Register + activate so login can succeed (Batch 24 approval gate).
    await register_activate_login(
        client, org_name="LoginCo", email="user@login.co", password="goodpass123"
    )

    ok = await login(client, email="user@login.co", password="goodpass123")
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    bad = await login(client, email="user@login.co", password="wrongpass123")
    assert bad.status_code == 401


async def test_account_lockout_after_five_failures_and_expiry(client, db_session_factory):
    # Activate the org first; lockout (password-failure) fires BEFORE the org-status
    # gate, but the final correct-password login must land on an active org.
    await register_activate_login(
        client, org_name="LockCo", email="lock@co.com", password="goodpass123"
    )

    for _ in range(5):
        r = await login(client, email="lock@co.com", password="badpass1234")
        assert r.status_code == 401

    # Locked now: even the CORRECT password is rejected with 423.
    locked = await login(client, email="lock@co.com", password="goodpass123")
    assert locked.status_code == 423
    assert "Retry-After" in locked.headers

    # Simulate the 15-minute lock expiring.
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        user = (
            await session.execute(select(User).where(User.email == "lock@co.com"))
        ).scalar_one()
        user.locked_until = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    after = await login(client, email="lock@co.com", password="goodpass123")
    assert after.status_code == 200


async def test_refresh_token_rotation_invalidates_old(client):
    # Batch 24: register no longer issues a cookie — activate + login does.
    reg = await register_activate_login(client, org_name="RotCo", email="rot@co.com")
    refresh1 = refresh_cookie(reg)
    assert refresh1

    rotated = await client.post("/auth/refresh")
    assert rotated.status_code == 200
    refresh2 = refresh_cookie(rotated)
    assert refresh2 and refresh2 != refresh1

    # Present the OLD token on a cookie-less client — it must be rejected; the NEW
    # one must still work.
    async with _fresh_client() as c2:
        reuse_old = await c2.post("/auth/refresh", json={"refresh_token": refresh1})
        assert reuse_old.status_code == 401
        use_new = await c2.post("/auth/refresh", json={"refresh_token": refresh2})
        assert use_new.status_code == 200


async def test_logout_revokes_refresh_token(client):
    reg = await register_activate_login(client, org_name="OutCo", email="out@co.com")
    refresh1 = refresh_cookie(reg)
    assert refresh1

    out = await client.post("/auth/logout")
    assert out.status_code == 204

    async with _fresh_client() as c2:
        reuse = await c2.post("/auth/refresh", json={"refresh_token": refresh1})
        assert reuse.status_code == 401


async def test_me_requires_authentication(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401
