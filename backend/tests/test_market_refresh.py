"""Continuous data integration: the daily market-refresh sweep.

NO TEST HERE MAKES A LIVE NETWORK CALL. ``refresh_organization`` has exactly one
network egress point — the market-data provider it obtains from
``market_refresh.get_provider`` — and every test replaces that with an in-memory fake
that returns a hand-built DataFrame. ``test_refresh_never_calls_the_real_provider``
additionally boobytraps the real yfinance provider so a regression that bypassed the
seam would fail loudly rather than silently dial out.

The behaviour under test is the part that is easy to get wrong and expensive when it
is: the sweep must recompute regimes ONLY for symbols whose latest bar actually moved
forward. Without that, every weekend and public holiday would re-run the 4-model
ensemble across the whole universe for no new information.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pandas as pd
from app.db.tenant import bind_organization
from app.services import market_refresh

from tests.data_helpers import seed_market_data
from tests.helpers import bearer
from tests.helpers import register_activate_login as register

# compute_features' longest rolling window is SMA-50, and the ``ta`` indicators raise
# rather than emit NaN when given fewer rows — so every fixture needs >= 50 bars.
_SEED_BARS = 60
_SEED_START = datetime(2024, 1, 1, tzinfo=UTC)


def _frame(*, bars: int) -> pd.DataFrame:
    """A provider-shaped OHLCV frame: one daily bar from _SEED_START, ``bars`` long."""
    rows = []
    for i in range(bars):
        close = 100.0 + i  # monotonic: keeps the indicators well-defined
        rows.append(
            {
                "timestamp": _SEED_START + timedelta(days=i),
                "open": close,
                "high": close + 1,
                "low": close - 1,
                "close": close,
                "volume": 1_000_000.0,
            }
        )
    return pd.DataFrame(rows)


class _FakeProvider:
    """Stands in for yfinance. Returns a canned frame; never touches the network."""

    name = "fake"

    def __init__(self, frames: dict[str, pd.DataFrame], *, fail_for: set[str] | None = None):
        self._frames = frames
        self._fail_for = fail_for or set()
        self.calls: list[str] = []

    def fetch_ohlcv(self, symbol, start, end, interval):  # noqa: D102 - provider protocol
        self.calls.append(symbol)
        if symbol in self._fail_for:
            raise RuntimeError(f"simulated provider outage for {symbol}")
        return self._frames[symbol]


def _patch_seams(monkeypatch, db_session_factory, provider: _FakeProvider) -> list[str]:
    """Point market_refresh at the test DB + fake provider, and spy on regime runs.

    ``refresh_organization`` calls the module-level ``get_tenant_session`` directly
    (not the FastAPI dependency), so conftest's dependency overrides do not reach it —
    it is redirected here instead. Returns the list that records regime recomputes.
    """

    @asynccontextmanager
    async def _fake_tenant_session(organization_id):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, organization_id)
            yield session

    recomputed: list[str] = []

    async def _spy_regime(organization_id, symbol):
        recomputed.append(symbol)
        return None

    monkeypatch.setattr(market_refresh, "get_tenant_session", _fake_tenant_session)
    monkeypatch.setattr(market_refresh, "get_provider", lambda _name: provider)
    # The ensemble itself is covered by the regime tests; here we only assert WHETHER
    # it is invoked, so a spy keeps this test fast and focused on the sweep's logic.
    monkeypatch.setattr(market_refresh, "run_regime_detection", _spy_regime)
    return recomputed


async def _org(client) -> uuid.UUID:
    reg = await register(client, org_name="Refresh Co", email="ops@refresh.io")
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    return uuid.UUID(me["user"]["organization_id"])


# --------------------------------------------------------------------------- #
# The core efficiency guarantee
# --------------------------------------------------------------------------- #
async def test_no_new_bars_skips_the_regime_recompute(client, db_session_factory, monkeypatch):
    """Weekend/holiday case: the provider returns the same latest bar we already have,
    so nothing advanced and the expensive ensemble must NOT run."""
    org_id = await _org(client)
    await seed_market_data(
        db_session_factory,
        organization_id=org_id,
        symbol="SPY",
        closes=[100.0 + i for i in range(_SEED_BARS)],
    )

    provider = _FakeProvider({"SPY": _frame(bars=_SEED_BARS)})
    recomputed = _patch_seams(monkeypatch, db_session_factory, provider)

    result = await market_refresh.refresh_organization(str(org_id))

    assert result["symbols_tracked"] == 1
    assert result["symbols_refreshed"] == 1, "bars are still upserted (cheap)"
    assert result["symbols_advanced"] == 0, "no newer bar than we already had"
    assert result["regimes_recomputed"] == 0
    assert recomputed == [], "the 4-model ensemble must not run when nothing moved"


async def test_a_newer_bar_triggers_the_regime_recompute(client, db_session_factory, monkeypatch):
    """A new trading day: the provider returns bars past our latest, so the symbol is
    marked advanced and its regime is recomputed."""
    org_id = await _org(client)
    await seed_market_data(
        db_session_factory,
        organization_id=org_id,
        symbol="SPY",
        closes=[100.0 + i for i in range(_SEED_BARS)],
    )

    # Five extra daily bars beyond what the DB holds.
    provider = _FakeProvider({"SPY": _frame(bars=_SEED_BARS + 5)})
    recomputed = _patch_seams(monkeypatch, db_session_factory, provider)

    result = await market_refresh.refresh_organization(str(org_id))

    assert result["symbols_advanced"] == 1
    assert result["regimes_recomputed"] == 1
    assert recomputed == ["SPY"]


# --------------------------------------------------------------------------- #
# Scope + resilience
# --------------------------------------------------------------------------- #
async def test_scope_is_the_symbols_the_org_already_tracks(client, db_session_factory, monkeypatch):
    """Self-adjusting universe: the sweep refreshes exactly what the org holds — a
    symbol it has never ingested is never fetched."""
    org_id = await _org(client)
    for symbol in ("SPY", "TLT"):
        await seed_market_data(
            db_session_factory,
            organization_id=org_id,
            symbol=symbol,
            closes=[100.0 + i for i in range(_SEED_BARS)],
        )

    provider = _FakeProvider(
        {"SPY": _frame(bars=_SEED_BARS), "TLT": _frame(bars=_SEED_BARS), "NVDA": _frame(bars=_SEED_BARS)}
    )
    _patch_seams(monkeypatch, db_session_factory, provider)

    result = await market_refresh.refresh_organization(str(org_id))

    assert result["symbols_tracked"] == 2
    assert sorted(provider.calls) == ["SPY", "TLT"], "NVDA is not tracked, so never fetched"


async def test_one_symbol_failing_does_not_abort_the_sweep(client, db_session_factory, monkeypatch):
    """A provider outage on a single symbol is logged and skipped — the rest of the
    universe still refreshes. One bad ticker must not cost the whole nightly run."""
    org_id = await _org(client)
    for symbol in ("SPY", "TLT"):
        await seed_market_data(
            db_session_factory,
            organization_id=org_id,
            symbol=symbol,
            closes=[100.0 + i for i in range(_SEED_BARS)],
        )

    provider = _FakeProvider(
        {"SPY": _frame(bars=_SEED_BARS + 5), "TLT": _frame(bars=_SEED_BARS + 5)},
        fail_for={"SPY"},
    )
    recomputed = _patch_seams(monkeypatch, db_session_factory, provider)

    result = await market_refresh.refresh_organization(str(org_id))

    assert result["symbols_tracked"] == 2
    assert result["symbols_refreshed"] == 1, "TLT survives SPY's failure"
    assert recomputed == ["TLT"]


async def test_a_symbol_returning_no_data_is_skipped(client, db_session_factory, monkeypatch):
    """An empty provider response is a no-op, not a crash and not a false 'advanced'."""
    org_id = await _org(client)
    await seed_market_data(
        db_session_factory,
        organization_id=org_id,
        symbol="SPY",
        closes=[100.0 + i for i in range(_SEED_BARS)],
    )

    provider = _FakeProvider({"SPY": pd.DataFrame()})
    recomputed = _patch_seams(monkeypatch, db_session_factory, provider)

    result = await market_refresh.refresh_organization(str(org_id))

    assert result["symbols_refreshed"] == 0
    assert result["symbols_advanced"] == 0
    assert recomputed == []


# --------------------------------------------------------------------------- #
# No-network guarantee
# --------------------------------------------------------------------------- #
async def test_refresh_never_calls_the_real_provider(client, db_session_factory, monkeypatch):
    """Boobytrap the real yfinance provider: if a refactor ever bypassed the injection
    seam and reached for the live feed, this fails instead of silently hitting Yahoo."""
    from app.providers import yfinance_provider

    def _explode(*args, **kwargs):  # pragma: no cover - must never run
        raise AssertionError("market refresh attempted a live yfinance call")

    monkeypatch.setattr(yfinance_provider.YFinanceProvider, "fetch_ohlcv", _explode)

    org_id = await _org(client)
    await seed_market_data(
        db_session_factory,
        organization_id=org_id,
        symbol="SPY",
        closes=[100.0 + i for i in range(_SEED_BARS)],
    )
    provider = _FakeProvider({"SPY": _frame(bars=_SEED_BARS)})
    _patch_seams(monkeypatch, db_session_factory, provider)

    result = await market_refresh.refresh_organization(str(org_id))

    assert result["symbols_refreshed"] == 1
    assert provider.calls == ["SPY"], "the fake, and only the fake, was used"
