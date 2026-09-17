"""Test helpers for the auth/RBAC/isolation suites."""

from __future__ import annotations

import uuid

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionFactory
from app.db.tenant import mark_session_unscoped
from app.models.organization import Organization, OrganizationStatus, OrganizationTier
from app.models.user import User, UserRole
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

DEFAULT_PASSWORD = "supersecret1"  # ≥10 chars, has a digit, not in denylist

# The conftest `client` fixture stamps the per-test SQLite sessionmaker here so
# helpers that need a raw DB session (e.g. activating a registered org) write to the
# SAME database the API just wrote to, not the app's global Postgres SessionFactory.
_TEST_SESSION_MAKER: async_sessionmaker | None = None


def _session():
    """Open a session against the test DB when running under the client fixture,
    else the app's real SessionFactory."""
    return (_TEST_SESSION_MAKER or SessionFactory)()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def refresh_cookie(response: Response) -> str | None:
    return response.cookies.get(settings.REFRESH_COOKIE_NAME)


async def register(
    client: AsyncClient,
    *,
    org_name: str,
    email: str,
    password: str = DEFAULT_PASSWORD,
    slug: str | None = None,
    full_name: str | None = None,
) -> Response:
    body: dict[str, object] = {
        "organization_name": org_name,
        "email": email,
        "password": password,
    }
    if slug is not None:
        body["organization_slug"] = slug
    if full_name is not None:
        body["full_name"] = full_name
    return await client.post("/auth/register", json=body)


async def login(
    client: AsyncClient,
    *,
    email: str,
    password: str = DEFAULT_PASSWORD,
    slug: str | None = None,
) -> Response:
    body: dict[str, object] = {"email": email, "password": password}
    if slug is not None:
        body["organization_slug"] = slug
    return await client.post("/auth/login", json=body)


async def register_org(
    client: AsyncClient, *, org_name: str, email: str, password: str = DEFAULT_PASSWORD
) -> tuple[str, uuid.UUID]:
    """Register an org via the API, ACTIVATE it, then log in — returning
    (access_token, organization_id).

    Batch 24: self-registration now lands in PENDING_APPROVAL and issues no token
    (register returns 202). Tests that use this helper want a working authenticated
    session, so the "org is approved/active" precondition is made explicit here —
    activated directly in the DB (the founder-approval step, without the superadmin
    round-trip) — rather than silently. Same lesson as the Batch 18 secret-leak fix:
    make the precondition explicit, don't weaken the check.
    """
    import uuid

    reg = await register(client, org_name=org_name, email=email, password=password)
    assert reg.status_code == 202, f"expected 202 pending, got {reg.status_code}: {reg.text}"

    email_normalized = email.strip().lower()
    async with _session() as session:
        mark_session_unscoped(session.sync_session)
        user = (
            await session.execute(select(User).where(User.email == email_normalized))
        ).scalars().first()
        assert user is not None, f"registered user {email_normalized} not found"
        org = await session.get(Organization, user.organization_id)
        org.status = OrganizationStatus.ACTIVE
        org.is_active = True
        await session.commit()
        org_id = org.id

    # Batch 25: login also requires a confirmed mailbox. Redeem the real link, for
    # the same reason the org is really activated above — make the precondition
    # explicit by satisfying it honestly, don't weaken the check.
    await verify_email_from_register(client, reg)

    login_resp = await login(client, email=email, password=password)
    assert login_resp.status_code == 200, f"login failed: {login_resp.text}"
    token = login_resp.json()["access_token"]
    return token, uuid.UUID(str(org_id))


async def activate_org_by_email(email: str) -> uuid.UUID:
    """Flip the org owning ``email`` to ACTIVE (the founder-approval step, done
    directly in the DB for tests). Returns the org id. Batch 24."""
    import uuid

    async with _session() as session:
        mark_session_unscoped(session.sync_session)
        user = (
            await session.execute(select(User).where(User.email == email.strip().lower()))
        ).scalars().first()
        assert user is not None, f"user {email} not found"
        org = await session.get(Organization, user.organization_id)
        org.status = OrganizationStatus.ACTIVE
        org.is_active = True
        await session.commit()
        return uuid.UUID(str(org.id))


