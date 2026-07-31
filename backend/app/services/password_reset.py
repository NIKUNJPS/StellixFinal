"""Forgot-password flow (Batch 12; real email delivery added in Batch 25).

The reset link is now sent by ``app/services/email.py``. When SMTP is
unconfigured that send is a logged no-op, so the previous dev-only behaviour
(link in the log + in the JSON response) still applies outside production —
see ``ForgotPasswordResponse.dev_reset_link``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_refresh_token, hash_password, hash_refresh_token
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services import notifications
from app.services.auth import AuthError, _resolve_user_by_email
from app.services.email import send_notification

logger = logging.getLogger(__name__)

_RESET_TOKEN_EXPIRE_MINUTES = 30


def _as_aware_utc(value: datetime) -> datetime:
    """Treat naive datetimes (possible from SQLite, which drops tzinfo even on
    a DateTime(timezone=True) column) as UTC for safe comparison — same fix
    app/services/auth.py already applies to RefreshToken.expires_at."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


class InvalidResetTokenError(Exception):
    pass


async def request_password_reset(
    session: AsyncSession, *, email: str, organization_slug: str | None
) -> str | None:
    """Returns the RAW reset token if the email resolved to exactly one user,
    else None. The route returns 200 either way — never revealing which
    happened, so account existence isn't observable from the response."""
    try:
        user = await _resolve_user_by_email(
            session, email=email.strip().lower(), organization_slug=organization_slug
        )
    except AuthError:
        return None

    raw_token = generate_refresh_token()  # generic opaque-token primitive, reused as-is
    session.add(
        PasswordResetToken(
            organization_id=user.organization_id,
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(minutes=_RESET_TOKEN_EXPIRE_MINUTES),
        )
    )
    await session.commit()

    reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
    delivered = await send_notification(
        notifications.password_reset(
            full_name=user.full_name,
            link=reset_link,
            expires_minutes=_RESET_TOKEN_EXPIRE_MINUTES,
        ),
        to=user.email,
    )
    if not delivered:
        logger.info("Reset link for %s (email not sent): %s", user.email, reset_link)
    return raw_token


async def reset_password(session: AsyncSession, *, raw_token: str, new_password: str) -> None:
    token_hash = hash_refresh_token(raw_token)
    record = (
        await session.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if record is None or record.used_at is not None:
        raise InvalidResetTokenError()
    if _as_aware_utc(record.expires_at) <= datetime.now(UTC):
        raise InvalidResetTokenError()

    user = (await session.execute(select(User).where(User.id == record.user_id))).scalar_one_or_none()
    if user is None:
        raise InvalidResetTokenError()

    user.hashed_password = hash_password(new_password)
    record.used_at = datetime.now(UTC)
    await session.commit()
