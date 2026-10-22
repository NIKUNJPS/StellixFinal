"""Populate the CIO "Kill Switch Reviews" page with a realistic control-flow history (idempotent).

Uses the real governance API, so the audit log, notifications and review rows are genuine:
  * the Risk Manager emergency-retires two of the weakest *candidate* strategies, with reasons;
  * the CIO acknowledges one of them (a completed review);
  * the other is left awaiting CIO review, so the dual-approval step can be shown live.
Kill switches cannot be undone (by design), so this only targets strategies that already
score far below the 0.70 gate. Safe to re-run: it skips anything already retired/reviewed.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\seed_governance_demo.py [--base http://localhost:8000]
"""
from __future__ import annotations

import argparse
import os
import re

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PW = re.search(r'^ADMIN_PASSWORD\s*=\s*"([^"]+)"', open(os.path.join(ROOT, "scripts", "seed_demo_data.py"), encoding="utf-8").read(), re.M).group(1)

RISK, CIO = "s.okonkwo@meridian.com", "j.whitfield@meridian.com"
# (strategy name, kill reason, CIO note or None to leave pending)
KILLS = [
    ("BTC Momentum",
     "Robustness 0.30 against the 0.70 gate and persistent drawdown in High-Volatility; pulled before it could be proposed for approval.",
     "Agree with the call: it failed the persistence and stress tests. Logged for the failure library; no re-entry without a redesign."),
    ("Gold Crisis Hedge",
     "Hedge logic did not hold in Crisis regimes in back-test (robustness 0.28). Retired to stop further review time being spent on it.",
     None),
]


def login(base: str, email: str) -> httpx.Client:
    c = httpx.Client(base_url=base, timeout=60)
    r = c.post("/auth/login", json={"email": email, "password": PW})
    r.raise_for_status()
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return c


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()
    risk, cio = login(args.base, RISK), login(args.base, CIO)

    strategies = risk.get("/strategies", params={"limit": 200}).json()
    items = strategies.get("items", strategies) if isinstance(strategies, dict) else strategies
    by_name = {s["name"]: s for s in items}
    reviews = cio.get("/governance/kill-switch/reviews").json()["items"]
    review_by_strategy = {r["strategy_id"]: r for r in reviews}

    for name, reason, note in KILLS:
        s = by_name.get(name)
        if not s:
            print(f"{name}: not found, skipped")
            continue
        sid = s["id"]
        if sid not in review_by_strategy:
            if s["status"] == "retired":
                print(f"{name}: already retired, skipped")
                continue
            r = risk.post(f"/governance/kill-switch/{sid}", json={"reason": reason})
            print(f"{name}: kill switch -> HTTP {r.status_code}")
            if r.status_code >= 400:
                print("   ", r.text[:160])
                continue
            reviews = cio.get("/governance/kill-switch/reviews").json()["items"]
            review_by_strategy = {x["strategy_id"]: x for x in reviews}
        rev = review_by_strategy.get(sid)
        if rev and note and not rev.get("reviewed_at") and not rev.get("is_self_reviewed"):
            r = cio.post(f"/governance/kill-switch/reviews/{rev['id']}/acknowledge", json={"note": note})
            print(f"{name}: CIO acknowledged -> HTTP {r.status_code}")
        elif rev:
            print(f"{name}: review present ({'pending' if not rev.get('reviewed_at') else 'reviewed'})")


if __name__ == "__main__":
    main()
