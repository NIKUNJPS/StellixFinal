"""Global market indices (Batch 25) — periodically refreshed, DELAYED public quotes.

Reads the cache the Celery beat poller maintains; it never calls a market-data
provider from inside a request. Public data: every authenticated user of every
organization receives the same payload — it is deliberately not tenant-scoped.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.market import GlobalIndicesResponse
from app.services import market_quotes

router = APIRouter(prefix="/market", tags=["Market Data"])


@router.get(
    "/indices",
    response_model=GlobalIndicesResponse,
    summary="Latest delayed quotes for major global indices (periodically refreshed, not real-time)",
)
async def global_indices(_user: User = Depends(get_current_user)) -> GlobalIndicesResponse:
    payload = await market_quotes.get_latest()
    refresh_requested = False
    if any(q["status"] == "unavailable" for q in payload["quotes"]):
        # Nothing fresh yet (poller idle or just started): ask for one refresh, at most
        # once a minute platform-wide. The response still reports what is true NOW.
        refresh_requested = await market_quotes.request_refresh_if_idle()
    return GlobalIndicesResponse(**payload, refresh_requested=refresh_requested)
