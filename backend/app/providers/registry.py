"""Provider registry — resolve a provider name to a concrete implementation."""

from __future__ import annotations

from app.core.config import settings
from app.providers.alphavantage_provider import AlphaVantageProvider
from app.providers.base import MarketDataProvider, ProviderError
from app.providers.yfinance_provider import YFinanceProvider

AVAILABLE_PROVIDERS: list[str] = ["yfinance", "alphavantage"]


def get_provider(name: str) -> MarketDataProvider:
    """Return a provider instance for ``name`` (the value stored in market_data.source)."""
    if name == "yfinance":
        return YFinanceProvider()
    if name == "alphavantage":
        return AlphaVantageProvider(settings.ALPHA_VANTAGE_API_KEY)
    raise ProviderError(
        f"Unknown provider {name!r}. Available: {', '.join(AVAILABLE_PROVIDERS)}"
    )
