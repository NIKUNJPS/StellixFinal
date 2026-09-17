"""Market-data provider abstraction (Batch 2).

The ONE seam through which all external market data enters the system. See
``base.MarketDataProvider``. Adding a paid provider (Bloomberg, Polygon, ...) means
implementing this interface — zero downstream code changes.
"""

from app.providers.base import (
    OHLCV_COLUMNS,
    LatestQuote,
    MarketDataProvider,
    ProviderError,
)
from app.providers.registry import AVAILABLE_PROVIDERS, get_provider

__all__ = [
    "LatestQuote",
    "MarketDataProvider",
    "ProviderError",
    "OHLCV_COLUMNS",
    "get_provider",
    "AVAILABLE_PROVIDERS",
]
