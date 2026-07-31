"""Pydantic schemas for the auth endpoints."""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# Deliberately small denylist — the spec says "don't over-engineer, just don't allow
# 'password'". Strength = min 10 chars AND at least one digit.
_PASSWORD_DENYLIST = {"password", "password1", "1234567890"}


def _validate_password_strength(value: str) -> str:
    if len(value) < 10:
        raise ValueError("Password must be at least 10 characters long")
    if not re.search(r"\d", value):
        raise ValueError("Password must contain at least one number")
    if value.lower() in _PASSWORD_DENYLIST:
        raise ValueError("Password is too common; choose a stronger one")
    return value


# Bcrypt's own effective limit is 72 bytes; 128 chars is a generous ceiling above
# any real password that also blocks a giant-payload abuse vector (bcrypt is
# deliberately slow, so hashing an unbounded string is a real CPU-cost lever).
_PASSWORD_MAX_LENGTH = 128


class RegisterRequest(BaseModel):
    """Creates an Organization and its first (admin) User in one transaction."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "organization_name": "Acme Capital",
                "email": "quant@acmecapital.com",
                "password": "correct-horse-battery-9",
                "full_name": "Ada Quant",
            }
        }
    )

    organization_name: str = Field(min_length=1, max_length=255)
    # Optional URL-safe slug; derived from organization_name when omitted.
    organization_slug: str | None = Field(default=None, max_length=255)
    email: EmailStr
    password: str = Field(max_length=_PASSWORD_MAX_LENGTH)
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"email": "quant@acmecapital.com", "password": "correct-horse-battery-9"}
        }
    )

    email: EmailStr
    password: str = Field(max_length=_PASSWORD_MAX_LENGTH)
    # Required only when the email exists in more than one organization.
    organization_slug: str | None = Field(default=None, max_length=255)
    # Batch 12 Page 09: wired to the refresh token's actual expiry, not cosmetic.
    remember_me: bool = False


class RefreshRequest(BaseModel):
    """Body fallback for clients that cannot use the httpOnly refresh cookie."""

    refresh_token: str | None = Field(default=None, max_length=512)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # access-token lifetime in seconds


class MfaChallengeResponse(BaseModel):
    """Returned from /auth/login instead of TokenResponse when the account has
    MFA enabled — the caller must complete /auth/mfa/login to get real tokens."""

    mfa_required: bool = True
    challenge_token: str


_TOTP_CODE_PATTERN = r"^\d{6}$"


class MfaEnrollResponse(BaseModel):
    secret: str
    provisioning_uri: str


class MfaVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=_TOTP_CODE_PATTERN)


class MfaLoginRequest(BaseModel):
    challenge_token: str = Field(min_length=1, max_length=2048)
    code: str = Field(min_length=6, max_length=6, pattern=_TOTP_CODE_PATTERN)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    organization_slug: str | None = Field(default=None, max_length=255)


class ForgotPasswordResponse(BaseModel):
    message: str = "If that email exists, a password reset link has been sent."
    # Populated only when the link could NOT be emailed AND this isn't production
    # (i.e. SMTP is unconfigured) — otherwise a developer would have no way to get
    # the link. Configuring SMTP makes this field go away. See app/services/email.py.
    dev_reset_link: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)
    new_password: str = Field(max_length=_PASSWORD_MAX_LENGTH)

    @field_validator("new_password")
    @classmethod
    def _check_new_password(cls, v: str) -> str:
        return _validate_password_strength(v)


# --------------------------------------------------------------------------- #
# Email verification (Batch 25)
# --------------------------------------------------------------------------- #
class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)


class ResendVerificationRequest(BaseModel):
    email: EmailStr
    organization_slug: str | None = Field(default=None, max_length=255)


class VerificationResponse(BaseModel):
    """Shared by /verify-email and /resend-verification.

    ``dev_verification_link`` follows the same rule as ``dev_reset_link`` above:
    non-production AND SMTP unconfigured only.
    """

    message: str
    email_verified: bool = False
    dev_verification_link: str | None = None
