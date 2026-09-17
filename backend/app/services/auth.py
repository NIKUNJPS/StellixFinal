"""Authentication service: registration, login (+ lockout), refresh rotation, logout.

All functions take an ``AsyncSession`` and manage their own commits where state must
survive a subsequently-raised error (e.g. the failed-login counter). Pre-auth flows
run on an *unscoped* system session (the tenant is not yet known); per-tenant reads
elsewhere use an org-bound session.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.audit_log import AuditEventType
from app.models.organization import (
    TIER_MAX_STRATEGIES,
    Organization,
    OrganizationStatus,
    OrganizationTier,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.services.audit import write_audit_log


# --------------------------------------------------------------------------- #
# Domain errors (routes map these to HTTP status codes)
# --------------------------------------------------------------------------- #
class AuthError(Exception):
    """Base class for auth domain errors."""


class EmailAlreadyExistsError(AuthError):
    pass


class SlugAlreadyExistsError(AuthError):
    pass


class InvalidCredentialsError(AuthError):
    pass


class InactiveAccountError(AuthError):
    pass


class AccountLockedError(AuthError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Account temporarily locked due to failed login attempts")
        self.retry_after_seconds = retry_after_seconds


class OrganizationSlugRequiredError(AuthError):
    pass


class InvalidTokenError(AuthError):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "org"


def _as_aware_utc(value: datetime) -> datetime:
    """Treat naive datetimes (possible from SQLite) as UTC for safe comparison."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


