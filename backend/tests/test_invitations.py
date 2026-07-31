"""Team-invitation tests (Batch 25).

Like test_email_verification.py, no live SMTP call is possible here: settings carry
no SMTP credentials under test, so every send is a logged no-op and the invite link
comes back as ``dev_invite_link``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.db.tenant import mark_session_unscoped
from app.models.invitation import Invitation
from app.models.user import User, UserRole
from sqlalchemy import select

from tests.helpers import bearer, login, register_org

INVITEE_PASSWORD = "Inv1tee-Str0ng-Pass!"


def _token_from(link: str) -> str:
    return link.split("token=", 1)[1]


async def _invite(client, token: str, email: str, role: str = "researcher"):
    return await client.post(
        "/users/invitations",
        json={"email": email, "role": role},
        headers=bearer(token),
    )


# --------------------------------------------------------------------------- #
# Creating
# --------------------------------------------------------------------------- #
async def test_admin_can_invite_and_link_is_returned(client):
    admin_token, _ = await register_org(client, org_name="Invite Co", email="admin@invite.com")

    resp = await _invite(client, admin_token, "colleague@invite.com", role="risk_manager")
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "colleague@invite.com"
    assert body["role"] == "risk_manager"
    assert body["status"] == "pending"
    assert body["dev_invite_link"]


async def test_non_admin_cannot_invite(client, db_session_factory):
    from tests.helpers import create_org_user

    _org, _user = await create_org_user(
        db_session_factory,
        org_name="Researcher Co",
        slug="researcher-co",
        email="researcher@rco.com",
        role=UserRole.RESEARCHER,
    )
    token = (await login(client, email="researcher@rco.com")).json()["access_token"]

    resp = await _invite(client, token, "someone@rco.com")
    assert resp.status_code == 403


async def test_cannot_invite_existing_member(client):
    admin_token, _ = await register_org(client, org_name="Dup Co", email="admin@dup.com")
    resp = await _invite(client, admin_token, "admin@dup.com")
    assert resp.status_code == 409


async def test_reinvite_revokes_the_previous_pending_invitation(client, db_session_factory):
    """Re-inviting is "resend": at most one live invitation per address."""
    admin_token, org_id = await register_org(client, org_name="Resend Co", email="admin@rs.com")

    first = await _invite(client, admin_token, "colleague@rs.com")
    second = await _invite(client, admin_token, "colleague@rs.com")
    assert first.status_code == second.status_code == 201

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        rows = (
            await session.execute(
                select(Invitation).where(Invitation.email == "colleague@rs.com")
            )
        ).scalars().all()
        statuses = sorted(r.status.value for r in rows)
        assert statuses == ["pending", "revoked"]

    # The superseded token no longer works.
    stale = _token_from(first.json()["dev_invite_link"])
    used = await client.post(
        "/auth/accept-invitation",
        json={"token": stale, "password": INVITEE_PASSWORD},
    )
    assert used.status_code == 400


# --------------------------------------------------------------------------- #
# Accepting
# --------------------------------------------------------------------------- #
async def test_accept_creates_verified_user_in_the_inviting_org(client, db_session_factory):
    admin_token, org_id = await register_org(client, org_name="Join Co", email="admin@join.com")
    invite = await _invite(client, admin_token, "newbie@join.com", role="cio")
    token = _token_from(invite.json()["dev_invite_link"])

    accepted = await client.post(
        "/auth/accept-invitation",
        json={"token": token, "password": INVITEE_PASSWORD, "full_name": "New Bie"},
    )
    assert accepted.status_code == 201
    assert accepted.json()["email"] == "newbie@join.com"
    assert accepted.json()["organization_slug"] == "join-co"

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        user = (
            await session.execute(select(User).where(User.email == "newbie@join.com"))
        ).scalar_one()
        assert user.organization_id == org_id, "must land in the INVITING org"
        assert user.role is UserRole.CIO, "role comes from the invitation"
        assert user.full_name == "New Bie"
        # Opening a link sent only to that address is the proof of ownership.
        assert user.email_verified is True

    # And they can log in immediately — no separate verification step.
    ok = await login(client, email="newbie@join.com", password=INVITEE_PASSWORD)
    assert ok.status_code == 200


async def test_accepted_invitation_cannot_be_reused(client):
    admin_token, _ = await register_org(client, org_name="Once Co", email="admin@once.com")
    invite = await _invite(client, admin_token, "once@once.com")
    token = _token_from(invite.json()["dev_invite_link"])

    body = {"token": token, "password": INVITEE_PASSWORD}
    assert (await client.post("/auth/accept-invitation", json=body)).status_code == 201
    assert (await client.post("/auth/accept-invitation", json=body)).status_code == 400


async def test_revoked_invitation_cannot_be_accepted(client):
    admin_token, _ = await register_org(client, org_name="Revoke Co", email="admin@rev.com")
    invite = await _invite(client, admin_token, "gone@rev.com")
    invitation_id = invite.json()["id"]
    token = _token_from(invite.json()["dev_invite_link"])

    revoked = await client.delete(
        f"/users/invitations/{invitation_id}", headers=bearer(admin_token)
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"

    resp = await client.post(
        "/auth/accept-invitation", json={"token": token, "password": INVITEE_PASSWORD}
    )
    assert resp.status_code == 400


async def test_expired_invitation_cannot_be_accepted(client, db_session_factory):
    admin_token, _ = await register_org(client, org_name="Stale Co", email="admin@stale.com")
    invite = await _invite(client, admin_token, "late@stale.com")
    token = _token_from(invite.json()["dev_invite_link"])

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        row = (
            await session.execute(select(Invitation).where(Invitation.email == "late@stale.com"))
        ).scalar_one()
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    resp = await client.post(
        "/auth/accept-invitation", json={"token": token, "password": INVITEE_PASSWORD}
    )
    assert resp.status_code == 400


async def test_accept_rejects_unknown_token(client):
    resp = await client.post(
        "/auth/accept-invitation", json={"token": "nope", "password": INVITEE_PASSWORD}
    )
    assert resp.status_code == 400


async def test_accept_rejects_weak_password(client):
    admin_token, _ = await register_org(client, org_name="Weak Co", email="admin@weak.com")
    invite = await _invite(client, admin_token, "weak@weak.com")
    token = _token_from(invite.json()["dev_invite_link"])

    resp = await client.post(
        "/auth/accept-invitation", json={"token": token, "password": "short"}
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------- #
# Tenant isolation — the property that matters most here
# --------------------------------------------------------------------------- #
async def test_invitations_are_tenant_scoped(client):
    """Org A's admin can neither see nor revoke org B's invitation."""
    a_token, _ = await register_org(client, org_name="Alpha Cap", email="admin@alpha.com")
    b_token, _ = await register_org(client, org_name="Beta Cap", email="admin@beta.com")

    b_invite = await _invite(client, b_token, "target@beta.com")
    b_invitation_id = b_invite.json()["id"]

    # A's list contains only A's invitations.
    a_list = await client.get("/users/invitations", headers=bearer(a_token))
    assert a_list.status_code == 200
    assert all(i["email"] != "target@beta.com" for i in a_list.json()["items"])

    # A cannot revoke B's invitation — it is invisible, so 404 not 403.
    stolen = await client.delete(
        f"/users/invitations/{b_invitation_id}", headers=bearer(a_token)
    )
    assert stolen.status_code == 404

    # B's invitation is still usable, proving A's attempt changed nothing.
    token = _token_from(b_invite.json()["dev_invite_link"])
    accepted = await client.post(
        "/auth/accept-invitation", json={"token": token, "password": INVITEE_PASSWORD}
    )
    assert accepted.status_code == 201
    assert accepted.json()["organization_slug"] == "beta-cap"


async def test_invited_user_only_sees_their_own_org(client):
    """End-to-end: the seat created by an invitation is bound to the inviting org."""
    a_token, a_org = await register_org(client, org_name="Scope A", email="admin@scopea.com")
    await register_org(client, org_name="Scope B", email="admin@scopeb.com")

    invite = await _invite(client, a_token, "member@scopea.com")
    token = _token_from(invite.json()["dev_invite_link"])
    await client.post(
        "/auth/accept-invitation", json={"token": token, "password": INVITEE_PASSWORD}
    )

    member_token = (
        await login(client, email="member@scopea.com", password=INVITEE_PASSWORD)
    ).json()["access_token"]
    me = await client.get("/auth/me", headers=bearer(member_token))
    assert me.status_code == 200
    assert me.json()["organization"]["slug"] == "scope-a"


async def test_list_shows_lifecycle_states(client):
    admin_token, _ = await register_org(client, org_name="States Co", email="admin@states.com")
    accepted_invite = await _invite(client, admin_token, "yes@states.com")
    revoked_invite = await _invite(client, admin_token, "no@states.com")
    await _invite(client, admin_token, "waiting@states.com")

    await client.post(
        "/auth/accept-invitation",
        json={
            "token": _token_from(accepted_invite.json()["dev_invite_link"]),
            "password": INVITEE_PASSWORD,
        },
    )
    await client.delete(
        f"/users/invitations/{revoked_invite.json()['id']}", headers=bearer(admin_token)
    )

    items = (await client.get("/users/invitations", headers=bearer(admin_token))).json()["items"]
    by_email = {i["email"]: i["status"] for i in items}
    assert by_email["yes@states.com"] == "accepted"
    assert by_email["no@states.com"] == "revoked"
    assert by_email["waiting@states.com"] == "pending"
    # The listing must never expose a usable token.
    assert all("dev_invite_link" not in i or i["dev_invite_link"] is None for i in items)


async def test_invite_never_stores_raw_token(client, db_session_factory):
    admin_token, _ = await register_org(client, org_name="Hash Co", email="admin@hash.com")
    invite = await _invite(client, admin_token, "hashed@hash.com")
    raw = _token_from(invite.json()["dev_invite_link"])

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        row = (
            await session.execute(select(Invitation).where(Invitation.email == "hashed@hash.com"))
        ).scalar_one()
        assert row.token_hash != raw
        assert len(row.token_hash) == 64  # SHA-256 hex


@pytest.mark.parametrize("role", ["researcher", "risk_manager", "cio", "compliance_officer", "admin"])
async def test_every_rbac_role_is_invitable(client, role):
    # Underscores are illegal in a hostname, so build the domain from a safe slug.
    domain = f"{role.replace('_', '-')}.com"
    admin_token, _ = await register_org(
        client, org_name=f"Role {role}", email=f"admin@{domain}"
    )
    resp = await _invite(client, admin_token, f"invitee@{domain}", role=role)
    assert resp.status_code == 201
    assert resp.json()["role"] == role


async def test_invalid_role_is_rejected(client):
    admin_token, _ = await register_org(client, org_name="Bad Role", email="admin@badrole.com")
    resp = await _invite(client, admin_token, "x@badrole.com", role="superadmin")
    assert resp.status_code == 422
