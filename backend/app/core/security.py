"""Security primitives: password hashing, JWT access tokens, refresh-token hashing.

Non-negotiables (PROJECT_CONSTITUTION §2 → Auth, Batch 1):
- Passwords: bcrypt only (cost factor 12). Plaintext is never stored or logged.
- JWT secret loaded from env (``settings.JWT_SECRET_KEY``), never hardcoded.
- Refresh tokens are opaque random strings stored only as SHA-256 hashes.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt with an explicit cost factor of 12.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

ACCESS_TOKEN_TYPE = "access"
MFA_CHALLENGE_TOKEN_TYPE = "mfa_challenge"
MFA_CHALLENGE_EXPIRE_MINUTES = 5


class TokenError(Exception):
    """Raised when a JWT is invalid, expired, or of the wrong type."""


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(plain_password: str) -> str:
    """Hash a plaintext password with bcrypt (cost 12)."""
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time verify a plaintext password against a bcrypt hash."""
    return _pwd_context.verify(plain_password, hashed_password)


# --------------------------------------------------------------------------- #
# Access tokens (JWT)
# --------------------------------------------------------------------------- #
def create_access_token(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, role: str
) -> str:
    """Mint a short-lived (15 min) access JWT carrying identity + tenant + role."""
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "org": str(organization_id),
        "role": role,
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_impersonation_token(
    *,
    target_user_id: uuid.UUID,
    organization_id: uuid.UUID,
    role: str,
    impersonator_id: uuid.UUID,
) -> str:
    """Mint a SHORT-lived (15 min) impersonation access token (Batch 24).

    Carries the target user's identity so downstream tenant scoping is correct, plus
    ``impersonation: True`` and the founder's id. get_current_user rejects any write
    method under an impersonation token (read-only debugging), so this cannot be used
    to change a client's state. 15 minutes regardless of ACCESS_TOKEN_EXPIRE_MINUTES."""
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": str(target_user_id),
        "org": str(organization_id),
        "role": role,
        "type": ACCESS_TOKEN_TYPE,
        "impersonation": True,
        "impersonator": str(impersonator_id),
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=15),
    }
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access JWT. Raises ``TokenError`` on any problem."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise TokenError("Not an access token")
    return payload


# --------------------------------------------------------------------------- #
# MFA challenge tokens (Batch 12) — short-lived, stateless (no DB table, unlike
# refresh tokens: this is purely transient and doesn't need independent
# revocation the way a long-lived credential does).
# --------------------------------------------------------------------------- #
def create_mfa_challenge_token(*, user_id: uuid.UUID) -> str:
    """Issued when a password check succeeds for an mfa_enabled user, in place
    of real tokens — POST /auth/mfa/login exchanges this + a TOTP code for the
    real access/refresh token pair."""
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "type": MFA_CHALLENGE_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=MFA_CHALLENGE_EXPIRE_MINUTES),
    }
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_mfa_challenge_token(token: str) -> uuid.UUID:
    """Decode and validate an MFA challenge token. Raises ``TokenError`` on any
    problem. Returns the user_id it was issued for."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != MFA_CHALLENGE_TOKEN_TYPE or "sub" not in payload:
        raise TokenError("Not an MFA challenge token")
    return uuid.UUID(payload["sub"])


# --------------------------------------------------------------------------- #
# Refresh tokens (opaque, stored hashed)
# --------------------------------------------------------------------------- #
def generate_refresh_token() -> str:
    """Generate a cryptographically-strong opaque refresh token (raw form)."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    """Return the SHA-256 hex digest stored in the DB (never the raw token)."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# API keys (Batch 12) — same "opaque, stored hashed" pattern as refresh tokens
# --------------------------------------------------------------------------- #
API_KEY_PREFIX = "slx_"


def generate_api_key() -> str:
    """Generate a raw API key (shown to the user exactly once at creation)."""
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"


def hash_api_key(raw_key: str) -> str:
    """Return the SHA-256 hex digest stored in the DB (never the raw key)."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
