"""Batch 28 Task 2/3: market screener + sector heatmap.

No test makes a network call: the yfinance batched download is replaced with a
canned frame and Redis with an in-memory double. Covers screener-snapshot parsing,
per-symbol error isolation, honest unavailable states, heatmap aggregation math on a
known synthetic dataset (dollar-volume-weighted, never market cap), global (not
org-scoped) realtime delivery, and the stated bounded-universe honesty note.
"""

from __future__ import annotations

import json
from datetime import date

import pandas as pd
import pytest

from app.providers import ProviderError, ScreenerQuote
from app.providers.yfinance_provider import YFinanceProvider
from app.services import market_screener

from tests.helpers import bearer, create_org_user, token_for

_SYMBOLS = [u.symbol for u in market_screener.SCREENER_UNIVERSE[:4]]


class InMemoryRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.published: list[tuple[str, str]] = []

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


@pytest.fixture
def memory_redis(monkeypatch):
    from app.clients import redis_client

    fake = InMemoryRedis()
    monkeypatch.setattr(redis_client, "get_client", lambda: fake)
    return fake


def _download_frame(symbols: list[str], *, missing: set[str] = frozenset()) -> pd.DataFrame:
    index = pd.DatetimeIndex([pd.Timestamp("2026-09-10"), pd.Timestamp("2026-09-11")], name="Date")
    frames = {}
    for i, symbol in enumerate(symbols):
        base = 100.0 * (i + 1)
        closes = [float("nan"), float("nan")] if symbol in missing else [base, base * 1.05]
        volumes = [0, 0] if symbol in missing else [0, 1_000_000.0]
        frames[symbol] = pd.DataFrame(
            {"Open": closes, "High": closes, "Low": closes, "Close": closes, "Adj Close": closes, "Volume": volumes},
            index=index,
        )
    return pd.concat(frames, axis=1)


# --------------------------------------------------------------------------- provider
def test_yfinance_screener_snapshot_parses_batched_download_without_network(monkeypatch):
    calls = []

    def fake_download(**kwargs):
        calls.append(kwargs)
        return _download_frame(kwargs["tickers"], missing={_SYMBOLS[1]})

    monkeypatch.setattr("app.providers.yfinance_provider.yf.download", fake_download)
    quotes = YFinanceProvider().fetch_screener_snapshot(_SYMBOLS)

    assert len(calls) == 1  # one batched call, not one per symbol
    by_symbol = {q.symbol: q for q in quotes}
    first = by_symbol[_SYMBOLS[0]]
    assert first.ok
    assert first.previous_close == 100.0 and first.last_price == pytest.approx(105.0)
    assert first.volume == 1_000_000.0
    assert first.change_pct == pytest.approx(5.0)
    missing = by_symbol[_SYMBOLS[1]]
    assert not missing.ok and missing.last_price is None


def test_yfinance_screener_raises_provider_error_on_client_failure(monkeypatch):
    def boom(**_kwargs):
        raise RuntimeError("rate limited")

    monkeypatch.setattr("app.providers.yfinance_provider.yf.download", boom)
    with pytest.raises(ProviderError):
        YFinanceProvider().fetch_screener_snapshot(["AAPL"])


# --------------------------------------------------------------------------- merge
def test_merge_refresh_isolates_a_single_symbol_failure():
    """One bad symbol must not blank out the others' prices."""
    now_ = date(2026, 9, 20)
    quotes = [
        ScreenerQuote(symbol=_SYMBOLS[0], last_price=110.0, previous_close=100.0, volume=1000.0, session_date=now_),
        ScreenerQuote(symbol=_SYMBOLS[1], error="No data returned for this symbol"),
    ]
    merged = market_screener.merge_refresh({}, quotes, market_screener._utcnow())
    assert merged[_SYMBOLS[0]]["status"] == "ok"
    assert merged[_SYMBOLS[0]]["dollar_volume"] == pytest.approx(110_000.0)
    assert merged[_SYMBOLS[1]]["status"] == "unavailable"
    assert merged[_SYMBOLS[1]]["unavailable_reason"] == "No data returned for this symbol"


