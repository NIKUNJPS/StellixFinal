"""Redis-backed token-bucket rate limiter (Batch 11).

Replaces Batch 1's ``InMemoryRateLimiter`` (documented there as a single-process
stopgap). A token bucket — not a fixed-window counter — is used so a legitimate
burst up to the bucket's capacity is allowed, with a steady refill afterward,
rather than a hard cliff at a window boundary. The check-and-decrement runs as one
atomic Redis Lua script (``EVAL``), so concurrent requests against the same key
can't race between "read tokens" and "write back the decremented value" — the
classic bug in a naive GET-then-SET Redis rate limiter.

Every limiter is a FastAPI dependency (an async callable), matching the existing
Batch 1 convention — tests disable one via
``app.dependency_overrides[some_limiter] = lambda: None``.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients import redis_client
from app.models.organization import Organization, OrganizationTier

# KEYS[1] = bucket hash key
# ARGV[1] = capacity (max tokens = burst allowance)
# ARGV[2] = refill_rate (tokens/second)
# ARGV[3] = now (unix seconds, float)
# ARGV[4] = requested tokens (always 1 here)
# ARGV[5] = key TTL seconds (so an idle bucket doesn't linger in Redis forever)
# Returns {allowed(0/1), tokens_remaining, retry_after_seconds}
_TOKEN_BUCKET_LUA = """
local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local tokens = tonumber(bucket[1])
local last_ts = tonumber(bucket[2])
if tokens == nil then
  tokens = capacity
  last_ts = now
end

local elapsed = now - last_ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill_rate)

local allowed = 0
local retry_after = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  retry_after = math.ceil((requested - tokens) / refill_rate)
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], ttl)

