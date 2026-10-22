"""Give the Active strategy a documented origin so the "hypotheses -> Active strategies" research
query and the Knowledge Graph lineage are not empty (idempotent).

The Researcher writes the hypothesis note through the real notes API (so it is authored, audited and
searchable like any other note); the Active strategy's ``inspired_by_note_id`` then points at it.
This is demo composition for the seeded Meridian org: the note describes the rule that strategy
actually implements.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\seed_lineage_demo.py [--base http://localhost:8000]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import uuid

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PW = re.search(r'^ADMIN_PASSWORD\s*=\s*"([^"]+)"', open(os.path.join(ROOT, "scripts", "seed_demo_data.py"), encoding="utf-8").read(), re.M).group(1)
os.chdir(os.path.join(ROOT, "backend"))
sys.path.insert(0, os.getcwd())

TITLE = "Hypothesis: pullbacks inside a low-volatility uptrend mean-revert"
NOTE = {
    "title": TITLE,
    "hypothesis": "When SPY is above its 50-day average, a dip in RSI(14) to the mid-40s in a Low-Volatility regime tends to recover within weeks.",
    "method": "Regime-conditioned backtest of 'enter RSI(14) < 45 above SMA50, exit RSI(14) > 60', then walk-forward, Monte Carlo, persistence and stress validation.",
    "content": (
        "Trend-following misses the cheap entries inside an established uptrend, and fading every dip loses money in Bear and Crisis "
        "regimes. The idea: buy only shallow dips (RSI mid-40s) while price holds above the 50-day average, and only trust it where the "
        "regime model says Low-Volatility.\n\nWhat would falsify it: a regime-conditioned Sharpe below zero in Low-Volatility, or a "
        "robustness score under the 0.70 gate.\n\nOutcome: implemented as 'SPY Dip-in-Uptrend RSI 45/60'; it cleared validation and was "
        "approved by Risk with a written justification."
    ),
    "status": "completed",
    "tags": ["mean-reversion", "low-volatility", "spy"],
}


async def link(strategy_id: str, note_id: str) -> None:
    import app.models  # noqa: F401
    from sqlalchemy import select

    from app.db.session import SessionFactory, dispose_engine, get_tenant_session
    from app.db.tenant import bind_organization, mark_session_unscoped
    from app.models.organization import Organization
    from app.models.strategy import Strategy

    async with SessionFactory() as s0:
        mark_session_unscoped(s0.sync_session)
        org = (await s0.execute(select(Organization.id).where(Organization.slug == "meridian-capital"))).scalar_one()
    async with get_tenant_session(org) as session:
        bind_organization(session.sync_session, org)
        s = await session.get(Strategy, uuid.UUID(strategy_id))
        s.inspired_by_note_id = uuid.UUID(note_id)
        await session.commit()
    await dispose_engine()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()
    with httpx.Client(base_url=args.base, timeout=60) as c:
        r = c.post("/auth/login", json={"email": "dpark@meridian.com", "password": PW})
        r.raise_for_status()
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        active =c.get("/strategies", params={"status": "active"}).json()
        active = active.get("items", active)
        if not active:
            print("no active strategy; nothing to link")
            return
        strategy = active[0]
        notes = c.get("/research-notes", params={"limit": 200}).json()
        notes = notes.get("items", notes)
        note = next((n for n in notes if n["title"] == TITLE), None)
        if note is None:
            resp = c.post("/research-notes", json={**NOTE, "related_strategy_ids": [strategy["id"]]})
            resp.raise_for_status()
            note = resp.json()
            print("created note", note["id"])
        else:
            print("note already exists", note["id"])
    asyncio.run(link(strategy["id"], note["id"]))
    print(f"linked '{strategy['name']}' -> note")


if __name__ == "__main__":
    main()