# --------------------------------------------------------------------------- #
# Registration
# --------------------------------------------------------------------------- #
async def register_organization_and_admin(
    session: AsyncSession,
    *,
    organization_name: str,
    email: str,
    password: str,
    full_name: str | None,
    organization_slug: str | None = None,
) -> tuple[User, Organization]:
    """Create an Organization and its first admin User atomically."""
    email_normalized = email.strip().lower()
    slug = slugify(organization_slug or organization_name)

    tier = OrganizationTier.STARTER
    # Batch 24: self-registration lands in PENDING_APPROVAL — the founder approves it
    # from the superadmin console before it can log in. is_active is kept in sync
    # (active ⟺ status == ACTIVE), so it starts False.
    organization = Organization(
        name=organization_name.strip(),
        slug=slug,
        tier=tier,
        max_strategies=TIER_MAX_STRATEGIES[tier],
        is_active=False,
        status=OrganizationStatus.PENDING_APPROVAL,
    )
    session.add(organization)
    try:
        await session.flush()  # assigns organization.id
    except IntegrityError as exc:
        await session.rollback()
        raise SlugAlreadyExistsError(slug) from exc

    user = User(
        organization_id=organization.id,
        email=email_normalized,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=UserRole.ADMIN,
        is_active=True,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise EmailAlreadyExistsError(email_normalized) from exc

    await session.commit()
    await session.refresh(user)
    await session.refresh(organization)
    return user, organization


async def get_org_status_for_login(
    session: AsyncSession, organization_id: uuid.UUID
) -> OrganizationStatus | None:
    """The org's lifecycle status, read directly (login runs on an unscoped system
    session; Organization is not tenant-scoped). Batch 24 login gate."""
    return (
        await session.execute(
            select(Organization.status).where(Organization.id == organization_id)
        )
    ).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Login + lockout
# --------------------------------------------------------------------------- #
async def _resolve_user_by_email(
    session: AsyncSession, *, email: str, organization_slug: str | None
) -> User:
    stmt = select(User).where(func.lower(User.email) == email)
    if organization_slug:
        stmt = stmt.join(Organization, User.organization_id == Organization.id).where(
            Organization.slug == organization_slug.strip().lower()
        )
    users = list((await session.execute(stmt)).scalars().all())
    if not users:
        raise InvalidCredentialsError()
    if len(users) > 1:
        # Email exists in multiple orgs and no slug was given to disambiguate.
        raise OrganizationSlugRequiredError()
    return users[0]


async def authenticate(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    organization_slug: str | None = None,
    ip_address: str | None = None,
) -> User:
    """Authenticate a user, enforcing account lockout. Raises on any failure.

    Audit logging (Batch 10): a truly-unknown email has no organization to
    attribute a failed_login entry to, so that specific case isn't logged — every
    other outcome (wrong password for a KNOWN user, and success) is.
    """
    user = await _resolve_user_by_email(
        session, email=email.strip().lower(), organization_slug=organization_slug
    )

    now = _utcnow()

    # Expired lock → reset to a clean slate before processing this attempt.
    if user.locked_until is not None and _as_aware_utc(user.locked_until) <= now:
        user.locked_until = None
        user.failed_login_attempts = 0

    # Still locked?
    if user.locked_until is not None and _as_aware_utc(user.locked_until) > now:
        retry_after = int((_as_aware_utc(user.locked_until) - now).total_seconds())
        await session.commit()
        raise AccountLockedError(max(retry_after, 1))

    if not user.is_active:
        raise InactiveAccountError()

    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
        await write_audit_log(
            session,
            organization_id=user.organization_id,
            actor_user_id=user.id,
            event_type=AuditEventType.FAILED_LOGIN,
            entity_type="user",
            entity_id=user.id,
            ip_address=ip_address,
        )
        await session.commit()  # persist the counter even though we raise
        raise InvalidCredentialsError()

    # Success: clear failure state, stamp last_login_at.
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    await write_audit_log(
        session,
        organization_id=user.organization_id,
        actor_user_id=user.id,
        event_type=AuditEventType.LOGIN,
        entity_type="user",
        entity_id=user.id,
        ip_address=ip_address,
    )
    await session.commit()
    await session.refresh(user)
    return user


# --------------------------------------------------------------------------- #
# Refresh tokens
# --------------------------------------------------------------------------- #
async def issue_refresh_token(
    session: AsyncSession, *, user: User, device_info: str | None = None, expire_days: int | None = None
) -> str:
    """Create a new refresh-token record and return the RAW token (caller delivers it).

    ``expire_days`` (Batch 12): defaults to ``settings.REFRESH_TOKEN_EXPIRE_DAYS``
    — the "remember me" checkbox on Page 09 passes a shorter value when unchecked.
    """
    raw = generate_refresh_token()
    record = RefreshToken(
        organization_id=user.organization_id,
        user_id=user.id,
        token_hash=hash_refresh_token(raw),
        expires_at=_utcnow() + timedelta(days=expire_days or settings.REFRESH_TOKEN_EXPIRE_DAYS),
        device_info=device_info,
    )
    session.add(record)
    await session.commit()
    return raw


async def rotate_refresh_token(
    session: AsyncSession, *, raw_token: str, device_info: str | None = None
) -> tuple[User, str]:
    """Validate a refresh token, revoke it, and issue a replacement.

    Returns ``(user, new_raw_refresh_token)``. Raises ``InvalidTokenError`` if the
    token is unknown, already revoked (reuse), or expired.
    """
    token_hash = hash_refresh_token(raw_token)
    record = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()

    if record is None or record.revoked_at is not None:
        raise InvalidTokenError()
    if _as_aware_utc(record.expires_at) <= _utcnow():
        raise InvalidTokenError()

    user = (
        await session.execute(select(User).where(User.id == record.user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise InvalidTokenError()

    # Rotate: revoke the presented token, mint a fresh one.
    record.revoked_at = _utcnow()
    new_raw = generate_refresh_token()
    session.add(
        RefreshToken(
            organization_id=user.organization_id,
            user_id=user.id,
            token_hash=hash_refresh_token(new_raw),
            expires_at=_utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            device_info=device_info,
        )
    )
    await session.commit()
    await session.refresh(user)
    return user, new_raw


async def revoke_refresh_token(
    session: AsyncSession, *, raw_token: str, ip_address: str | None = None
) -> None:
    """Revoke a refresh token (logout). Idempotent — unknown tokens are a no-op.

    Batch 25: revoking a live session is audited as ``logout`` (a repeat logout of an
    already-revoked token is not a new event and writes nothing)."""
    token_hash = hash_refresh_token(raw_token)
    record = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()
    if record is not None and record.revoked_at is None:
        record.revoked_at = _utcnow()
        user = await session.get(User, record.user_id)
        if user is not None:
            await write_audit_log(
                session,
                organization_id=user.organization_id,
                actor=user,
                event_type=AuditEventType.LOGOUT,
                entity_type="user",
                entity_id=user.id,
                entity_name=user.email,
                ip_address=ip_address,
            )
        await session.commit()


# --------------------------------------------------------------------------- #
# Loading the current user (tenant-scoped)
# --------------------------------------------------------------------------- #
async def get_user_in_organization(
    session: AsyncSession, *, user_id: uuid.UUID
) -> User | None:
    """Load a user by id on an ORG-BOUND session (auto-scoped to that organization)."""
    return (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Password change (Batch 12, Page 22 Settings > Security)
# --------------------------------------------------------------------------- #
async def change_password(
    session: AsyncSession, *, user: User, current_password: str, new_password: str
) -> None:
    """Requires the CURRENT password, not just an active session — same
    "prove you still are who you say you are" bar as any sensitive account
    change. Raises InvalidCredentialsError if current_password is wrong."""
    if not verify_password(current_password, user.hashed_password):
        raise InvalidCredentialsError()
    user.hashed_password = hash_password(new_password)
    await session.commit()
