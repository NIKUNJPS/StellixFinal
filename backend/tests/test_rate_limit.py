"""Rate-limiting tests (Batch 11): one test per limiter category, confirming the
(capacity+1)th request in a tight burst gets 429, and a dedicated test for the
429 response contract (Retry-After header + explanatory JSON body). Also covers
the Enterprise-tier multiplier (Batch 11 spec: 5x every tier-aware limiter).

Auth limiters (login/register, IP- and account-keyed) share a fixed synthetic
client IP under ``ASGITransport``, so they use ``rate_limited_client`` (which
resets their Redis state before/after each test). Every other limiter here is
keyed by a real user_id/organization_id — each test registers a brand-new org,
so the bucket key has never been touched before and needs no explicit reset.

Every burst test freezes ``time.time()`` for the duration of the burst. The
token bucket refills continuously based on real elapsed wall-clock time
(``app/core/token_bucket.py``'s Lua script) — for a large-capacity limiter like
``global`` (100 tokens / 60s = ~1.67 tokens/sec refill), just the real time 100
sequential ASGI round-trips take is enough to refill a token before request
101 fires, making an un-frozen test genuinely flaky rather than "eventually
always passes." Freezing time removes that timing dependency entirely instead
of papering over it with a looser assertion.
"""

from __future__ import annotations

from app.core.rate_limit import (
    backtest_rate_limiter,
    evolution_run_rate_limiter,
    global_rate_limiter,
    ingest_rate_limiter,
    llm_rate_limiter,
    validate_rate_limiter,
)
from app.models.organization import OrganizationTier

from tests.conftest import enable_limiter
from tests.helpers import bearer, create_org_user, login, register, register_activate_login


def _freeze_time(monkeypatch) -> None:
    monkeypatch.setattr("app.core.token_bucket.time.time", lambda: 1_700_000_000.0)


async def test_login_is_rate_limited_per_ip(rate_limited_client, monkeypatch):
    _freeze_time(monkeypatch)
    statuses = []
    for _ in range(6):
        resp = await rate_limited_client.post(
            "/auth/login",
            json={"email": "nobody@nowhere.com", "password": "whatever1234"},
        )
        statuses.append(resp.status_code)

    # First 5 pass the limiter (and return 401 invalid-creds); the 6th is throttled.
    assert statuses[:5] == [401, 401, 401, 401, 401]
    assert statuses[5] == 429


async def test_429_response_has_retry_after_header_and_explanatory_body(rate_limited_client, monkeypatch):
    _freeze_time(monkeypatch)
    for _ in range(5):
        await rate_limited_client.post(
            "/auth/login", json={"email": "nobody@nowhere.com", "password": "whatever1234"}
        )
    resp = await rate_limited_client.post(
        "/auth/login", json={"email": "nobody@nowhere.com", "password": "whatever1234"}
    )
    assert resp.status_code == 429
    assert "retry-after" in resp.headers
    assert int(resp.headers["retry-after"]) >= 1
    body = resp.json()["detail"]
    assert body["error"] == "rate_limit_exceeded"
    assert body["limit"] == "auth:login:ip"
    assert "message" in body


async def test_register_is_rate_limited_per_ip_at_3(rate_limited_client, monkeypatch):
    _freeze_time(monkeypatch)
    statuses = []
    for i in range(4):
        resp = await rate_limited_client.post(
            "/auth/register",
            json={
                "organization_name": f"RegCo{i}",
                "email": f"reg{i}@regco.com",
                "password": "goodpass123",
            },
        )
        statuses.append(resp.status_code)

    # Batch 24: register now returns 202 (pending approval), not 201.
    assert statuses[:3] == [202, 202, 202]
    assert statuses[3] == 429


async def test_login_account_limiter_catches_distributed_ip_attack(rate_limited_client, monkeypatch):
    """Same target account, a DIFFERENT source IP on every request (so the
    per-IP limiter never trips) — only the per-account limiter should catch this."""
    _freeze_time(monkeypatch)
    await register(
        rate_limited_client, org_name="LoginAcctCo", email="victim@acct.co", password="goodpass123"
    )
    statuses = []
    for i in range(6):
        resp = await rate_limited_client.post(
            "/auth/login",
            json={"email": "victim@acct.co", "password": "wrongpass1"},
            headers={"X-Forwarded-For": f"10.0.0.{i}"},
        )
        statuses.append(resp.status_code)

    assert statuses[:5] == [401, 401, 401, 401, 401]
    assert statuses[5] == 429


async def test_global_rate_limiter_enforced_for_authenticated_user(client, monkeypatch):
    _freeze_time(monkeypatch)
    enable_limiter(global_rate_limiter)
    token = await _register_and_get_token(client, "GlobalCo", "global@co.com")

    statuses = []
    for _ in range(101):
        resp = await client.get("/strategies", headers=bearer(token))
        statuses.append(resp.status_code)

    assert all(s == 200 for s in statuses[:100])
    assert statuses[100] == 429


