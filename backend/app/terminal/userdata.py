"""Per-user terminal data: workspace, watchlists, holdings, price alerts (ADR 0010).

Isolation is two-layered: the tenant session scopes every query to the caller's
organization (fail-closed listener), and every function here additionally filters on
``owner_user_id`` — a colleague in the same org gets a 404, never your book.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.models.notification import NotificationType
from app.models.organization import Organization, OrganizationStatus
from app.models.terminal import (
    HoldingPortfolio,
    HoldingSide,
    HoldingTransaction,
    PriceAlert,
    PriceAlertCondition,
    PriceAlertStatus,
    TerminalWatchlist,
    TerminalWorkspace,
)
from app.models.user import User
from app.terminal import holdings as holdings_calc
from app.terminal.sources import yahoo

logger = logging.getLogger(__name__)

MAX_ACTIVE_ALERTS = 50
MAX_WATCHLISTS = 20

DEFAULT_WIDGETS = [
    {"id": "chart-1", "type": "chart", "config": {}},
    {"id": "quote-1", "type": "quote", "config": {}},
    {"id": "watchlist-1", "type": "watchlist", "config": {}},
    {"id": "news-1", "type": "news", "config": {}},
    {"id": "heatmap-1", "type": "heatmap", "config": {}},
    {"id": "macro-1", "type": "macro", "config": {}},
]
DEFAULT_LAYOUT = [
    {"i": "chart-1", "x": 0, "y": 0, "w": 8, "h": 11},
    {"i": "quote-1", "x": 8, "y": 0, "w": 4, "h": 11},
    {"i": "watchlist-1", "x": 0, "y": 11, "w": 4, "h": 9},
    {"i": "news-1", "x": 4, "y": 11, "w": 4, "h": 9},
    {"i": "macro-1", "x": 8, "y": 11, "w": 4, "h": 9},
    {"i": "heatmap-1", "x": 0, "y": 20, "w": 12, "h": 10},
]
DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "TSLA", "BTC-USD"]


class NotFound(LookupError):
    pass


class Invalid(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


# ----------------------------------------------------------------------------- workspace
async def get_workspace(session: AsyncSession, user: User) -> TerminalWorkspace:
    row = (
        await session.execute(select(TerminalWorkspace).where(TerminalWorkspace.owner_user_id == user.id))
    ).scalar_one_or_none()
    if row is None:
        row = TerminalWorkspace(organization_id=user.organization_id, owner_user_id=user.id,
                                widgets=DEFAULT_WIDGETS, layout=DEFAULT_LAYOUT, active_symbol="SPY")
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return row


async def save_workspace(session: AsyncSession, user: User, *, widgets: list, layout: list, active_symbol: str) -> TerminalWorkspace:
    ids = {w["id"] for w in widgets}
    if len(ids) != len(widgets):
        raise Invalid("widget ids must be unique")
    layout = [item for item in layout if item["i"] in ids]  # never keep layout for removed widgets
    row = await get_workspace(session, user)
    row.widgets, row.layout, row.active_symbol = widgets, layout, active_symbol
    await session.commit()
    await session.refresh(row)
    return row


# ----------------------------------------------------------------------------- watchlists
async def list_watchlists(session: AsyncSession, user: User) -> list[TerminalWatchlist]:
    rows = list(
        (
            await session.execute(
                select(TerminalWatchlist).where(TerminalWatchlist.owner_user_id == user.id).order_by(TerminalWatchlist.created_at)
            )
        ).scalars().all()
    )
    if not rows:
        rows = [await create_watchlist(session, user, name="Default", symbols=DEFAULT_WATCHLIST)]
    return rows


async def _own_watchlist(session: AsyncSession, user: User, watchlist_id: uuid.UUID) -> TerminalWatchlist:
    row = (
        await session.execute(
            select(TerminalWatchlist).where(TerminalWatchlist.id == watchlist_id, TerminalWatchlist.owner_user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Watchlist not found")
    return row


async def create_watchlist(session: AsyncSession, user: User, *, name: str, symbols: list[str]) -> TerminalWatchlist:
    count = await session.scalar(
        select(func.count()).select_from(TerminalWatchlist).where(TerminalWatchlist.owner_user_id == user.id)
    )
    if (count or 0) >= MAX_WATCHLISTS:
        raise Invalid(f"You can have at most {MAX_WATCHLISTS} watchlists")
    row = TerminalWatchlist(organization_id=user.organization_id, owner_user_id=user.id, name=name, symbols=symbols)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def update_watchlist(session: AsyncSession, user: User, watchlist_id: uuid.UUID, *, name: str | None,
                           symbols: list[str] | None) -> TerminalWatchlist:
    row = await _own_watchlist(session, user, watchlist_id)
    if name is not None:
        row.name = name
    if symbols is not None:
        row.symbols = symbols
    await session.commit()
    await session.refresh(row)
    return row


async def delete_watchlist(session: AsyncSession, user: User, watchlist_id: uuid.UUID) -> None:
    row = await _own_watchlist(session, user, watchlist_id)
    await session.delete(row)
    await session.commit()


# ----------------------------------------------------------------------------- holdings
async def list_portfolios(session: AsyncSession, user: User) -> list[HoldingPortfolio]:
    return list(
        (
            await session.execute(
                select(HoldingPortfolio).where(HoldingPortfolio.owner_user_id == user.id).order_by(HoldingPortfolio.created_at)
            )
        ).scalars().all()
    )


async def own_portfolio(session: AsyncSession, user: User, portfolio_id: uuid.UUID) -> HoldingPortfolio:
    row = (
        await session.execute(
            select(HoldingPortfolio).where(HoldingPortfolio.id == portfolio_id, HoldingPortfolio.owner_user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Portfolio not found")
    return row


async def create_portfolio(session: AsyncSession, user: User, *, name: str, base_currency: str,
                           cash: float | None) -> HoldingPortfolio:
    row = HoldingPortfolio(organization_id=user.organization_id, owner_user_id=user.id, name=name,
                           base_currency=base_currency, cash=cash)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def update_portfolio_cash(session: AsyncSession, user: User, portfolio_id: uuid.UUID, cash: float | None) -> HoldingPortfolio:
    row = await own_portfolio(session, user, portfolio_id)
    row.cash = cash
    await session.commit()
    await session.refresh(row)
    return row


async def delete_portfolio(session: AsyncSession, user: User, portfolio_id: uuid.UUID) -> None:
    row = await own_portfolio(session, user, portfolio_id)
    await session.delete(row)
    await session.commit()


async def transactions(session: AsyncSession, portfolio: HoldingPortfolio) -> list[HoldingTransaction]:
    return list(
        (
            await session.execute(
                select(HoldingTransaction)
                .where(HoldingTransaction.portfolio_id == portfolio.id)
                .order_by(HoldingTransaction.executed_at, HoldingTransaction.created_at)
            )
        ).scalars().all()
    )


def _tx(t: HoldingTransaction) -> holdings_calc.Tx:
    executed = t.executed_at if t.executed_at.tzinfo else t.executed_at.replace(tzinfo=UTC)
    return holdings_calc.Tx(symbol=t.symbol, side=t.side.value, quantity=t.quantity, price=t.price, fee=t.fee,
                            executed_at=executed)


async def add_transaction(session: AsyncSession, portfolio: HoldingPortfolio, *, symbol: str, side: str,
                          quantity: float, price: float, fee: float, executed_at: datetime,
                          note: str | None) -> HoldingTransaction:
    if executed_at.tzinfo is None:
        executed_at = executed_at.replace(tzinfo=UTC)
    if executed_at > _now():
        raise Invalid("executed_at cannot be in the future")
    row = HoldingTransaction(organization_id=portfolio.organization_id, portfolio_id=portfolio.id, symbol=symbol,
                             side=HoldingSide(side), quantity=quantity, price=price, fee=fee,
                             executed_at=executed_at, note=note)
    existing = [_tx(t) for t in await transactions(session, portfolio)]
    try:
        holdings_calc.replay([*existing, _tx(row)])  # rejects an oversell anywhere in the timeline
    except holdings_calc.OversellError as exc:
        raise Invalid(str(exc)) from exc
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def delete_transaction(session: AsyncSession, portfolio: HoldingPortfolio, tx_id: uuid.UUID) -> None:
    rows = await transactions(session, portfolio)
    target = next((t for t in rows if t.id == tx_id), None)
    if target is None:
        raise NotFound("Transaction not found")
    try:
        holdings_calc.replay([_tx(t) for t in rows if t.id != tx_id])  # removing a buy may orphan a later sell
    except holdings_calc.OversellError as exc:
        raise Invalid(f"Deleting this transaction would leave a later sale uncovered: {exc}") from exc
    await session.delete(target)
    await session.commit()


async def positions(session: AsyncSession, portfolio: HoldingPortfolio, price_lookup) -> dict:
    """``price_lookup`` is an async callable symbols -> {symbol: last or None}."""
    book = holdings_calc.replay([_tx(t) for t in await transactions(session, portfolio)])
    open_symbols = [s for s, p in book.positions.items() if p.quantity > 0]
    prices = await price_lookup(open_symbols) if open_symbols else {}
    result = holdings_calc.valuation(book, prices)
    result["portfolio"] = {"id": str(portfolio.id), "name": portfolio.name, "base_currency": portfolio.base_currency,
                           "cash": portfolio.cash}
    return result


async def as_agent_portfolio(session: AsyncSession, user: User, portfolio_id: uuid.UUID) -> dict:
    """The Agent Desk's PortfolioContext shape, from this user's tracked book."""
    portfolio = await own_portfolio(session, user, portfolio_id)
    book = holdings_calc.replay([_tx(t) for t in await transactions(session, portfolio)])
    return {
        "cash": portfolio.cash,
        "currency": portfolio.base_currency,
        "positions": [
            {"ticker": s, "quantity": round(p.quantity, 8), "average_price": round(p.average_cost, 6) if p.average_cost else None}
            for s, p in sorted(book.positions.items())
            if p.quantity > 0
        ],
    }


# ----------------------------------------------------------------------------- alerts
async def list_alerts(session: AsyncSession, user: User) -> list[PriceAlert]:
    return list(
        (
            await session.execute(
                select(PriceAlert).where(PriceAlert.owner_user_id == user.id).order_by(PriceAlert.created_at.desc()).limit(200)
            )
        ).scalars().all()
    )


async def create_alert(session: AsyncSession, user: User, *, symbol: str, condition: str, target_price: float,
                       note: str | None) -> PriceAlert:
    active = await session.scalar(
        select(func.count()).select_from(PriceAlert).where(
            PriceAlert.owner_user_id == user.id, PriceAlert.status == PriceAlertStatus.ACTIVE
        )
    )
    if (active or 0) >= MAX_ACTIVE_ALERTS:
        raise Invalid(f"You can have at most {MAX_ACTIVE_ALERTS} active alerts")
    row = PriceAlert(organization_id=user.organization_id, owner_user_id=user.id, symbol=symbol,
                     condition=PriceAlertCondition(condition), target_price=target_price, note=note)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def cancel_alert(session: AsyncSession, user: User, alert_id: uuid.UUID) -> PriceAlert:
    row = (
        await session.execute(select(PriceAlert).where(PriceAlert.id == alert_id, PriceAlert.owner_user_id == user.id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Alert not found")
    if row.status == PriceAlertStatus.ACTIVE:
        row.status = PriceAlertStatus.CANCELLED
        await session.commit()
        await session.refresh(row)
    return row


def crossed(condition: PriceAlertCondition, target: float, price: float) -> bool:
    return price >= target if condition == PriceAlertCondition.ABOVE else price <= target


async def evaluate_org_alerts(session: AsyncSession, organization_id: uuid.UUID, prices: dict[str, float | None]) -> int:
    """Fire every active alert in one org whose condition the latest price meets."""
    from app.services.notification import create_notification
    from app.ws.events import publish_price_alert

    active = (
        await session.execute(select(PriceAlert).where(PriceAlert.status == PriceAlertStatus.ACTIVE))
    ).scalars().all()
    fired = 0
    for alert in active:
        price = prices.get(alert.symbol)
        if price is None or not crossed(alert.condition, alert.target_price, price):
            continue
        alert.status = PriceAlertStatus.TRIGGERED
        alert.triggered_at = _now()
        alert.triggered_price = price
        owner = await session.get(User, alert.owner_user_id)
        await session.commit()
        fired += 1
        verb = "rose to" if alert.condition == PriceAlertCondition.ABOVE else "fell to"
        message = f"{alert.symbol} {verb} {price:,.4g} (alert {alert.condition.value} {alert.target_price:,.4g})."
        if owner is not None:
            await create_notification(session, organization_id=organization_id, user=owner,
                                      type=NotificationType.PRICE_ALERT, message=message, link="/terminal")
            await session.commit()
        await publish_price_alert(org_id=str(organization_id), owner_user_id=str(alert.owner_user_id),
                                  alert_id=str(alert.id), symbol=alert.symbol, condition=alert.condition.value,
                                  target_price=alert.target_price, price=price)
    return fired


async def check_all_alerts() -> dict:
    """Celery entry (every 60s, realtime queue): one batched quote call for every
    symbol with an active alert, then per-org evaluation in tenant sessions."""
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        pairs = (
            await s.execute(
                select(PriceAlert.organization_id, PriceAlert.symbol)
                .join(Organization, Organization.id == PriceAlert.organization_id)
                .where(PriceAlert.status == PriceAlertStatus.ACTIVE, Organization.status == OrganizationStatus.ACTIVE)
                .distinct()
            )
        ).all()
    if not pairs:
        return {"orgs": 0, "symbols": 0, "fired": 0}
    symbols = sorted({sym for _, sym in pairs})
    from app.terminal.cache import run_blocking

    quotes = await run_blocking(yahoo.quotes, symbols, timeout=60)
    prices = {q["symbol"]: q.get("last") for q in quotes if q.get("status") == "ok"}
    fired = 0
    for org_id in sorted({org for org, _ in pairs}):
        async with get_tenant_session(org_id) as session:
            fired += await evaluate_org_alerts(session, org_id, prices)
    return {"orgs": len({o for o, _ in pairs}), "symbols": len(symbols), "fired": fired}
