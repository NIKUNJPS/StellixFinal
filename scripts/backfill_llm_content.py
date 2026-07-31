#!/usr/bin/env python3
"""Backfill deferred LLM content once ANTHROPIC_API_KEY is configured (Batch 16).

The demo seed (`scripts/seed_demo_data.py`) stores a placeholder wherever the
real pipeline would have called the LLM (failure explanations) because
ANTHROPIC_API_KEY is not configured yet. This script finds those placeholder
records and regenerates them through the REAL LLM path
(`explain_failure_and_persist`) — the same code the async failure pipeline runs
in production. It is idempotent: only records still carrying the placeholder are
regenerated.

No-ops cleanly (clear message, exit 0) when ANTHROPIC_API_KEY is unset, so it is
always safe to run.

Usage (from repo root, using the backend venv):

    backend/.venv/Scripts/python.exe scripts/backfill_llm_content.py
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

try:
    from dotenv import load_dotenv

    for _envf in (REPO_ROOT / "backend" / ".env", REPO_ROOT / "infra" / ".env"):
        if _envf.exists():
            load_dotenv(_envf, override=False)
except ImportError:
    pass

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.db.session import get_system_session  # noqa: E402
from app.models.failure import Failure  # noqa: E402
from app.services.llm_explain import explain_failure_and_persist  # noqa: E402

PLACEHOLDER_PREFIX = "[LLM content pending"


async def main() -> int:
    # --dry-run added in Batch 18: this script makes real, billed LLM calls and
    # writes to an otherwise-append-only table, so "show me what you would touch"
    # needs to be a real mode. Previously any argument was silently ignored — so a
    # cautious `--backfill --dry-run` did the full live run anyway.
    parser = argparse.ArgumentParser(
        description="Regenerate deferred LLM failure explanations through the real pipeline."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List the records that would be regenerated, then exit without calling any LLM.",
    )
    args = parser.parse_args()

    # Either provider can serve explain_failure (the router falls back Gemini ->
    # Claude), so the old ANTHROPIC-only gate would wrongly refuse to run on a
    # Gemini-only deployment.
    if not settings.ANTHROPIC_API_KEY and not settings.GEMINI_API_KEY:
        print(
            "No LLM provider is configured — nothing to backfill yet.\n"
            "Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY (in backend/.env) and re-run\n"
            "to regenerate the deferred LLM failure explanations through the real pipeline.",
            file=sys.stderr,
        )
        return 0

    async with get_system_session() as session:
        pending = (
            await session.execute(
                select(Failure.organization_id, Failure.id).where(
                    Failure.llm_generated_explanation.like(f"{PLACEHOLDER_PREFIX}%")
                )
            )
        ).all()

    print(f"Found {len(pending)} failure record(s) with deferred LLM content.")

    if args.dry_run:
        for org_id, failure_id in pending:
            print(f"  · would regenerate failure {str(failure_id)[:8]} (org {str(org_id)[:8]})")
        print(
            f"\nDry run — no LLM was called and nothing was written. "
            f"Re-run without --dry-run to regenerate {len(pending)} explanation(s)."
        )
        return 0

    ok = 0
    for org_id, failure_id in pending:
        try:
            result = await explain_failure_and_persist(org_id, failure_id)
            if result.get("explained"):
                ok += 1
                print(f"  ✓ regenerated explanation for failure {str(failure_id)[:8]}")
            else:
                print(f"  · failure {str(failure_id)[:8]} skipped ({result.get('reason')})")
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ failure {str(failure_id)[:8]} error: {type(exc).__name__}: {exc}")

    print(f"\nDone. Regenerated {ok}/{len(pending)} explanation(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