async def test_ingest_rate_limiter_enforced(client, monkeypatch):
    _freeze_time(monkeypatch)
    enable_limiter(ingest_rate_limiter)
    token = await _register_and_get_token(client, "IngestCo", "ingest@co.com")

    statuses = []
    for _ in range(11):
        resp = await client.post(
            "/data/ingest",
            json={
                "symbol": "AAPL",
                "start_date": "2024-01-01",
                "end_date": "2024-06-01",
                "interval": "1d",
                "provider": "yfinance",
            },
            headers=bearer(token),
        )
        statuses.append(resp.status_code)

    assert all(s == 202 for s in statuses[:10])
    assert statuses[10] == 429


async def test_backtest_rate_limiter_enforced(client, monkeypatch):
    _freeze_time(monkeypatch)
    enable_limiter(backtest_rate_limiter)
    token = await _register_and_get_token(client, "BacktestCo", "backtest@co.com")
    fake_strategy_id = "00000000-0000-0000-0000-000000000001"

    statuses = []
    for _ in range(31):
        resp = await client.post(
            f"/strategies/{fake_strategy_id}/backtest",
            json={"symbol": "AAPL"},
            headers=bearer(token),
        )
        statuses.append(resp.status_code)

    # The strategy doesn't exist, so every allowed request 404s — that still
    # proves the limiter let it through to the handler, which is what matters here.
    assert all(s == 404 for s in statuses[:30])
    assert statuses[30] == 429


async def test_validate_rate_limiter_enforced(client, monkeypatch):
    _freeze_time(monkeypatch)
    enable_limiter(validate_rate_limiter)
    token = await _register_and_get_token(client, "ValidateCo", "validate@co.com")
    fake_strategy_id = "00000000-0000-0000-0000-000000000002"

    statuses = []
    for _ in range(21):
        resp = await client.post(
            f"/strategies/{fake_strategy_id}/validate",
            json={"symbol": "AAPL"},
            headers=bearer(token),
        )
        statuses.append(resp.status_code)

    assert all(s == 404 for s in statuses[:20])
    assert statuses[20] == 429


async def test_evolution_run_rate_limiter_enforced(client, monkeypatch):
    _freeze_time(monkeypatch)
    enable_limiter(evolution_run_rate_limiter)
    token = await _register_and_get_token(client, "EvoCo", "evo@co.com")

    statuses = []
    for _ in range(6):
        resp = await client.post(
            "/evolution/run", json={"symbol": "AAPL"}, headers=bearer(token)
        )
        statuses.append(resp.status_code)

    assert all(s == 202 for s in statuses[:5])
    assert statuses[5] == 429


async def test_llm_rate_limiter_enforced(client, monkeypatch):
    """Wired router-wide onto every /llm/* route (Batch 11) — exercised here via
    the cheap admin-only audit-log GET so the test doesn't need a real Anthropic
    API key, since the rate-limit dependency runs before the handler regardless
    of what the handler would do."""
    _freeze_time(monkeypatch)
    enable_limiter(llm_rate_limiter)
    # register() makes the org's first user an ADMIN, satisfying /llm/audit-log's
    # require_role(ADMIN, COMPLIANCE_OFFICER).
    token = await _register_and_get_token(client, "LlmCo", "llm@co.com")

    statuses = []
    for _ in range(51):
        resp = await client.get("/llm/audit-log", headers=bearer(token))
        statuses.append(resp.status_code)

    assert all(s == 200 for s in statuses[:50])
    assert statuses[50] == 429


async def test_enterprise_tier_gets_higher_multiplier(client, db_session_factory, monkeypatch):
    """Same limiter (ingest, base capacity 10), two orgs differing only in tier:
    Starter is throttled at request 11; Enterprise's 5x multiplier (capacity 50)
    lets all 11 through."""
    _freeze_time(monkeypatch)
    enable_limiter(ingest_rate_limiter)

    await create_org_user(
        db_session_factory, org_name="StarterCo", slug="starter-co",
        email="starter@co.com", tier=OrganizationTier.STARTER,
    )
    starter_token = (await login(client, email="starter@co.com")).json()["access_token"]

    await create_org_user(
        db_session_factory, org_name="EnterpriseCo", slug="enterprise-co",
        email="ent@co.com", tier=OrganizationTier.ENTERPRISE,
    )
    enterprise_token = (await login(client, email="ent@co.com")).json()["access_token"]

    ingest_body = {
        "symbol": "AAPL",
        "start_date": "2024-01-01",
        "end_date": "2024-06-01",
        "interval": "1d",
        "provider": "yfinance",
    }

    starter_statuses = [
        (await client.post("/data/ingest", json=ingest_body, headers=bearer(starter_token))).status_code
        for _ in range(11)
    ]
    assert starter_statuses[10] == 429

    enterprise_statuses = [
        (await client.post("/data/ingest", json=ingest_body, headers=bearer(enterprise_token))).status_code
        for _ in range(11)
    ]
    assert all(s == 202 for s in enterprise_statuses)


async def _register_and_get_token(client, org_name: str, email: str) -> str:
    # Batch 24: register → activate → login to get a usable token for an active org.
    resp = await register_activate_login(
        client, org_name=org_name, email=email, password="goodpass123"
    )
    return resp.json()["access_token"]
