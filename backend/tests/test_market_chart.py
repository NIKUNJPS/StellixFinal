"""Batch 28 Task 4: enhanced candlestick charting.

No test makes a network call: the provider's fetch_ohlcv is monkeypatched with a
deterministic synthetic frame. Covers real indicator reuse (spies on
compute_features to prove it's actually called, not recomputed a second way),
VWAP's honest bar-count math, and the honest interval/range validation (no
intraday offered).
"""

from __future__ import annotations

import pytest
from app.services import market_chart

from tests.data_helpers import make_synthetic_ohlcv
from tests.helpers import bearer, create_org_user, token_for


def _patch_provider(monkeypatch, ohlcv):
    class StubProvider:
        name = "stub"

        def fetch_ohlcv(self, symbol, start, end, interval):
            return ohlcv

    monkeypatch.setattr(market_chart, "get_provider", lambda _name: StubProvider())


async def test_chart_reuses_real_compute_features(monkeypatch):
    """Signal-service-style spy: proves indicators come from the SAME shared
    function backtesting uses, not a second, divergent computation."""
    from app.features import engineering

    calls = []
    real = engineering.compute_features

    def spy(df):
        calls.append(1)
        return real(df)

    monkeypatch.setattr(market_chart, "compute_features", spy)
    _patch_provider(monkeypatch, make_synthetic_ohlcv(n=120))

    payload = await market_chart.get_chart("AAPL", "1d", "1y")
    assert calls, "compute_features was never called — a second indicator engine may be in use"
    assert len(payload["candles"]) == 120
    assert payload["indicators"]["sma_20"]  # warm-up rows correctly dropped, real values present
    # SMA-20 needs 20 bars of history; earlier bars are NaN and must be excluded, not zero-filled.
    assert len(payload["indicators"]["sma_20"]) == 120 - 19


async def test_chart_vwap_is_a_rolling_window_not_a_session_vwap(monkeypatch):
    """VWAP here is explicitly a rolling N-bar volume-weighted average (labeled
    vwap_20) — verify the math on a simple constant-volume, constant-price frame
    where VWAP must equal the constant price exactly."""
    df = make_synthetic_ohlcv(n=40)
    df["open"] = df["high"] = df["low"] = df["close"] = 50.0
    df["volume"] = 1000.0
    _patch_provider(monkeypatch, df)

    payload = await market_chart.get_chart("AAPL", "1d", "1y")
    vwap_points = payload["indicators"]["vwap_20"]
    assert vwap_points  # warm-up satisfied
    assert all(p["value"] == pytest.approx(50.0) for p in vwap_points)


async def test_chart_rejects_unsupported_interval():
    with pytest.raises(market_chart.ChartRequestError, match="interval must be one of"):
        await market_chart.get_chart("AAPL", "5m", "1y")


async def test_chart_rejects_unsupported_range():
    with pytest.raises(market_chart.ChartRequestError, match="range must be one of"):
        await market_chart.get_chart("AAPL", "1d", "10y")


async def test_chart_surfaces_provider_error_as_chart_request_error(monkeypatch):
    from app.providers import ProviderError

    class BoomProvider:
        name = "stub"

        def fetch_ohlcv(self, symbol, start, end, interval):
            raise ProviderError("no data for this symbol")

    monkeypatch.setattr(market_chart, "get_provider", lambda _name: BoomProvider())
    with pytest.raises(market_chart.ChartRequestError, match="no data for this symbol"):
        await market_chart.get_chart("BADSYM", "1d", "1y")


async def test_chart_endpoint_reachable(client, db_session_factory, monkeypatch):
    _patch_provider(monkeypatch, make_synthetic_ohlcv(n=60))
    org, user = await create_org_user(db_session_factory, org_name="Chart Co", slug="chart-co", email="c@chart.co")
    token = await token_for(client, user.email)
    resp = await client.get("/market/chart/AAPL?interval=1d&range=1y", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["symbol"] == "AAPL"
    assert len(body["candles"]) == 60


async def test_chart_endpoint_rejects_bad_interval_with_422(client, db_session_factory):
    org, user = await create_org_user(db_session_factory, org_name="Chart Bad", slug="chart-bad", email="cb@chart.co")
    token = await token_for(client, user.email)
    resp = await client.get("/market/chart/AAPL?interval=5m&range=1y", headers=bearer(token))
    assert resp.status_code == 422