# --------------------------------------------------------------------------- service
async def test_screener_refresh_populates_cache_and_publishes(monkeypatch, memory_redis):
    monkeypatch.setattr(
        "app.services.market_screener.get_provider",
        lambda _name: _StubProvider([
            ScreenerQuote(symbol=u.symbol, last_price=100.0, previous_close=90.0, volume=10.0,
                          session_date=date(2026, 9, 20))
            for u in market_screener.SCREENER_UNIVERSE
        ]),
    )
    result = await market_screener.refresh_screener(publish=True)
    assert result["refreshed"] is True
    assert result["ok"] == len(market_screener.SCREENER_UNIVERSE)

    payload = await market_screener.get_latest()
    assert payload["universe_size"] == len(market_screener.SCREENER_UNIVERSE)
    assert "not the full market" in payload["universe_note"]
    assert all(r["status"] == "ok" for r in payload["rows"])

    assert len(memory_redis.published) == 1
    channel, raw = memory_redis.published[0]
    from app.ws.events import SCOPE_GLOBAL, WS_CHANNEL

    envelope = json.loads(raw)
    assert channel == WS_CHANNEL
    assert envelope["scope"] == SCOPE_GLOBAL
    assert envelope["organization_id"] is None
    assert envelope["payload"]["type"] == "screener_update"


class _StubProvider:
    name = "stub"

    def __init__(self, quotes):
        self._quotes = quotes

    def fetch_screener_snapshot(self, symbols):
        return [q for q in self._quotes if q.symbol in symbols]


# --------------------------------------------------------------------------- heatmap
def test_sector_heatmap_aggregation_on_known_synthetic_dataset():
    """Two sectors, hand-computed expected weighted averages — proves the aggregation
    math, not just that it runs."""
    rows = [
        {"symbol": "A1", "name": "A1 Corp", "sector": "Tech", "change_pct": 10.0,
         "dollar_volume": 1000.0, "status": "ok"},
        {"symbol": "A2", "name": "A2 Corp", "sector": "Tech", "change_pct": -2.0,
         "dollar_volume": 3000.0, "status": "ok"},
        {"symbol": "B1", "name": "B1 Corp", "sector": "Energy", "change_pct": 5.0,
         "dollar_volume": 500.0, "status": "ok"},
        {"symbol": "B2", "name": "B2 Corp", "sector": "Energy", "change_pct": None,
         "dollar_volume": None, "status": "unavailable"},
    ]
    sectors = {s["sector"]: s for s in market_screener.sector_heatmap(rows)}

    # Tech: dollar-volume-weighted avg change = (1000*10 + 3000*-2) / 4000 = 1.0
    tech = sectors["Tech"]
    assert tech["total_dollar_volume"] == pytest.approx(4000.0)
    assert tech["avg_change_pct"] == pytest.approx(1.0)
    assert tech["symbol_count"] == 2 and tech["available_count"] == 2

    # Energy: only B1 contributes (B2 unavailable, zero weight) -> avg = 5.0
    energy = sectors["Energy"]
    assert energy["total_dollar_volume"] == pytest.approx(500.0)
    assert energy["avg_change_pct"] == pytest.approx(5.0)
    assert energy["symbol_count"] == 2 and energy["available_count"] == 1


def test_sector_heatmap_all_unavailable_sector_reports_none_not_zero():
    """A sector where every symbol is unavailable must report None (honest 'no data'),
    never a fabricated 0.0 average."""
    rows = [{"symbol": "X", "name": "X Corp", "sector": "Utilities", "change_pct": None,
             "dollar_volume": None, "status": "unavailable"}]
    sectors = market_screener.sector_heatmap(rows)
    assert sectors[0]["total_dollar_volume"] is None
    assert sectors[0]["avg_change_pct"] is None


# --------------------------------------------------------------------------- API
async def test_screener_and_heatmap_endpoints_reachable(client, db_session_factory, monkeypatch, memory_redis):
    monkeypatch.setattr(
        "app.services.market_screener.get_provider",
        lambda _name: _StubProvider([
            ScreenerQuote(symbol=u.symbol, last_price=100.0, previous_close=90.0, volume=10.0,
                          session_date=date(2026, 9, 20))
            for u in market_screener.SCREENER_UNIVERSE
        ]),
    )
    await market_screener.refresh_screener(publish=False)

    org, user = await create_org_user(db_session_factory, org_name="Screen Co", slug="screen-co", email="s@screen.co")
    token = await token_for(client, user.email)

    screener_resp = await client.get("/market/screener", headers=bearer(token))
    assert screener_resp.status_code == 200
    body = screener_resp.json()
    assert body["universe_size"] == len(market_screener.SCREENER_UNIVERSE)
    assert len(body["rows"]) == len(market_screener.SCREENER_UNIVERSE)

    heatmap_resp = await client.get("/market/heatmap", headers=bearer(token))
    assert heatmap_resp.status_code == 200
    heatmap_body = heatmap_resp.json()
    assert {s["sector"] for s in heatmap_body["sectors"]} == set(market_screener.SECTORS)
