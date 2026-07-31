#!/usr/bin/env python3
"""Create (or promote) a platform SUPERADMIN — the founder's cross-tenant account (Batch 24).

A superadmin is a normal ``users`` row with ``is_super_admin=True``. That single flag
unlocks the ``/superadmin/*`` control plane (see app/api/deps.py::require_super_admin)
and exempts the account from the client org-status gate, so the founder's console keeps
working regardless of any org's lifecycle state. It is orthogonal to the within-tenant
RBAC role — a superadmin still belongs to one home organization (the internal Stellix
org) for tenant scoping, but their reach is platform-wide.

IDEMPOTENT: safe to re-run. If a user with the given email already exists it is PROMOTED
(is_super_admin=True, optionally password reset), never duplicated. The internal home org
is created once (by slug) and reused. Nothing else is touched.

Credentials come from CLI flags or env — never hardcoded. Do NOT run this with real
production credentials from your shell history; prefer the env-var form and clear it after,
or let the script generate a strong random password and print it once.

Usage (from repo root, using the backend venv so app packages resolve):

    backend/.venv/Scripts/python.exe scripts/create_superadmin.py \
        --email founder@stellixlabs.com --name "Founder"

    # password precedence: --password  >  $SUPERADMIN_PASSWORD  >  generated-and-printed

Env knobs (optional):
    SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME
    SUPERADMIN_ORG_SLUG   (default: stellix-internal)
    SUPERADMIN_ORG_NAME   (default: "Stellix Labs (Internal)")
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys
from pathlib import Path

# Force UTF-8 so the summary prints cleanly on the cp1252 Windows console.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# Make the backend package importable when run from the repo root.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

# Load backend/.env BEFORE settings is imported (pydantic env_file is CWD-relative,
# so running from the repo root would otherwise miss it).
try:
    from dotenv import load_dotenv

    for _envf in (REPO_ROOT / "backend" / ".env", REPO_ROOT / "infra" / ".env"):
        if _envf.exists():
            load_dotenv(_envf, override=False)
except ImportError:
    pass

import app.models  # noqa: E402,F401  (register all models with the mapper)
from app.core.security import hash_password  # noqa: E402
from app.db.session import get_system_session  # noqa: E402
from app.db.tenant import mark_session_unscoped  # noqa: E402
from app.models.organization import (  # noqa: E402
    Organization,
    OrganizationStatus,
    OrganizationTier,
)
from app.models.user import User, UserRole  # noqa: E402
from sqlalchemy import select  # noqa: E402

DEFAULT_ORG_SLUG = os.environ.get("SUPERADMIN_ORG_SLUG", "stellix-internal")
DEFAULT_ORG_NAME = os.environ.get("SUPERADMIN_ORG_NAME", "Stellix Labs (Internal)")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Create or promote a platform superadmin.")
    p.add_argument("--email", default=os.environ.get("SUPERADMIN_EMAIL"))
    p.add_argument("--password", default=os.environ.get("SUPERADMIN_PASSWORD"))
    p.add_argument("--name", default=os.environ.get("SUPERADMIN_NAME", "Superadmin"))
    p.add_argument("--org-slug", default=DEFAULT_ORG_SLUG)
    p.add_argument("--org-name", default=DEFAULT_ORG_NAME)
    p.add_argument(
        "--reset-password",
        action="store_true",
        help="If the user already exists, also reset their password to the provided/generated one.",
    )
    return p.parse_args()


async def _get_or_create_internal_org(session, *, slug: str, name: str) -> Organization:
    org = (
        await session.execute(select(Organization).where(Organization.slug == slug))
    ).scalar_one_or_none()
    if org is not None:
        return org
    org = Organization(
        name=name,
        slug=slug,
        tier=OrganizationTier.ENTERPRISE,
        max_strategies=None,
        is_active=True,
        status=OrganizationStatus.ACTIVE,
        onboarding_completed=True,
    )
    session.add(org)
    await session.flush()
    return org


async def main() -> int:
    args = _parse_args()
    if not args.email:
        print("ERROR: an email is required (--email or $SUPERADMIN_EMAIL).", file=sys.stderr)
        return 2
    email = args.email.strip().lower()

    # Password precedence: explicit flag/env, else generate a strong one and print it once.
    generated = False
    password = args.password
    if not password:
        password = secrets.token_urlsafe(16)
        generated = True

    async with get_system_session() as session:
        # Cross-tenant admin bootstrap — must run unscoped or the ORM tenant filter
        # would hide the internal org / user rows.
        mark_session_unscoped(session.sync_session)

        org = await _get_or_create_internal_org(
            session, slug=args.org_slug, name=args.org_name
        )

        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()

        if existing is not None:
            existing.is_super_admin = True
            existing.is_active = True
            action = "promoted existing user to superadmin"
            if args.reset_password:
                existing.hashed_password = hash_password(password)
                action += " (password reset)"
            elif generated:
                # Existing user, no reset requested — don't claim a password we didn't set.
                generated = False
                password = "(unchanged — pass --reset-password to set a new one)"
            user = existing
        else:
            user = User(
                organization_id=org.id,
                email=email,
                hashed_password=hash_password(password),
                full_name=args.name,
                role=UserRole.ADMIN,
                is_active=True,
                is_super_admin=True,
            )
            session.add(user)
            action = "created new superadmin user"

        await session.commit()
        await session.refresh(user)

    print("\n✓ Superadmin ready.")
    print(f"  action : {action}")
    print(f"  user   : {user.email}  (id={user.id})")
    print(f"  org    : {org.name}  (slug={org.slug}, id={org.id})")
    if generated:
        print(f"  password (generated — shown ONCE, store it now):\n\n      {password}\n")
    print("  This account can sign in at /login and will be redirected to /superadmin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
