"""Resume an Agent Desk backtest whose worker died mid-run (idempotent).

1. Retries any cell left in 'running' (it resumes from its LangGraph checkpoint).
2. Aligns the run's completed_cells counter with the cells that really completed (the run loop only
   counts cells it ran itself, so a cell finished by a retry would otherwise be uncounted).
3. Re-queues the backtest task; the loop skips every date that already has a cell.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\resume_agent_backtest.py [--run-id <uuid>] [--base http://localhost:8000]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import time
import uuid

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PW = re.search(r'^ADMIN_PASSWORD\s*=\s*"([^"]+)"', open(os.path.join(ROOT, "scripts", "seed_demo_data.py"), encoding="utf-8").read(), re.M).group(1)
os.chdir(os.path.join(ROOT, "backend"))
sys.path.insert(0, os.getcwd())


async def align_counter(run_id: str, completed: int) -> str:
    import app.models  # noqa: F401
    from sqlalchemy import select

    from app.db.session import SessionFactory, dispose_engine, get_tenant_session
    from app.db.tenant import bind_organization, mark_session_unscoped
    from app.models.agent_analysis import AgentBacktestRun

    async with SessionFactory() as s0:
        mark_session_unscoped(s0.sync_session)
        org = (await s0.execute(select(AgentBacktestRun.organization_id).where(AgentBacktestRun.id == uuid.UUID(run_id)))).scalar_one()
    async with get_tenant_session(org) as session:
        bind_organization(session.sync_session, org)
        run = await session.get(AgentBacktestRun, uuid.UUID(run_id))
        run.completed_cells = completed
        await session.commit()
    await dispose_engine()
    return str(org)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id")
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()
    with httpx.Client(base_url=args.base, timeout=90) as c:
        r = c.post("/auth/login", json={"email": "dpark@meridian.com", "password": PW})
        r.raise_for_status()
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        run = next(i for i in c.get("/agents/backtests").json()["items"] if not args.run_id or i["id"] == args.run_id)
        run_id = run["id"]
        if run["status"] == "completed":
            print("run already completed")
            return
        cells = c.get(f"/agents/backtests/{run_id}").json().get("cells", [])
        for cell in [x for x in cells if x["status"] in ("running", "queued")]:
            resp = c.post(f"/agents/analyses/{cell['id']}/retry")
            print(f"retry {cell['trade_date']}: HTTP {resp.status_code}", flush=True)
        deadline = time.time() + 20 * 60
        while time.time() < deadline:
            cells = c.get(f"/agents/backtests/{run_id}").json().get("cells", [])
            if not [x for x in cells if x["status"] in ("running", "queued")]:
                break
            time.sleep(15)
        done = sum(1 for x in cells if x["status"] == "completed")
        print(f"cells completed so far: {done}", flush=True)
    org = asyncio.run(align_counter(run_id, done))
    from app.worker.tasks import run_agent_backtest_task

    run_agent_backtest_task.delay(organization_id=org, run_id=run_id, request_id=None)
    print("backtest task re-queued for the remaining dates", flush=True)


if __name__ == "__main__":
    main()
