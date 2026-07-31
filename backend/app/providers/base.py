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
from datetime import date

import pandas as pd

# The canonical OHLCV contract. Order matters; downstream code may rely on it.
OHLCV_COLUMNS: list[str] = ["timestamp", "open", "high", "low", "close", "volume"]


class ProviderError(Exception):
    """Raised when a provider cannot return usable data (network, auth, empty, ...)."""


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

    @staticmethod
    def _normalize(frame: pd.DataFrame) -> pd.DataFrame:
        """Coerce a provider frame to the canonical contract (shared by providers)."""
        out = frame.loc[:, OHLCV_COLUMNS].copy()
        out["timestamp"] = pd.to_datetime(out["timestamp"], utc=True)
        for col in ("open", "high", "low", "close", "volume"):
            out[col] = pd.to_numeric(out[col], errors="coerce")
        return out.sort_values("timestamp").reset_index(drop=True)
