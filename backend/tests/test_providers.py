"""Provider abstraction tests (no network)."""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest
from app.providers import (
    AVAILABLE_PROVIDERS,
    MarketDataProvider,
    ProviderError,
    get_provider,
)
from app.providers.base import OHLCV_COLUMNS
from app.services.ingestion import validate_and_clean


def test_two_providers_registered_behind_the_interface():
    assert set(AVAILABLE_PROVIDERS) == {"yfinance", "alphavantage"}
    for name in AVAILABLE_PROVIDERS:
        provider = get_provider(name)
        assert isinstance(provider, MarketDataProvider)
        assert provider.name == name


def test_unknown_provider_raises():
    with pytest.raises(ProviderError):
        get_provider("bloomberg")


def test_alphavantage_without_key_raises_provider_error():
    provider = get_provider("alphavantage")
    provider.api_key = None  # ensure no key
    with pytest.raises(ProviderError):
        provider.fetch_ohlcv("AAPL", date(2024, 1, 1), date(2024, 2, 1), "1d")


def test_arbitrary_implementation_flows_through_downstream():
    """Proves the abstraction holds: any MarketDataProvider feeds validation unchanged."""

    class FakeProvider(MarketDataProvider):
        name = "fake"

        def fetch_ohlcv(self, symbol, start, end, interval):
            frame = pd.DataFrame(
                {
                    "timestamp": pd.to_datetime(
                        ["2024-01-01", "2024-01-02", "2024-01-03"], utc=True
                    ),
                    "open": [10.0, 11.0, 12.0],
                    "high": [11.0, 12.0, 13.0],
                    "low": [9.0, 10.0, 11.0],
                    "close": [10.5, 11.5, 12.5],
                    "volume": [1000.0, 1100.0, 1200.0],
                }
            )
            return self._normalize(frame.loc[:, OHLCV_COLUMNS])

    df = FakeProvider().fetch_ohlcv("X", date(2024, 1, 1), date(2024, 1, 4), "1d")
    assert list(df.columns) == OHLCV_COLUMNS

    clean, warnings = validate_and_clean(df, "1d")
    assert len(clean) == 3
    assert warnings == []  # clean data → no warnings
