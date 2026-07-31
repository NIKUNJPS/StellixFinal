"""Load test for the 5 heaviest Stellix Labs endpoints (Batch 17).

Targets, per the batch spec:
  * POST /data/ingest                        (write; enqueues a Celery job)
  * POST /strategies/{id}/validate           (write; enqueues the 5-method suite)
  * POST /evolution/run                      (write; enqueues a GA run)
  * GET  /graph/query/robust-across-regimes  (read)
  * GET  /strategies                         (read)

Target: 50 concurrent users, p95 < 2s on the READ endpoints.

Auth: the demo tenant's own rate limits are real (Batch 11) and part of what we're
measuring — the global per-*user* read budget is 100/min, and the expensive write
endpoints are per-*org* and deliberately small (evolution 5/hr, validate 20/hr,
ingest 10/hr). To exercise the server rather than just the login limiter, we log in
the five seeded Meridian users once at test start and spread requests across their
tokens; requests beyond a user's budget come back as fast 429s (the limiter working),
which we tally separately so the report distinguishes served 200s from shed 429s.

Run headless (from repo root, with the backend up and the demo seeded):
    backend/.venv/Scripts/locust -f tests/load/locustfile.py \
        --headless -u 50 -r 10 -t 60s --host http://localhost:8000
"""

from __future__ import annotations

import os
import random
from collections import Counter

import requests
from locust import HttpUser, between, events, task

PASSWORD = os.environ.get("STELLIX_PASSWORD", "MeridianDemo2026!")
ORG_SLUG = os.environ.get("STELLIX_ORG", "meridian-capital")
EMAILS = os.environ.get(
    "STELLIX_EMAILS",
    "research@meridian.com,dpark@meridian.com,s.okonkwo@meridian.com,"
    "j.whitfield@meridian.com,a.reyes@meridian.com",
).split(",")

# Populated once in on_test_start and read by every simulated user.
_TOKENS: list[str] = []
_STRATEGY_ID: str | None = None

# Honest reporting: locust counts 4xx as "success", so we tally raw status codes
# per endpoint ourselves and print the distribution at the end.
_status_counter: Counter = Counter()


@events.test_start.add_listener
def on_test_start(environment, **_kwargs) -> None:
    global _STRATEGY_ID
    host = (environment.host or "http://localhost:8000").rstrip("/")
    for email in EMAILS:
        try:
            r = requests.post(
                f"{host}/auth/login",
                json={"email": email.strip(), "password": PASSWORD, "organization_slug": ORG_SLUG},
                timeout=10,
            )
            if r.status_code == 200:
                _TOKENS.append(r.json()["access_token"])
            else:
                print(f"[locust] login failed for {email}: {r.status_code} {r.text[:120]}")
        except Exception as exc:  # noqa: BLE001
            print(f"[locust] login error for {email}: {exc}")
    if not _TOKENS:
        raise RuntimeError("No tokens obtained — is the backend up and the demo seeded?")
    # A real strategy id (from the seeded book) for the validate endpoint.
    r = requests.get(
        f"{host}/strategies", headers={"Authorization": f"Bearer {_TOKENS[0]}"}, timeout=10
    )
    items = r.json().get("items", []) if r.status_code == 200 else []
    if items:
        _STRATEGY_ID = items[0]["id"]
    print(f"[locust] authenticated {len(_TOKENS)} user(s); sample strategy_id={_STRATEGY_ID}")


@events.request.add_listener
def _tally(name, response, exception, **_kwargs) -> None:
    code = getattr(response, "status_code", None) if response is not None else None
    _status_counter[(name, code if code is not None else "conn-error")] += 1


@events.test_stop.add_listener
def _report(environment, **_kwargs) -> None:
    print("\n=== response-status distribution by endpoint (200 = served, 429 = rate-limited) ===")
    for (name, code), n in sorted(_status_counter.items()):
        print(f"  {name:44s} {str(code):>4}: {n}")


class StellixUser(HttpUser):
    # A realistic think-time between actions.
    wait_time = between(0.5, 2.0)

    def on_start(self) -> None:
        self.token = random.choice(_TOKENS)
        self.headers = {"Authorization": f"Bearer {self.token}"}

    # ---- READ endpoints (the p95 < 2s target applies here) --------------------
    @task(5)
    def list_strategies(self) -> None:
        with self.client.get(
            "/strategies", headers=self.headers, name="GET /strategies", catch_response=True
        ) as r:
            if r.status_code >= 500:
                r.failure(f"server error {r.status_code}")

    @task(5)
    def robust_across_regimes(self) -> None:
        with self.client.get(
            "/graph/query/robust-across-regimes?min_regimes=4",
            headers=self.headers,
            name="GET /graph/query/robust-across-regimes",
            catch_response=True,
        ) as r:
            if r.status_code >= 500:
                r.failure(f"server error {r.status_code}")

    # ---- WRITE endpoints (async enqueue; per-org limits shed quickly) ---------
    @task(1)
    def ingest(self) -> None:
        with self.client.post(
            "/data/ingest",
            headers=self.headers,
            name="POST /data/ingest",
            json={
                "symbol": "SPY",
                "start_date": "2023-01-01",
                "end_date": "2023-06-30",
                "interval": "1d",
                "provider": "yfinance",
            },
            catch_response=True,
        ) as r:
            if r.status_code >= 500:
                r.failure(f"server error {r.status_code}")

    @task(1)
    def validate(self) -> None:
        if not _STRATEGY_ID:
            return
        with self.client.post(
            f"/strategies/{_STRATEGY_ID}/validate",
            headers=self.headers,
            name="POST /strategies/[id]/validate",
            json={"symbol": "SPY"},
            catch_response=True,
        ) as r:
            if r.status_code >= 500:
                r.failure(f"server error {r.status_code}")

    @task(1)
    def evolution_run(self) -> None:
        with self.client.post(
            "/evolution/run",
            headers=self.headers,
            name="POST /evolution/run",
            json={"symbol": "SPY", "strategy_ids": "all", "ga_config": {}},
            catch_response=True,
        ) as r:
            if r.status_code >= 500:
                r.failure(f"server error {r.status_code}")
