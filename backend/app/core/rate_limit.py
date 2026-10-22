"""Configured rate limiters (Batch 11) — Redis-backed token buckets.

Batch 1 shipped an in-process, per-IP-only limiter for /auth/login and
/auth/register (documented there as a single-instance stopgap). This module
replaces it with Redis-distributed token buckets (see app/core/token_bucket.py)
and adds the limiter categories from the Batch 11 spec: a global per-authenticated
-user default, a per-account login limiter (independent of per-IP, so distributed
credential stuffing against ONE account from many IPs still gets caught), and
per-organization limiters for the expensive endpoints — all organization-tier
aware (Enterprise gets a 5x multiplier; see docs/schemas.md "Rate limiting").

Every limiter here is a FastAPI dependency; tests disable one via
``app.dependency_overrides[some_limiter] = lambda: None``, unchanged from the
Batch 1 convention.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_system_db
from app.core.security import TokenError, decode_access_token
from app.core.token_bucket import (
    RedisTokenBucketLimiter,
    get_org_rate_multiplier,
    login_account_limiter,
    per_ip_limiter,
)

# --------------------------------------------------------------------------- #
# Auth endpoints (pre-auth — no JWT exists yet, so these are IP- or
# account-email-keyed, never user_id-keyed)
# --------------------------------------------------------------------------- #
login_rate_limiter = per_ip_limiter(capacity=5, window_seconds=60, scope="auth:login:ip")
register_rate_limiter = per_ip_limiter(capacity=3, window_seconds=60, scope="auth:register:ip")
login_account_rate_limiter = login_account_limiter(capacity=5, window_seconds=60, scope="auth:login:account")
# Batch 15: public demo-request form — no JWT (anonymous visitor), so IP-keyed
# like the auth limiters. 5/min/IP blunts form-spam without hurting real users.
demo_request_rate_limiter = per_ip_limiter(capacity=5, window_seconds=60, scope="contact:demo:ip")


# --------------------------------------------------------------------------- #
# Authenticated-request limiters (JWT-keyed): global default + per-org
# expensive-endpoint limits. Both read the Bearer token directly (not via
# app.api.deps.get_current_user) to keep this module free of any dependency on
# app.api — if the token is missing/invalid, the dependency no-ops and lets the
# route's own auth dependency 401 it; a rate limiter should never be the thing
# that decides a request is unauthenticated.
# --------------------------------------------------------------------------- #
async def _bearer_payload(request: Request) -> dict | None:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):]
    try:
        return decode_access_token(token)
    except TokenError:
        return None


# Registry of authenticated (user/org-keyed) limiters so the usage meter
# (GET /usage/rate-limits, Batch 21) can report REAL bucket state for the very same
# limiter instances the dependencies enforce — no duplicated capacity/window
# constants that could drift. scope -> {limiter, category, keyed_by}.
AUTHENTICATED_LIMITERS: dict[str, dict] = {}


def per_user_limiter(
    *, capacity: int, window_seconds: float, scope: str, category: str | None = None
) -> Callable[..., Awaitable[None]]:
    """Keyed by user_id, tier-scaled by the caller's organization."""
    limiter = RedisTokenBucketLimiter(capacity=capacity, refill_period_seconds=window_seconds, scope=scope)
    AUTHENTICATED_LIMITERS[scope] = {
        "limiter": limiter, "category": category or scope, "keyed_by": "user",
    }

    async def _dependency(request: Request, db: AsyncSession = Depends(get_system_db)) -> None:
        payload = await _bearer_payload(request)
        if payload is None:
            return
        multiplier = await get_org_rate_multiplier(db, uuid.UUID(payload["org"]))
        await limiter.check(payload["sub"], multiplier=multiplier)

    return _dependency


def per_org_limiter(
    *, capacity: int, window_seconds: float, scope: str, category: str | None = None
) -> Callable[..., Awaitable[None]]:
    """Keyed by organization_id, tier-scaled — for endpoints that cost real
    money/compute per call regardless of which user in the org triggers it."""
    limiter = RedisTokenBucketLimiter(capacity=capacity, refill_period_seconds=window_seconds, scope=scope)
    AUTHENTICATED_LIMITERS[scope] = {
        "limiter": limiter, "category": category or scope, "keyed_by": "org",
    }

    async def _dependency(request: Request, db: AsyncSession = Depends(get_system_db)) -> None:
        payload = await _bearer_payload(request)
        if payload is None:
            return
        org_id = payload["org"]
        multiplier = await get_org_rate_multiplier(db, uuid.UUID(org_id))
        await limiter.check(org_id, multiplier=multiplier)

    return _dependency


# Global default: 100 req/min per authenticated user (Enterprise: 500/min).
# Applied router-wide (see app/api/router.py) rather than per-route, so it
# automatically covers every authenticated feature endpoint without needing to
# remember to wire it into new routes later.
global_rate_limiter = per_user_limiter(
    capacity=100, window_seconds=60, scope="global", category="Global requests"
)

# Expensive per-org endpoints — each costs real compute/API budget per call.
ingest_rate_limiter = per_org_limiter(
    capacity=10, window_seconds=3600, scope="data:ingest", category="Data ingestion"
)
backtest_rate_limiter = per_org_limiter(
    capacity=30, window_seconds=3600, scope="strategy:backtest", category="Backtests"
)
validate_rate_limiter = per_org_limiter(
    capacity=20, window_seconds=3600, scope="strategy:validate", category="Validations"
)
evolution_run_rate_limiter = per_org_limiter(
    capacity=5, window_seconds=3600, scope="evolution:run", category="Evolution runs"
)
llm_rate_limiter = per_org_limiter(
    capacity=50, window_seconds=3600, scope="llm", category="LLM calls"
)
# Batch 30: one multi-agent desk run is dozens of LLM calls (a backtest, many runs).
agent_run_rate_limiter = per_org_limiter(
    capacity=20, window_seconds=3600, scope="agents:run", category="Agent desk runs"
)
