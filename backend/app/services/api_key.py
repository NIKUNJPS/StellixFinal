"""API key service (Batch 12): create/list/revoke, and authentication.

``authenticate_api_key`` mirrors ``rotate_refresh_token``'s pattern in
app/services/auth.py exactly: the raw credential's hash is looked up via an
UNSCOPED (system) session, since which organization it belongs to isn't known
until the row is found — the row itself then carries organization_id.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_api_key, hash_api_key
from app.models.api_key import ApiKey
from app.models.user import User


def _as_aware_utc(value: datetime) -> datetime:
    """Treat naive datetimes (possible from SQLite, which drops tzinfo even on
    a DateTime(timezone=True) column) as UTC for safe comparison — same fix
    app/services/auth.py already applies to RefreshToken.expires_at."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def create_api_key(
    session: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID, name: str,
    scopes: list[str], expires_in_days: int | None,
) -> tuple[ApiKey, str]:
    raw_key = generate_api_key()
    expires_at = (
        datetime.now(UTC) + timedelta(days=expires_in_days)
        if expires_in_days is not None
        else None
    )
    record = ApiKey(
        organization_id=organization_id,
        user_id=user_id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:12],
        name=name,
        scopes=scopes,
        expires_at=expires_at,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record, raw_key


async def list_api_keys(session: AsyncSession, *, user_id: uuid.UUID) -> tuple[int, list[ApiKey]]:
    rows = (
        await session.execute(
            select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
        )
    ).scalars().all()
    return len(rows), rows


async def revoke_api_key(session: AsyncSession, *, api_key: ApiKey) -> ApiKey:
    if api_key.revoked_at is None:
        api_key.revoked_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(api_key)
    return api_key


class ApiKeyInvalid(Exception):
    """Raised for any invalid/expired/revoked API key — deliberately generic,
    same "don't tell an attacker which specific check failed" reasoning as
    invalid-credentials errors elsewhere in this codebase."""


async def authenticate_api_key(
    session: AsyncSession, *, raw_key: str
) -> tuple[uuid.UUID, uuid.UUID, list[str]]:
    """Validate a raw API key. Returns (user_id, organization_id, scopes).
    Raises ApiKeyInvalid if unknown, revoked, expired, or its user is
    inactive. Updates last_used_at on success — ``session`` must be a SYSTEM
    session (the org isn't known until the key is found)."""
    key_hash = hash_api_key(raw_key)
    record = (
        await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    ).scalar_one_or_none()
    if record is None or record.revoked_at is not None:
        raise ApiKeyInvalid()
    if record.expires_at is not None and _as_aware_utc(record.expires_at) <= datetime.now(UTC):
        raise ApiKeyInvalid()

    user = (await session.execute(select(User).where(User.id == record.user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise ApiKeyInvalid()

    record.last_used_at = datetime.now(UTC)
    await session.commit()
    return record.user_id, record.organization_id, list(record.scopes or [])
