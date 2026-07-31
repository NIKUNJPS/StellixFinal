"""Email-ownership verification (Batch 25).

Mirrors ``app/services/password_reset.py`` deliberately — same opaque-token
primitive, same SHA-256-hash-at-rest rule, same "never reveal whether an account
exists" posture on the resend endpoint. The difference is what redemption does:
a reset changes the password, a verification flips ``User.email_verified``.

Why this exists: until now anyone could register with an address they don't own,
which both pollutes the founder's approval queue and makes every downstream email
(approval, digest, invitation) unreachable. Verification closes that.

Degradation: when SMTP is unconfigured ``send_email`` is a logged no-op, so the
routes surface the raw link in the response **only** outside production — exactly
the deferral ``ForgotPasswordResponse.dev_reset_link`` already uses.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_refresh_token, hash_refresh_token
from app.models.email_verification_token import EmailVerificationToken
from app.models.user import User
from app.services import notifications
from app.services.auth import AuthError, _resolve_user_by_email
from app.services.email import send_notification

logger = logging.getLogger(__name__)

VERIFICATION_TOKEN_EXPIRE_HOURS = 24


class InvalidVerificationTokenError(Exception):
    """Token is unknown, already redeemed, or past its expiry."""


def _as_aware_utc(value: datetime) -> datetime:
    """Treat naive datetimes (SQLite drops tzinfo even on DateTime(timezone=True))
    as UTC — same guard password_reset.py and auth.py already apply."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def build_verification_link(raw_token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={raw_token}"


async def issue_verification_token(session: AsyncSession, *, user: User) -> str:
    """Mint and persist a verification token, returning the RAW value.

    The caller is responsible for sending it — kept separate so registration can
    issue inside its own transaction and mail afterwards.
    """
    raw_token = generate_refresh_token()  # generic opaque-token primitive, reused as-is
    session.add(
        EmailVerificationToken(
            organization_id=user.organization_id,
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(UTC)
            + timedelta(hours=VERIFICATION_TOKEN_EXPIRE_HOURS),
        )
    )
    await session.commit()
    return raw_token


async def send_verification_email(user: User, raw_token: str) -> bool:
    """Best-effort delivery. False (never an exception) if SMTP is unconfigured."""
    link = build_verification_link(raw_token)
    delivered = await send_notification(
        notifications.verify_email(
            full_name=user.full_name,
            link=link,
            expires_hours=VERIFICATION_TOKEN_EXPIRE_HOURS,
        ),
        to=user.email,
    )
    if not delivered:
        logger.info("Verification link for %s (email not sent): %s", user.email, link)
    return delivered


async def issue_and_send(session: AsyncSession, *, user: User) -> str:
    raw_token = await issue_verification_token(session, user=user)
    await send_verification_email(user, raw_token)
    return raw_token


async def verify_email(session: AsyncSession, *, raw_token: str) -> User:
    """Redeem a token and mark the user verified. Idempotent per-token: a second
    redemption of the same token raises, because ``used_at`` is already set."""
    token_hash = hash_refresh_token(raw_token)
    record = (
        await session.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.token_hash == token_hash
            )
        )
    ).scalar_one_or_none()
    if record is None or record.used_at is not None:
        raise InvalidVerificationTokenError()
    if _as_aware_utc(record.expires_at) <= datetime.now(UTC):
        raise InvalidVerificationTokenError()

    user = (
        await session.execute(select(User).where(User.id == record.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise InvalidVerificationTokenError()

    user.email_verified = True
    record.used_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(user)
    return user


async def resend_verification(
    session: AsyncSession, *, email: str, organization_slug: str | None
) -> str | None:
    """Issue a fresh token for an *unverified* user and mail it.

    Returns the raw token, or None when the email doesn't resolve or is already
    verified. The route returns 200 regardless, so neither account existence nor
    verification state is observable from the response.
    """
    try:
        user = await _resolve_user_by_email(
            session, email=email.strip().lower(), organization_slug=organization_slug
        )
    except AuthError:
        return None
    if user.email_verified:
        return None

    raw_token = await issue_verification_token(session, user=user)
    await send_verification_email(user, raw_token)
    return raw_token
