"""Read-only API sweep: log in as each demo role and GET every parameterless endpoint.

Reports HTTP errors and responses that are empty (the pages most likely to look blank in a
demo). It only issues GET requests, never prints credentials, and logs in with the seeded
demo accounts from scripts/seed_demo_data.py.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\api_sweep.py [--role researcher] [--base http://localhost:8000]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = open(os.path.join(ROOT, "scripts", "seed_demo_data.py"), encoding="utf-8").read()
ADMIN_PW = re.search(r'^ADMIN_PASSWORD\s*=\s*"([^"]+)"', SEED, re.M).group(1)
TEAM_PW = "MeridianDemo2026!" if "MeridianDemo2026!" in SEED else ADMIN_PW

ROLES = {
    "researcher": "dpark@meridian.com",
    "quant": "quant@meridian.com",
    "risk": "s.okonkwo@meridian.com",
    "cio": "j.whitfield@meridian.com",
    "compliance": "a.reyes@meridian.com",
    "admin": "research@meridian.com",
}
SKIP = ("/auth/", "/health", "/stream", "/export", "/logout", "/docs", "/openapi", "/metrics", "/billing/portal")


def emptiness(body) -> str | None:
    if body in (None, [], {}, ""):
        return "empty"
    if isinstance(body, dict):
        for k in ("items", "results", "data", "rows", "cells", "clusters", "strategies", "failures", "notes", "signals", "members"):
            if k in body and body[k] in ([], None):
                return f"empty:{k}"
        if body.get("total") == 0 or body.get("count") == 0:
            return "empty:total=0"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", default="researcher", choices=list(ROLES))
    ap.add_argument("--base", default="http://localhost:8000")
    a = ap.parse_args()
    with httpx.Client(base_url=a.base, timeout=60) as c:
        spec = c.get("/openapi.json").json()
        email = ROLES[a.role]
        pw = ADMIN_PW if a.role == "admin" else TEAM_PW
        for prefix in ("/api/v1", ""):
            r = c.post(f"{prefix}/auth/login", json={"email": email, "password": pw})
            if r.status_code == 200:
                break
        if r.status_code != 200 or "access_token" not in r.json():
            print(f"login failed for {a.role}: HTTP {r.status_code}")
            return 2
        c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        paths = sorted(
            p for p, ops in spec["paths"].items()
            if "get" in ops and "{" not in p and not any(s in p for s in SKIP)
            and not [q for q in ops["get"].get("parameters", []) if q.get("required")]
        )
        bad = empty = ok = 0
        print(f"role={a.role}  endpoints={len(paths)}")
        for p in paths:
            try:
                resp = c.get(p)
            except Exception as exc:  # noqa: BLE001
                print(f"  ERR   {p}  {type(exc).__name__}")
                bad += 1
                continue
            if resp.status_code >= 400:
                if resp.status_code in (401, 403):
                    continue  # not permitted for this role - expected
                bad += 1
                print(f"  {resp.status_code}  {p}  {resp.text[:110]!r}")
                continue
            try:
                body = resp.json()
            except json.JSONDecodeError:
                ok += 1
                continue
            why = emptiness(body)
            if why:
                empty += 1
                print(f"  EMPTY {p}  ({why})")
            else:
                ok += 1
        print(f"summary: ok={ok} empty={empty} errors={bad}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
