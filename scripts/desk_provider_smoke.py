"""End-to-end smoke test of the Agent Desk on a chosen LLM provider, without the web stack.

Runs one real multi-agent analysis (all four analysts) for the Meridian org as the Researcher and
prints the stages, rating and call count. The provider/models are taken from the environment for this
process only; backend/.env is not modified.

    set AGENTS_LLM_PROVIDER=google & set AGENTS_DEEP_MODEL=gemini-3.5-flash-lite & set AGENTS_QUICK_MODEL=gemini-3.5-flash-lite
    backend\\.venv\\Scripts\\python.exe scripts\\desk_provider_smoke.py AAPL
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(ROOT, "backend"))
sys.path.insert(0, os.getcwd())

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.db.session import SessionFactory, dispose_engine, get_tenant_session  # noqa: E402
from app.db.tenant import bind_organization, mark_session_unscoped  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import agent_desk  # noqa: E402


async def main() -> int:
    ticker = (sys.argv[1] if len(sys.argv) > 1 else "AAPL").upper()
    print(f"provider={settings.AGENTS_LLM_PROVIDER} deep={settings.AGENTS_DEEP_MODEL} quick={settings.AGENTS_QUICK_MODEL}", flush=True)
    async with SessionFactory() as s0:
        mark_session_unscoped(s0.sync_session)
        org = (await s0.execute(select(Organization.id).where(Organization.slug == "meridian-capital"))).scalar_one()
        user = (await s0.execute(select(User.id).where(User.email == "dpark@meridian.com"))).scalar_one()
    day = date.today() - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    async with get_tenant_session(org) as session:
        bind_organization(session.sync_session, org)
        analysis = await agent_desk.create_analysis(
            session, organization_id=org, user_id=user, ticker=ticker, trade_date=day,
            selected_analysts=["market", "sentiment", "news", "fundamentals"],
        )
        analysis = await agent_desk.run_analysis_in_session(session, analysis, interactive=False)
        print("status:", analysis.status.value, "| rating:", analysis.rating, "| trader:", analysis.trader_action)
        print("stages:", [p["stage"] for p in (analysis.progress or [])])
        print("llm calls:", analysis.llm_call_count, "| error:", (analysis.error or "")[:300])
    await dispose_engine()
    return 0 if analysis.status.value == "completed" else 1


sys.exit(asyncio.run(main()))