async def register_activate_login(
    client: AsyncClient,
    *,
    org_name: str,
    email: str,
    password: str = DEFAULT_PASSWORD,
    slug: str | None = None,
    full_name: str | None = None,
) -> Response:
    """register (202, pending) → activate → login. Returns the LOGIN response, so
    callers that need the access token AND the refresh cookie (rotation/logout tests)
    get both. Signature is a drop-in for ``register`` (accepts slug/full_name) so
    token-only test files can alias it. Batch 24."""
    reg = await register(
        client, org_name=org_name, email=email, password=password, slug=slug, full_name=full_name
    )
    assert reg.status_code == 202, f"expected 202, got {reg.status_code}: {reg.text}"
    await activate_org_by_email(email)
    # Batch 25: login now also requires a confirmed mailbox. Redeem the real link
    # rather than flipping the column, so every caller exercises the actual flow.
    await verify_email_from_register(client, reg)
    return await login(client, email=email, password=password, slug=slug)


async def verify_email_from_register(client: AsyncClient, register_response: Response) -> Response:
    """Redeem the verification link returned by POST /auth/register.

    Registration surfaces ``dev_verification_link`` only when SMTP is unconfigured
    and ENVIRONMENT != production — which is exactly the test environment, so no
    mail server is ever contacted. Batch 25.
    """
    link = register_response.json().get("dev_verification_link")
    assert link, f"no dev_verification_link in register response: {register_response.text}"
    token = link.split("token=", 1)[1]
    resp = await client.post("/auth/verify-email", json={"token": token})
    assert resp.status_code == 200, f"verify-email failed: {resp.text}"
    return resp


async def create_superadmin(
    client: AsyncClient,
    maker: async_sessionmaker,
    *,
    email: str = "founder@stellixlabs.com",
    password: str = DEFAULT_PASSWORD,
    slug: str = "stellix-internal",
) -> tuple[str, uuid.UUID]:
    """Seed an internal ACTIVE org + a is_super_admin user, then log in. Returns
    (access_token, user_id). Batch 24."""
    import uuid

    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(
            name="Stellix Labs (Internal)",
            slug=slug,
            tier=OrganizationTier.ENTERPRISE,
            max_strategies=None,
            is_active=True,
            status=OrganizationStatus.ACTIVE,
        )
        session.add(org)
        await session.flush()
        admin = User(
            organization_id=org.id,
            email=email.lower(),
            hashed_password=hash_password(password),
            full_name="Founder",
            role=UserRole.ADMIN,
            is_active=True,
            is_super_admin=True,
            email_verified=True,  # Batch 25: seeded, not self-registered
        )
        session.add(admin)
        await session.commit()
        admin_id = admin.id

    resp = await login(client, email=email, password=password)
    assert resp.status_code == 200, f"superadmin login failed: {resp.text}"
    return resp.json()["access_token"], uuid.UUID(str(admin_id))


async def create_org_user(
    maker: async_sessionmaker,
    *,
    org_name: str,
    slug: str,
    email: str,
    password: str = DEFAULT_PASSWORD,
    role: UserRole = UserRole.RESEARCHER,
    tier: OrganizationTier = OrganizationTier.STARTER,
) -> tuple[Organization, User]:
    """Insert an organization + a user directly (no API), e.g. to make a researcher."""
    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        organization = Organization(
            name=org_name,
            slug=slug,
            tier=tier,
            max_strategies=25,
            is_active=True,
            # Batch 24: status server_default is pending_approval; a directly-seeded
            # test org must be ACTIVE to be usable.
            status=OrganizationStatus.ACTIVE,
        )
        session.add(organization)
        await session.flush()
        user = User(
            organization_id=organization.id,
            email=email.lower(),
            hashed_password=hash_password(password),
            full_name=None,
            role=role,
            is_active=True,
            # Batch 25: a directly-seeded user never went through the email flow, so
            # mark it verified — same treatment migration 0018 gave existing rows.
            email_verified=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        await session.refresh(organization)
        return organization, user


async def add_user_to_org(
    maker: async_sessionmaker,
    *,
    organization_id: uuid.UUID,
    email: str,
    role: UserRole,
    full_name: str | None = None,
    password: str = DEFAULT_PASSWORD,
) -> User:
    """Add another user with a given role to an ALREADY-EXISTING org (Batch 25:
    governance tests need several roles acting inside one tenant)."""
    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        user = User(
            organization_id=organization_id,
            email=email.lower(),
            hashed_password=hash_password(password),
            full_name=full_name,
            role=role,
            is_active=True,
            email_verified=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def token_for(client: AsyncClient, email: str) -> str:
    resp = await login(client, email=email)
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]
