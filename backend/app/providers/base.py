"""Abstract market-data provider interface.

Every provider returns OHLCV data in ONE canonical shape: a pandas DataFrame with
exactly the columns in ``OHLCV_COLUMNS``, ``timestamp`` tz-aware (UTC), sorted
ascending. Downstream code (validation, persistence, feature engineering) depends only
on this contract — never on a specific vendor.

> To add a paid provider (Bloomberg, Polygon, etc.) later, implement
> ``MarketDataProvider`` — zero downstream code changes required.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date

import pandas as pd

# The canonical OHLCV contract. Order matters; downstream code may rely on it.
OHLCV_COLUMNS: list[str] = ["timestamp", "open", "high", "low", "close", "volume"]


class ProviderError(Exception):
    """Raised when a provider cannot return usable data (network, auth, empty, ...)."""


@dataclass(frozen=True)
class LatestQuote:
    """The most recent price a provider can report for one symbol (Batch 25).

    Deliberately NOT a "live tick": free providers report delayed prices, and
    ``session_date`` is the exchange session the price belongs to — not a
    wall-clock trade time the provider never gave us. Exactly one of
    ``last_price`` / ``error`` is meaningful: a symbol the provider could not
    price carries an ``error`` and no numbers, never a guessed value.
    """

    symbol: str
    last_price: float | None = None
    previous_close: float | None = None
    session_date: date | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and self.last_price is not None


class MarketDataProvider(ABC):
    """Abstract base for all market-data sources."""

    #: stable short identifier stored in ``market_data.source``
    name: str = "base"

    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        start: date,
        end: date,
        interval: str,
    ) -> pd.DataFrame:
        """Return OHLCV bars for ``symbol`` in ``[start, end)`` at ``interval``.

        MUST return a DataFrame with columns == ``OHLCV_COLUMNS``, a tz-aware UTC
        ``timestamp`` column, sorted ascending. MUST raise ``ProviderError`` on
        failure rather than returning an empty/garbage frame.
        """
        raise NotImplementedError

    def fetch_latest_quotes(self, symbols: list[str]) -> list[LatestQuote]:
        """Latest delayed price + previous close for each symbol, in one lightweight
        call (Batch 25) — distinct from ``fetch_ohlcv``'s bulk historical path.

        Returns one ``LatestQuote`` per requested symbol, in order; a symbol that
        could not be priced carries ``error``. Providers that cannot serve quotes
        keep this default, which raises ``ProviderError``.
        """
        raise ProviderError(f"Provider {self.name!r} does not support latest quotes")

    @staticmethod
    def _normalize(frame: pd.DataFrame) -> pd.DataFrame:
        """Coerce a provider frame to the canonical contract (shared by providers)."""
        out = frame.loc[:, OHLCV_COLUMNS].copy()
        out["timestamp"] = pd.to_datetime(out["timestamp"], utc=True)
        for col in ("open", "high", "low", "close", "volume"):
            out[col] = pd.to_numeric(out[col], errors="coerce")
        return out.sort_values("timestamp").reset_index(drop=True)
