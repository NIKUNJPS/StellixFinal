"""Market Terminal endpoints (Batch 31, ADR 0010).

Global market data (any authenticated user) and per-user workspace / watchlists /
holdings / alerts. Upstream failures become clean statuses: 503 when a source needs a
credential the deployment has not set, 502 when a source is down and there is no
last-good value, 404 for an unknown symbol — never an opaque 500.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.models.user import User
from app.schemas import terminal as schemas
from app.terminal import market, userdata
from app.terminal.cache import SourceNotConfigured, SourceUnavailable

router = APIRouter(prefix="/terminal", tags=["Market Terminal"])


async def _guard(call: Callable[[], Awaitable[Any]]) -> Any:
    try:
        return await call()
    except SourceNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except SourceUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except (KeyError, IndexError):
        raise  # a programming error, not "symbol not found" — let it surface as a real 500
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def _sym(value: str) -> str:
    try:
        return schemas.symbol(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _syms(csv: str, limit: int) -> list[str]:
    try:
        return schemas.symbols([s for s in csv.split(",") if s.strip()], limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _user_error(exc: Exception) -> HTTPException:
    if isinstance(exc, userdata.NotFound):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


# =============================================================================== global data
@router.get("/status")
async def terminal_status(current_user: User = Depends(get_current_user)) -> dict:
    return market.status()


@router.get("/search")
async def search(q: str = Query(min_length=1, max_length=40), current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(lambda: market.search(q))


@router.get("/quotes")
async def quotes(symbols: str = Query(min_length=1, max_length=1200), current_user: User = Depends(get_current_user)) -> dict:
    wanted = _syms(symbols, 60)
    return await _guard(lambda: market.quotes(wanted))


@router.get("/quote/{symbol}")
async def quote(symbol: str, current_user: User = Depends(get_current_user)) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.quote_detail(s))


@router.get("/history/{symbol}")
async def history(
    symbol: str,
    range: Literal["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"] = "6M",  # noqa: A002 — API name
    current_user: User = Depends(get_current_user),
) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.history(s, range))


@router.get("/news")
async def news(
    symbol: str | None = Query(default=None, max_length=20),
    q: str | None = Query(default=None, max_length=80),
    current_user: User = Depends(get_current_user),
) -> dict:
    s = _sym(symbol) if symbol else None
    return await _guard(lambda: market.news(s, q))


@router.get("/options/{symbol}")
async def options(
    symbol: str,
    expiration: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: User = Depends(get_current_user),
) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.options(s, expiration))


@router.get("/crypto")
async def crypto(current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(market.crypto_board)


@router.get("/crypto/{symbol}/history")
async def crypto_history(
    symbol: str,
    interval: Literal["15m", "1h", "4h", "1d", "1w"] = "1d",
    current_user: User = Depends(get_current_user),
) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.crypto_history(s, interval))


@router.get("/crypto/{symbol}/orderbook")
async def crypto_orderbook(symbol: str, current_user: User = Depends(get_current_user)) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.crypto_orderbook(s))


@router.get("/macro/global")
async def macro_global(current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(market.macro_global)


@router.get("/calendar/economic")
async def economic_calendar(current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(market.economic_calendar)


@router.get("/calendar/earnings")
async def earnings_calendar(symbols: str = Query(min_length=1, max_length=1200),
                            current_user: User = Depends(get_current_user)) -> dict:
    wanted = _syms(symbols, 40)
    return await _guard(lambda: market.earnings_calendar(wanted))


@router.get("/earnings-history/{symbol}")
async def earnings_history(symbol: str, current_user: User = Depends(get_current_user)) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.earnings_history(s))


@router.get("/insider/{symbol}")
async def insider(symbol: str, current_user: User = Depends(get_current_user)) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.insider(s))


@router.get("/short-volume/{symbol}")
async def short_volume(symbol: str, sessions: int = Query(default=10, ge=1, le=20),
                       current_user: User = Depends(get_current_user)) -> dict:
    s = _sym(symbol)
    return await _guard(lambda: market.short_volume(s, sessions))


@router.get("/screener")
async def screener(current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(market.screener)


@router.get("/heatmap")
async def heatmap(current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(market.heatmap)


@router.get("/recap")
async def recap(current_user: User = Depends(get_current_user)) -> dict:
    return await _guard(market.recap)


# =============================================================================== workspace
@router.get("/workspace", response_model=schemas.WorkspaceRead)
async def get_workspace(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    return await userdata.get_workspace(db, current_user)


@router.put("/workspace", response_model=schemas.WorkspaceRead)
async def put_workspace(payload: schemas.WorkspacePayload, current_user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_tenant_db)):
    try:
        return await userdata.save_workspace(
            db, current_user,
            widgets=[w.model_dump() for w in payload.widgets],
            layout=[li.model_dump() for li in payload.layout],
            active_symbol=payload.active_symbol,
        )
    except userdata.Invalid as exc:
        raise _user_error(exc) from exc


# =============================================================================== watchlists
@router.get("/watchlists", response_model=list[schemas.WatchlistRead])
async def list_watchlists(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    return await userdata.list_watchlists(db, current_user)


@router.post("/watchlists", response_model=schemas.WatchlistRead, status_code=201)
async def create_watchlist(payload: schemas.WatchlistCreate, current_user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_tenant_db)):
    try:
        return await userdata.create_watchlist(db, current_user, name=payload.name, symbols=payload.symbols)
    except userdata.Invalid as exc:
        raise _user_error(exc) from exc


@router.patch("/watchlists/{watchlist_id}", response_model=schemas.WatchlistRead)
async def update_watchlist(watchlist_id: uuid.UUID, payload: schemas.WatchlistUpdate,
                           current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    try:
        return await userdata.update_watchlist(db, current_user, watchlist_id, name=payload.name, symbols=payload.symbols)
    except (userdata.NotFound, userdata.Invalid) as exc:
        raise _user_error(exc) from exc


@router.delete("/watchlists/{watchlist_id}", status_code=204)
async def delete_watchlist(watchlist_id: uuid.UUID, current_user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_tenant_db)) -> None:
    try:
        await userdata.delete_watchlist(db, current_user, watchlist_id)
    except userdata.NotFound as exc:
        raise _user_error(exc) from exc


# =============================================================================== holdings
@router.get("/portfolios", response_model=list[schemas.PortfolioRead])
async def list_portfolios(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    return await userdata.list_portfolios(db, current_user)


@router.post("/portfolios", response_model=schemas.PortfolioRead, status_code=201)
async def create_portfolio(payload: schemas.PortfolioCreate, current_user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_tenant_db)):
    return await userdata.create_portfolio(db, current_user, name=payload.name,
                                           base_currency=payload.base_currency.upper(), cash=payload.cash)


@router.patch("/portfolios/{portfolio_id}", response_model=schemas.PortfolioRead)
async def update_portfolio(portfolio_id: uuid.UUID, payload: schemas.PortfolioCashUpdate,
                           current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    try:
        return await userdata.update_portfolio_cash(db, current_user, portfolio_id, payload.cash)
    except userdata.NotFound as exc:
        raise _user_error(exc) from exc


@router.delete("/portfolios/{portfolio_id}", status_code=204)
async def delete_portfolio(portfolio_id: uuid.UUID, current_user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_tenant_db)) -> None:
    try:
        await userdata.delete_portfolio(db, current_user, portfolio_id)
    except userdata.NotFound as exc:
        raise _user_error(exc) from exc


@router.get("/portfolios/{portfolio_id}/transactions", response_model=list[schemas.TransactionRead])
async def list_transactions(portfolio_id: uuid.UUID, current_user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_tenant_db)):
    try:
        portfolio = await userdata.own_portfolio(db, current_user, portfolio_id)
    except userdata.NotFound as exc:
        raise _user_error(exc) from exc
    return await userdata.transactions(db, portfolio)


@router.post("/portfolios/{portfolio_id}/transactions", response_model=schemas.TransactionRead, status_code=201)
async def add_transaction(portfolio_id: uuid.UUID, payload: schemas.TransactionCreate,
                          current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    try:
        portfolio = await userdata.own_portfolio(db, current_user, portfolio_id)
        return await userdata.add_transaction(db, portfolio, **payload.model_dump())
    except (userdata.NotFound, userdata.Invalid) as exc:
        raise _user_error(exc) from exc


@router.delete("/portfolios/{portfolio_id}/transactions/{tx_id}", status_code=204)
async def delete_transaction(portfolio_id: uuid.UUID, tx_id: uuid.UUID, current_user: User = Depends(get_current_user),
                             db: AsyncSession = Depends(get_tenant_db)) -> None:
    try:
        portfolio = await userdata.own_portfolio(db, current_user, portfolio_id)
        await userdata.delete_transaction(db, portfolio, tx_id)
    except (userdata.NotFound, userdata.Invalid) as exc:
        raise _user_error(exc) from exc


async def _last_prices(symbols: list[str]) -> dict[str, float | None]:
    try:
        env = await market.quotes(symbols)
    except (SourceUnavailable, SourceNotConfigured):
        return {}
    return {q["symbol"]: q.get("last") for q in env["data"]}


@router.get("/portfolios/{portfolio_id}/positions")
async def portfolio_positions(portfolio_id: uuid.UUID, current_user: User = Depends(get_current_user),
                              db: AsyncSession = Depends(get_tenant_db)) -> dict:
    try:
        portfolio = await userdata.own_portfolio(db, current_user, portfolio_id)
    except userdata.NotFound as exc:
        raise _user_error(exc) from exc
    return await userdata.positions(db, portfolio, _last_prices)


# =============================================================================== alerts
@router.get("/alerts", response_model=list[schemas.AlertRead])
async def list_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_tenant_db)):
    return await userdata.list_alerts(db, current_user)


@router.post("/alerts", response_model=schemas.AlertRead, status_code=201)
async def create_alert(payload: schemas.AlertCreate, current_user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_tenant_db)):
    try:
        return await userdata.create_alert(db, current_user, **payload.model_dump())
    except userdata.Invalid as exc:
        raise _user_error(exc) from exc


@router.delete("/alerts/{alert_id}", response_model=schemas.AlertRead)
async def cancel_alert(alert_id: uuid.UUID, current_user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_tenant_db)):
    try:
        return await userdata.cancel_alert(db, current_user, alert_id)
    except userdata.NotFound as exc:
        raise _user_error(exc) from exc
