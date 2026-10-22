"""Load test for the Stellix Labs API (Batch 23).

Exercises the REAL authenticated read surface as a logged-in analyst would browse it,
against the REAL stack (Postgres/TimescaleDB, Redis). Run headless:

    # 1. start the backend
    backend/.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
    # 2. make sure the Meridian demo org is seeded
    backend/.venv/Scripts/python.exe scripts/seed_demo_data.py   # (idempotent)
    # 3. run locust
    locust -f tests/load/locustfile.py --headless -u 20 -r 5 --run-time 60s \
        --host http://localhost:8000

Auth (Batch 24): register() now returns 202 (pending approval) and cannot log in, so
this uses a PRE-APPROVED seed user (Meridian Capital, from scripts/seed_demo_data.py).
The org is ACTIVE, so the org-status gate (Batch 24) lets every request through.

LLM note: the LLM lane is weighted 1 (lowest) and deliberately hits the CHEAP,
admin-only ``GET /llm/audit-log`` — which goes through the same per-org LLM rate
limiter — rather than a real ``POST /llm/hypothesis`` generation. A real generation
would (a) incur provider cost when ANTHROPIC_API_KEY/GEMINI_API_KEY are set and (b)
take multiple seconds, badly skewing the latency percentiles. The router path is still
exercised; the token-spend is not.
"""

from __future__ import annotations

import threading

import requests
from locust import HttpUser, between, task

# The five pre-approved Meridian seed users (scripts/seed_demo_data.py). We spread the
# simulated users across all five so each hits its OWN per-user rate-limit bucket:
# the global limiter is 100 req/min PER USER (Batch 11), so 20 users on ONE token would
# (correctly) 429 as soon as that single quota is spent — a test artifact, since in
# production 20 users are 20 distinct tokens with 20 separate buckets. Index 0 (admin)
# is used for the admin-only LLM audit-log read. Password is shared across the seed set.
MERIDIAN_USERS = [
    "research@meridian.com",     # 0 — admin  (can read /llm/audit-log)
    "dpark@meridian.com",        # 1 — researcher
    "s.okonkwo@meridian.com",    # 2 — risk manager
    "j.whitfield@meridian.com",  # 3 — CIO
    "a.reyes@meridian.com",      # 4 — compliance (can read /llm/audit-log)
]
MERIDIAN_PASSWORD = "MeridianDemo2026!"
_LLM_CAPABLE = {0, 4}  # admin + compliance roles can read the LLM audit log

# Meridian has real stored regime history for these four (Batch 22 cross-asset).
CROSS_ASSET_SYMBOLS = "SPY,QQQ,GLD,BTC-USD"

# Fetch each token exactly once (through plain requests, not locust), so the login
# endpoint's own per-IP limiter isn't what we measure. Five distinct-account logins
# from one IP sit exactly at the 5/min per-IP allowance.
_token_lock = threading.Lock()
_tokens: list[str] = []
_user_counter = 0


def _all_tokens(host: str) -> list[str]:
    global _tokens
    with _token_lock:
        if not _tokens:
            for email in MERIDIAN_USERS:
                r = requests.post(
                    f"{host}/auth/login",
                    json={"email": email, "password": MERIDIAN_PASSWORD},
                    timeout=30,
                )
                if r.status_code == 200:
                    _tokens.append(r.json().get("access_token"))
        return _tokens


class RegularUser(HttpUser):
    """A logged-in analyst browsing the platform's read surface."""

    wait_time = between(1, 3)

    def on_start(self) -> None:
        global _user_counter
        tokens = _all_tokens(self.host)
        if not tokens:  # pragma: no cover - only when the seed org is missing
            print("LOGIN FAILED — run scripts/seed_demo_data.py to seed Meridian Capital")
            self.token = None
            self.user_index = -1
            return
        with _token_lock:
            self.user_index = _user_counter % len(tokens)
            _user_counter += 1
        self.token = tokens[self.user_index]
        self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    def _get(self, path: str, name: str | None = None) -> None:
        if not self.token:
            return
        self.client.get(path, name=name or path)

    @task(10)
    def view_strategies(self) -> None:
        self._get("/strategies")

    @task(8)
    def view_regime(self) -> None:
        self._get("/regimes/current?symbol=SPY", name="/regimes/current")

    @task(5)
    def view_portfolio(self) -> None:  # Batch 20
        self._get("/portfolio/overview")

    @task(4)
    def view_cross_asset_regime(self) -> None:  # Batch 22
        self._get(f"/regimes/cross-asset?symbols={CROSS_ASSET_SYMBOLS}", name="/regimes/cross-asset")

    @task(3)
    def view_failures(self) -> None:
        self._get("/failures", name="/failures")

    @task(3)
    def view_knowledge_graph(self) -> None:
        self._get("/graph/query/robust-across-regimes?min_regimes=4", name="/graph/query/robust-across-regimes")

    @task(2)
    def view_usage_meter(self) -> None:  # Batch 21
        self._get("/usage/rate-limits")

    @task(1)
    def llm_router_path(self) -> None:  # Batch 18 — cheap LLM-lane read, no provider spend
        # /llm/audit-log is admin/compliance-only (RBAC); only fire it for a capable
        # token so we exercise the real endpoint without generating expected 403s.
        if self.user_index in _LLM_CAPABLE:
            self._get("/llm/audit-log", name="/llm/audit-log")
