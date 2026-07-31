"""API usage meter (Batch 21) — GET /usage/rate-limits reports REAL Redis
token-bucket state for the same limiter instances the dependencies enforce.

Hermetic: real local Redis, fresh per-org buckets, no live network calls. Tokens are
consumed by calling the limiter instance directly (the router-wide global limiter is
disabled by the client fixture), which is exactly what a real request would do.
"""

from __future__ import annotations

from app.core.rate_limit import AUTHENTICATED_LIMITERS

from tests.helpers import bearer, register_org


async def test_usage_rate_limits_returns_real_bucket_state(client, db_session_factory):
    token, org_id = await register_org(client, org_name="UsageCo", email="u@usage.co")

    # Baseline: a brand-new org has full buckets, nothing used.
    resp = await client.get("/usage/rate-limits", headers=bearer(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tier"] == "starter"
    assert body["rate_multiplier"] == 1.0

    eps = body["endpoints"]
    # Every authenticated limiter category is present with its real config numbers.
    assert eps["Data ingestion"]["limit"] == 10
    assert eps["Data ingestion"]["window_seconds"] == 3600
    assert eps["Backtests"]["limit"] == 30
    assert eps["Validations"]["limit"] == 20
    assert eps["Evolution runs"]["limit"] == 5
    assert eps["LLM calls"]["limit"] == 50
    assert eps["Global requests"]["limit"] == 100
    assert eps["Data ingestion"]["used"] == 0
    # No fabricated LLM budget block.
    assert "llm_budget" not in body

    # Consume 3 ingest tokens against the SAME limiter instance the meter reads.
    limiter = AUTHENTICATED_LIMITERS["data:ingest"]["limiter"]
    for _ in range(3):
        await limiter.check(str(org_id))

    resp2 = await client.get("/usage/rate-limits", headers=bearer(token))
    eps2 = resp2.json()["endpoints"]
    assert eps2["Data ingestion"]["used"] == 3
    assert eps2["Data ingestion"]["remaining"] == 7
    assert eps2["Data ingestion"]["resets_in_seconds"] > 0
