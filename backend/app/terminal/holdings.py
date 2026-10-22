"""Positions and P&L from a transaction ledger — average-cost method (ADR 0010).

Pure functions, no I/O. Replay in ``executed_at`` order:
* buy  — quantity += q; cost basis += q * price + fee
* sell — realised += (price - avg_cost) * q - fee; cost basis -= avg_cost * q
         (a sell never changes the average cost). Selling more than is held is an
         error: this tracker does not open shorts by accident.

Unrealised P&L needs a current price; when none is available it is ``None``, not 0.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime

_EPS = 1e-9


class OversellError(ValueError):
    pass


@dataclass(frozen=True)
class Tx:
    symbol: str
    side: str  # "buy" | "sell"
    quantity: float
    price: float
    fee: float
    executed_at: datetime


@dataclass
class Position:
    symbol: str
    quantity: float = 0.0
    cost_basis: float = 0.0
    realized_pnl: float = 0.0
    fees: float = 0.0
    trades: int = 0

    @property
    def average_cost(self) -> float | None:
        return self.cost_basis / self.quantity if self.quantity > _EPS else None


@dataclass
class Book:
    positions: dict[str, Position] = field(default_factory=dict)

    @property
    def realized_pnl(self) -> float:
        return sum(p.realized_pnl for p in self.positions.values())


def replay(transactions: Iterable[Tx]) -> Book:
    book = Book()
    for tx in sorted(transactions, key=lambda t: t.executed_at):
        pos = book.positions.setdefault(tx.symbol, Position(symbol=tx.symbol))
        pos.trades += 1
        pos.fees += tx.fee
        if tx.side == "buy":
            pos.quantity += tx.quantity
            pos.cost_basis += tx.quantity * tx.price + tx.fee
        else:
            if tx.quantity > pos.quantity + _EPS:
                raise OversellError(
                    f"Selling {tx.quantity:g} {tx.symbol} on {tx.executed_at:%Y-%m-%d} exceeds the "
                    f"{pos.quantity:g} held at that time."
                )
            avg = pos.cost_basis / pos.quantity
            pos.realized_pnl += (tx.price - avg) * tx.quantity - tx.fee
            pos.quantity -= tx.quantity
            pos.cost_basis -= avg * tx.quantity
            if pos.quantity <= _EPS:
                pos.quantity, pos.cost_basis = 0.0, 0.0
    return book


def valuation(book: Book, prices: dict[str, float | None]) -> dict:
    rows = []
    market_value_total = 0.0
    unrealized_total = 0.0
    complete = True
    for symbol, pos in sorted(book.positions.items()):
        price = prices.get(symbol)
        open_ = pos.quantity > _EPS
        mv = pos.quantity * price if open_ and price is not None else None
        unreal = mv - pos.cost_basis if mv is not None else None
        if open_ and price is None:
            complete = False
        if mv is not None:
            market_value_total += mv
            unrealized_total += unreal
        rows.append(
            {
                "symbol": symbol,
                "quantity": round(pos.quantity, 8),
                "average_cost": round(pos.average_cost, 6) if pos.average_cost is not None else None,
                "cost_basis": round(pos.cost_basis, 4),
                "last_price": price,
                "market_value": round(mv, 4) if mv is not None else None,
                "unrealized_pnl": round(unreal, 4) if unreal is not None else None,
                "unrealized_pnl_pct": round(unreal / pos.cost_basis * 100, 3) if unreal is not None and pos.cost_basis else None,
                "realized_pnl": round(pos.realized_pnl, 4),
                "fees": round(pos.fees, 4),
                "trades": pos.trades,
                "open": open_,
            }
        )
    return {
        "positions": rows,
        "totals": {
            "market_value": round(market_value_total, 4) if complete else None,
            "cost_basis": round(sum(p.cost_basis for p in book.positions.values()), 4),
            "unrealized_pnl": round(unrealized_total, 4) if complete else None,
            "realized_pnl": round(book.realized_pnl, 4),
            "complete": complete,
        },
    }