return {allowed, tokens, retry_after}
"""


def _rate_limit_exceeded(*, scope: str, retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "error": "rate_limit_exceeded",
            "limit": scope,
            "message": f"Rate limit exceeded for '{scope}'. Try again shortly.",
        },
        headers={"Retry-After": str(max(int(retry_after), 1))},
    )


class RedisTokenBucketLimiter:
    """One bucket definition (capacity + refill period + scope name). ``check()``
    is called per-request with the caller-resolved key (IP, email, user_id, or
    organization_id) and an optional tier multiplier."""

    def __init__(self, *, capacity: int, refill_period_seconds: float, scope: str) -> None:
        self.capacity = capacity
        self.refill_rate = capacity / refill_period_seconds  # tokens per second
        self.scope = scope
        self._script = None

    def _get_script(self, redis: Redis):
        # register_script() does no I/O — it just wraps the script text with a
        # locally-computed SHA1, so this cache is cheap to rebuild. It MUST be
        # rebuilt if the client changed, though: Script.__call__() defaults to
        # `self.registered_client` (whatever client was passed in here), not
        # whatever redis_client.get_client() returns now — so caching this
        # keyed only on "have we ever built one" would silently keep issuing
        # commands against a stale/closed client after a reconnect.
        if self._script is None or self._script.registered_client is not redis:
            self._script = redis.register_script(_TOKEN_BUCKET_LUA)
        return self._script

    async def check(self, key: str, *, multiplier: float = 1.0) -> None:
        redis = redis_client.get_client()
        script = self._get_script(redis)
        capacity = self.capacity * multiplier
        refill_rate = self.refill_rate * multiplier
        now = time.time()
        # Generous TTL (two full refills' worth) so an idle key expires instead of
        # accumulating in Redis forever, without expiring mid-burst.
        ttl = int((capacity / refill_rate) * 2) + 10
        allowed, _tokens_remaining, retry_after = await script(
            keys=[f"ratelimit:{self.scope}:{key}"],
            args=[capacity, refill_rate, now, 1, ttl],
            client=redis,
        )
        if not allowed:
            raise _rate_limit_exceeded(scope=self.scope, retry_after=retry_after)

    async def peek(self, key: str, *, multiplier: float = 1.0) -> dict:
        """Read the current bucket state WITHOUT consuming a token (Batch 21 usage
        meter). Applies the SAME refill math as the Lua script so the reported
        ``used`` matches what a real request would see; a missing key means a full
        bucket (nothing used yet). Never writes back."""
        redis = redis_client.get_client()
        capacity = self.capacity * multiplier
        refill_rate = self.refill_rate * multiplier
        now = time.time()
        tokens_raw, ts_raw = await redis.hmget(
            f"ratelimit:{self.scope}:{key}", "tokens", "ts"
        )
        if tokens_raw is None:
            tokens = capacity
        else:
            tokens = float(tokens_raw)
            last_ts = float(ts_raw) if ts_raw is not None else now
            elapsed = max(0.0, now - last_ts)
            tokens = min(capacity, tokens + elapsed * refill_rate)
        used = max(0.0, capacity - tokens)
        # Seconds until the bucket refills to full (usage returns to 0).
        resets_in = 0 if used <= 0 else int(round(used / refill_rate))
        return {
            "limit": int(round(capacity)),
            "window_seconds": int(round(capacity / refill_rate)),
            "used": int(round(used)),
            "remaining": int(round(tokens)),
            "resets_in_seconds": resets_in,
        }


# --------------------------------------------------------------------------- #
# Org-tier rate multiplier (Enterprise gets 5x; Starter/Pro get the baseline).
# Cached in Redis (60s TTL) so a hot rate-limited path doesn't cost a Postgres
# round-trip per request — only once per org per minute. Fails open to the
# baseline (1x) multiplier if the org can't be found, rather than 500ing a
# request over a rate-limiter implementation detail.
# --------------------------------------------------------------------------- #
_TIER_MULTIPLIERS: dict[OrganizationTier, float] = {
    OrganizationTier.STARTER: 1.0,
    OrganizationTier.PRO: 1.0,
    OrganizationTier.ENTERPRISE: 5.0,
}


async def get_org_rate_multiplier(db: AsyncSession, organization_id: uuid.UUID) -> float:
    """``db`` comes from the caller's own ``Depends(get_system_db)`` (see
    ``per_user_limiter``/``per_org_limiter`` in rate_limit.py) rather than this
    module opening its own session — so tests can override it exactly like any
    other route dependency, instead of needing to monkeypatch a hardcoded
    system-session import."""
    redis = redis_client.get_client()
    cache_key = f"org_tier:{organization_id}"
    cached = await redis.get(cache_key)
    if cached:
        try:
            return _TIER_MULTIPLIERS[OrganizationTier(cached)]
        except ValueError:
            pass  # stale/corrupt cache value — fall through to a fresh lookup

    tier = (
        await db.execute(select(Organization.tier).where(Organization.id == organization_id))
    ).scalar_one_or_none()
    tier = tier or OrganizationTier.STARTER
    await redis.set(cache_key, tier.value, ex=60)
    return _TIER_MULTIPLIERS[tier]


# --------------------------------------------------------------------------- #
# Key extraction helpers
# --------------------------------------------------------------------------- #
def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


KeyFunc = Callable[[Request], Awaitable[str | None]]


async def _ip_key(request: Request) -> str:
    return client_ip(request)


async def _login_account_key(request: Request) -> str | None:
    """Keyed by the email in the login request body — protects one account from
    distributed-IP credential stuffing, independent of the per-IP limiter."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 — malformed body; let normal 422 validation handle it
        return None
    email = str(body.get("email") or "").strip().lower()
    return email or None


def per_ip_limiter(*, capacity: int, window_seconds: float, scope: str) -> Callable[..., Awaitable[None]]:
    """Pre-auth dependency: rate-limit by client IP (no JWT/org context yet)."""
    limiter = RedisTokenBucketLimiter(capacity=capacity, refill_period_seconds=window_seconds, scope=scope)

    async def _dependency(request: Request) -> None:
        await limiter.check(await _ip_key(request))

    return _dependency


def login_account_limiter(*, capacity: int, window_seconds: float, scope: str) -> Callable[..., Awaitable[None]]:
    """Pre-auth dependency: rate-limit by the target account's email."""
    limiter = RedisTokenBucketLimiter(capacity=capacity, refill_period_seconds=window_seconds, scope=scope)

    async def _dependency(request: Request) -> None:
        key = await _login_account_key(request)
        if key is None:
            return
        await limiter.check(key)

    return _dependency


async def reset_scope(scope: str) -> None:
    """Test-only utility: delete every bucket under a scope prefix, giving the
    next test a clean slate. Redis-backed buckets are a real, persistent, shared
    resource across test runs (unlike the hermetic per-test SQLite DB), so unlike
    Batch 1's in-memory limiter there's no in-process dict to just `.clear()`."""
    redis = redis_client.get_client()
    async for key in redis.scan_iter(f"ratelimit:{scope}:*"):
        await redis.delete(key)
