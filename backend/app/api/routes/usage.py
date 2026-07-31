"""API usage / rate-limit visibility (Batch 21).

GET /usage/rate-limits reports the caller's org's CURRENT token-bucket state per
endpoint category, read straight from Redis via ``RedisTokenBucketLimiter.peek``
(no token consumed). It reuses the exact limiter instances the dependencies enforce
(``app.core.rate_limit.AUTHENTICATED_LIMITERS``), so the numbers can't drift from
what actually gates a request.

No LLM monthly-budget block: the codebase records per-call LLM cost but enforces no
monthly USD cap, so there is no real budget to report — it is omitted rather than
fabricated (see docs and the Batch 21 report).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_system_db
from app.core.rate_limit import AUTHENTICATED_LIMITERS
from app.core.token_bucket import get_org_rate_multiplier
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(prefix="/usage", tags=["Usage & Billing"])


@router.get(
    "/rate-limits",
    summary="Current rate-limit usage for the caller's organization",
)
async def rate_limit_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    org = await db.get(Organization, current_user.organization_id)
    multiplier = await get_org_rate_multiplier(db, current_user.organization_id)

    endpoints: dict[str, dict] = {}
    for _scope, meta in AUTHENTICATED_LIMITERS.items():
        limiter = meta["limiter"]
        key = (
            str(current_user.id)
            if meta["keyed_by"] == "user"
            else str(current_user.organization_id)
        )
        state = await limiter.peek(key, multiplier=multiplier)
        endpoints[meta["category"]] = {
            "limit": state["limit"],
            "window_seconds": state["window_seconds"],
            "used": state["used"],
            "remaining": state["remaining"],
            "resets_in_seconds": state["resets_in_seconds"],
        }

    return {
        "tier": org.tier.value if org else None,
        "rate_multiplier": multiplier,
        "endpoints": endpoints,
        # llm_budget intentionally omitted — no enforced monthly LLM budget exists.
    }
