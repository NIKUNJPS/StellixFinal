"""Global market indices (Batch 25) — periodically refreshed, DELAYED public quotes.

Reads the cache the Celery beat poller maintains; it never calls a market-data
provider from inside a request. Public data: every authenticated user of every
organization receives the same payload — it is deliberately not tenant-scoped.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.market import (
    ChartResponse,
    GlobalIndicesResponse,
    HeatmapResponse,
    MacroResponse,
    ScreenerResponse,
)
from app.services import macro_data, market_chart, market_quotes, market_screener

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


@router.get(
    "/macro",
    response_model=MacroResponse,
    summary="Treasury yield curve + VIX from FRED (end-of-day, not real-time; "
    "honest 'not configured' when FRED_API_KEY is unset)",
)
async def macro_dashboard(_user: User = Depends(get_current_user)) -> MacroResponse:
    payload = await macro_data.get_latest()
    return MacroResponse(**payload)


@router.get(
    "/screener",
    response_model=ScreenerResponse,
    summary="Market screener over a curated, bounded universe of liquid US equities "
    "(NOT full-market coverage — see universe_note)",
)
async def screener(_user: User = Depends(get_current_user)) -> ScreenerResponse:
    payload = await market_screener.get_latest()
    return ScreenerResponse(**payload)


@router.get(
    "/heatmap",
    response_model=HeatmapResponse,
    summary="Sector heatmap derived from the screener's own data (no second fetch); "
    "tile size is today's dollar volume, not market cap",
)
async def sector_heatmap(_user: User = Depends(get_current_user)) -> HeatmapResponse:
    payload = await market_screener.get_latest()
    sectors = market_screener.sector_heatmap(payload["rows"])
    return HeatmapResponse(
        universe_size=payload["universe_size"],
        universe_note=payload["universe_note"],
        generated_at=payload["generated_at"],
        sectors=sectors,
    )


@router.get(
    "/chart/{symbol}",
    response_model=ChartResponse,
    summary="Candlestick OHLCV + SMA/EMA/RSI/MACD/Bollinger/VWAP overlays, fetched "
    "on request (not real-time; intraday intervals not offered — see chart docs)",
)
async def chart(
    symbol: str,
    interval: str = Query(default="1d"),
    range_key: str = Query(default="1y", alias="range"),
    _user: User = Depends(get_current_user),
) -> ChartResponse:
    try:
        payload = await market_chart.get_chart(symbol.strip().upper(), interval, range_key)
    except market_chart.ChartRequestError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return ChartResponse(**payload)
