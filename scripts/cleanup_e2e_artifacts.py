#!/usr/bin/env python3
"""Remove E2E-verification test organizations from the dev database (Batch 23).

Prior batches created throwaway orgs while verifying flows in a real browser
(``e2e21@stellixtest.io`` / "E2E Batch21 Co", "Prospect Capital E2E" via the demo-
approval flow, etc.). This script finds and removes those, so the database is clean for
a demo — WITHOUT touching the real Meridian Capital demo org or the internal superadmin
account.

SAFE BY DEFAULT: dry-run unless you pass ``--execute``. It prints exactly what it would
delete first. A hard-coded preserve list guarantees Meridian and the superadmin org are
never removed, even if they somehow matched a pattern.

Deleting an Organization cascades to all of its tenant data + users via the
``ON DELETE CASCADE`` foreign keys on ``organization_id`` (same mechanism the seed
script relies on when it rebuilds Meridian). Neo4j nodes for the org are purged
best-effort (skipped if Neo4j is unreachable).

Usage (from repo root, backend venv):

    backend/.venv/Scripts/python.exe scripts/cleanup_e2e_artifacts.py            # dry run
    backend/.venv/Scripts/python.exe scripts/cleanup_e2e_artifacts.py --execute  # delete
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

try:
    from dotenv import load_dotenv

    for _envf in (REPO_ROOT / "backend" / ".env", REPO_ROOT / "infra" / ".env"):
        if _envf.exists():
            load_dotenv(_envf, override=False)
except ImportError:
    pass

import app.models  # noqa: E402,F401  (register all models)
from app.db.session import get_system_session  # noqa: E402
from app.db.tenant import mark_session_unscoped  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.user import User  # noqa: E402
from sqlalchemy import delete, func, or_, select  # noqa: E402

# Never delete these — the real demo org and the internal superadmin org.
PRESERVE_SLUGS = {"meridian-capital", "stellix-internal"}
PRESERVE_EMAILS = {"founder@stellixlabs.com"}

# Test-artifact signatures (any match flags the org for removal).
TEST_EMAIL_DOMAINS = ["@stellixtest.io", "@prospectcap.io", "@csvorg.co", "@iso.co"]
TEST_NAME_SUBSTRINGS = ["e2e", "prospect capital e2e"]


async def _find_targets(session) -> list[tuple[Organization, int, list[str]]]:
    """Return [(org, user_count, matched_emails)] for orgs that look like test artifacts
    and are NOT on the preserve list."""
    email_filters = [User.email.ilike(f"%{d}") for d in TEST_EMAIL_DOMAINS]
    name_filters = [Organization.name.ilike(f"%{s}%") for s in TEST_NAME_SUBSTRINGS]

    # Orgs matched by a suspicious org name.
    by_name = set(
        (await session.execute(select(Organization.id).where(or_(*name_filters)))).scalars().all()
    )
    # Orgs matched by a suspicious user email.
    by_email = set(
        (
            await session.execute(select(User.organization_id).where(or_(*email_filters)))
        ).scalars().all()
    )
    candidate_ids = by_name | by_email

    targets: list[tuple[Organization, int, list[str]]] = []
    for org_id in candidate_ids:
        org = await session.get(Organization, org_id)
        if org is None or org.slug in PRESERVE_SLUGS:
            continue
        users = (
            await session.execute(select(User.email).where(User.organization_id == org_id))
        ).scalars().all()
        if any(e in PRESERVE_EMAILS for e in users):
            continue
        targets.append((org, len(users), list(users)))
    return targets


async def _purge_graph(org_id) -> None:
    """Best-effort: remove the org's Neo4j nodes. Skipped if Neo4j is unreachable."""
    try:
        from app.clients import neo4j_client

        driver = neo4j_client.get_driver()
        async with driver.session() as gsession:
            await gsession.run("MATCH (n {organization_id: $oid}) DETACH DELETE n", oid=str(org_id))
    except Exception as exc:  # noqa: BLE001
        print(f"    (Neo4j purge skipped for {org_id}: {type(exc).__name__})")


async def main() -> int:
    parser = argparse.ArgumentParser(description="Remove E2E test orgs (dry-run by default).")
    parser.add_argument("--execute", action="store_true", help="Actually delete (default: dry run).")
    args = parser.parse_args()

    async with get_system_session() as session:
        mark_session_unscoped(session.sync_session)
        targets = await _find_targets(session)

        if not targets:
            print("No E2E test artifacts found. Database is already clean.")
            return 0

        print(f"\nFound {len(targets)} test organization(s) to remove "
              f"(preserving Meridian + superadmin):\n")
        for org, n_users, emails in sorted(targets, key=lambda t: t[0].name.lower()):
            created = org.created_at.date().isoformat() if org.created_at else "?"
            print(f"  • {org.name}  (slug={org.slug}, created={created}, {n_users} user(s))")
            for e in emails[:5]:
                print(f"      - {e}")

        if not args.execute:
            print("\nDRY RUN — nothing deleted. Re-run with --execute to remove these.")
            return 0

        print("\nDeleting…")
        for org, _n, _e in targets:
            await _purge_graph(org.id)
            await session.execute(delete(Organization).where(Organization.id == org.id))
        await session.commit()

        remaining = await session.scalar(select(func.count()).select_from(Organization))
        print(f"Done. Removed {len(targets)} org(s). {remaining} organization(s) remain.")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
