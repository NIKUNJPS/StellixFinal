"""Team invitations (Batch 25) — the missing half of company onboarding.

Before this, an organization could only ever have the one admin created at
registration; every additional seat had to be seeded or provisioned by a
superadmin. An org admin can now invite colleagues directly, assigning the RBAC
role at invite time.

Tenant safety: ``Invitation`` is a ``TenantScopedModel``, so listing and revoking
go through the scoped session and are structurally confined to the caller's org —
there is no org id in any request body to tamper with. Acceptance is the one
unscoped path (the invitee has no session yet), and it derives the organization
from the *token record itself*, never from client input.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_refresh_token, hash_password, hash_refresh_token
from app.models.invitation import Invitation, InvitationStatus
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import notifications
from app.services.email import send_notification

logger = logging.getLogger(__name__)

INVITATION_EXPIRE_DAYS = 7


class InvitationError(Exception):
    """Base for invitation problems the routes translate to HTTP codes."""


class AlreadyMemberError(InvitationError):
    """That email already belongs to a user in this organization."""


class InvalidInvitationError(InvitationError):
    """Token unknown, expired, revoked, or already accepted."""


def _as_aware_utc(value: datetime) -> datetime:
    """SQLite drops tzinfo even on DateTime(timezone=True) — same guard as
    password_reset.py / email_verification.py."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def build_invite_link(raw_token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/accept-invitation?token={raw_token}"


def expose_dev_link(raw_token: str) -> str | None:
    """The invite link is only echoed back over the API when there is no mail
    server to send it with, and never in production."""
    if settings.is_production or settings.email_enabled:
        return None
    return build_invite_link(raw_token)


async def create_invitation(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    email: str,
    role: UserRole,
    invited_by: User,
    role_id: uuid.UUID | None = None,
) -> tuple[Invitation, str]:
    """Invite ``email`` into ``organization_id``. Returns (invitation, raw_token).

    Re-inviting an address that already has a pending invitation revokes the old
    one and issues a fresh token — that is what "resend" means to an admin, and it
    keeps at most one live invitation per address.
    """
    email_normalized = email.strip().lower()

    if role_id is not None:
        # Batch 26: only a system role or one of THIS organization's custom roles.
        from app.services.rbac import RoleNotFound, roles_visible_to_org

        chosen = next((r for r in await roles_visible_to_org(session, organization_id) if r.id == role_id), None)
        if chosen is None:
            raise RoleNotFound("Role not found")
        if chosen.system_key:
            role = UserRole(chosen.system_key)

    existing_user = (
        await session.execute(
            select(User).where(
                User.organization_id == organization_id,
                User.email == email_normalized,
            )
        )
    ).scalar_one_or_none()
    if existing_user is not None:
        raise AlreadyMemberError(email_normalized)

    pending = (
        await session.execute(
            select(Invitation).where(
                Invitation.organization_id == organization_id,
                Invitation.email == email_normalized,
                Invitation.status == InvitationStatus.PENDING,
            )
        )
    ).scalars().all()
    for stale in pending:
        stale.status = InvitationStatus.REVOKED

    raw_token = generate_refresh_token()
    invitation = Invitation(
        organization_id=organization_id,
        email=email_normalized,
        role=role,
        role_id=role_id,
        status=InvitationStatus.PENDING,
        token_hash=hash_refresh_token(raw_token),
        invited_by=invited_by.id,
        expires_at=datetime.now(UTC) + timedelta(days=INVITATION_EXPIRE_DAYS),
    )
    session.add(invitation)
    await session.commit()
    await session.refresh(invitation)
    return invitation, raw_token


async def send_invitation_email(
    invitation: Invitation, raw_token: str, *, company: str, inviter: User
) -> bool:
    link = build_invite_link(raw_token)
    delivered = await send_notification(
        notifications.team_invitation(
            company=company,
            inviter=inviter.full_name or inviter.email,
            role=invitation.role.value,
            link=link,
            expires_days=INVITATION_EXPIRE_DAYS,
        ),
        to=invitation.email,
    )
    if not delivered:
        logger.info("Invite link for %s (email not sent): %s", invitation.email, link)
    return delivered


async def list_invitations(session: AsyncSession) -> list[Invitation]:
    """Scoped session → only the caller's own org's invitations are visible."""
    result = await session.execute(
        select(Invitation).order_by(Invitation.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_invitation(session: AsyncSession, *, invitation_id: uuid.UUID) -> Invitation:
    """Revoke a pending invitation. Scoped session → another org's invitation is
    simply not found, so this cannot be used to probe or touch other tenants."""
    invitation = (
        await session.execute(select(Invitation).where(Invitation.id == invitation_id))
    ).scalar_one_or_none()
    if invitation is None:
        raise InvalidInvitationError("not found")
    if invitation.status is not InvitationStatus.PENDING:
        raise InvalidInvitationError(f"invitation is already {invitation.status.value}")

    invitation.status = InvitationStatus.REVOKED
    await session.commit()
    await session.refresh(invitation)
    return invitation


async def accept_invitation(
    session: AsyncSession, *, raw_token: str, password: str, full_name: str | None
) -> tuple[User, Organization]:
    """Redeem an invitation, creating the user in the INVITING org.

    Runs on an unscoped session because the invitee has no session yet. The target
    organization comes from ``invitation.organization_id`` — a value written by the
    inviting admin and never supplied by the person accepting — so this cannot be
    used to join an arbitrary tenant.
    """
    token_hash = hash_refresh_token(raw_token)
    invitation = (
        await session.execute(select(Invitation).where(Invitation.token_hash == token_hash))
    ).scalar_one_or_none()
    if invitation is None or invitation.status is not InvitationStatus.PENDING:
        raise InvalidInvitationError("unknown or already-used invitation")
    if _as_aware_utc(invitation.expires_at) <= datetime.now(UTC):
        raise InvalidInvitationError("expired invitation")

    organization = await session.get(Organization, invitation.organization_id)
    if organization is None:  # pragma: no cover - FK makes this unreachable
        raise InvalidInvitationError("organization no longer exists")

    # Guard the race where the same person was added by other means after the
    # invite was sent.
    existing = (
        await session.execute(
            select(User).where(
                User.organization_id == invitation.organization_id,
                User.email == invitation.email,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AlreadyMemberError(invitation.email)

    user = User(
        organization_id=invitation.organization_id,
        email=invitation.email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=invitation.role,
        role_id=invitation.role_id,
        is_active=True,
        # Opening a link sent only to this address IS the proof of ownership, so a
        # separate verification round-trip would be redundant.
        email_verified=True,
    )
    session.add(user)
    invitation.status = InvitationStatus.ACCEPTED
    invitation.accepted_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(user)
    await session.refresh(organization)
    return user, organization
