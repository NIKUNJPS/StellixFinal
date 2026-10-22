"""Complete the Failure Intelligence page for the Meridian demo org (idempotent).

1. Sets ``Strategy.symbol`` for strategies that lack one, from the instrument each was
   actually backtested on (name prefix), so failures resolve to a real instrument on the
   Failure Timeline. Failure rows themselves are append-only and are never edited.
2. Generates the AI explanation for every failure that has none (or only the seed
   placeholder) through the real, audited, numerically-validated explain_failure path.

Usage:  backend\\.venv\\Scripts\\python.exe scripts\\fill_failure_intelligence.py
"""
from __future__ import annotations

import asyncio
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(ROOT, "backend"))
sys.path.insert(0, os.getcwd())

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.session import SessionFactory, dispose_engine, get_tenant_session  # noqa: E402
from app.db.tenant import bind_organization, mark_session_unscoped  # noqa: E402
from app.models.failure import Failure  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.strategy import Strategy  # noqa: E402
from app.services.llm_explain import explain_failure_and_persist, has_real_explanation  # noqa: E402

PREFIX = {"SPY": "SPY", "QQQ": "QQQ", "GOLD": "GLD", "GLD": "GLD", "BTC": "BTC-USD"}


async def main() -> None:
    async with SessionFactory() as s:
        mark_session_unscoped(s.sync_session)
        org_id = (await s.execute(select(Organization.id).where(Organization.slug == "meridian-capital"))).scalar_one()

    async with get_tenant_session(org_id) as session:
        bind_organization(session.sync_session, org_id)
        rows = (await session.execute(select(Strategy).where(Strategy.symbol.is_(None)))).scalars().all()
        n = 0
        for st in rows:
            sym = PREFIX.get(st.name.split()[0].upper())
            if sym:
                st.symbol = sym
                n += 1
        await session.commit()
    print(f"[symbols] set instrument on {n} strategies", flush=True)

    async with get_tenant_session(org_id) as session:
        bind_organization(session.sync_session, org_id)
        failures = (await session.execute(select(Failure))).scalars().all()
        todo = [f.id for f in failures if not has_real_explanation(f)]
    print(f"[explain] {len(todo)} of {len(failures)} failures need an explanation", flush=True)
    for fid in todo:
        res = await explain_failure_and_persist(org_id, fid)
        print(f"  {str(fid)[:8]} -> {res}", flush=True)
    await dispose_engine()


asyncio.run(main())
