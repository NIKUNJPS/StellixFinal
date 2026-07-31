"""TOTP-based MFA (Batch 12) — real pyotp enrollment/verification, not a
cosmetic toggle. See docs/schemas.md "MFA login flow" for the full 3-step
design (enroll -> verify -> 2-step login)."""

from __future__ import annotations

import pyotp

_ISSUER = "Stellix Labs"


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_provisioning_uri(*, secret: str, account_email: str) -> str:
    """otpauth:// URI the frontend renders as a QR code for an authenticator app."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=account_email, issuer_name=_ISSUER)


def verify_totp_code(*, secret: str, code: str) -> bool:
    # valid_window=1: also accept the previous/next 30s code, standard
    # tolerance for clock drift and the time a user takes to type the code.
    return pyotp.totp.TOTP(secret).verify(code, valid_window=1)
