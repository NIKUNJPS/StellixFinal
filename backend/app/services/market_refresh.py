"""Daily market-data refresh (continuous data integration).

Keeps every active organization's tracked symbols current with the market, so the
dashboard, regimes, and Research Memory reflect *today's* reality rather than a
one-off ingestion. Invoked by the Celery beat task ``refresh_market_universe``.

Design:
* **Self-adjusting scope.** For each active org it refreshes exactly the symbols that
  org already tracks (``distinct(market_data.symbol)``) — no hardcoded universe. A new
  org that ingests 10 symbols keeps those 10 fresh; Meridian keeps its 523 fresh.
* **Incremental.** It fetches only the last ``lookback_days`` of bars and upserts them
  (``persist_market_data`` dedups on the PK), instead of re-pulling years every night.
* **Regime recompute only when data actually moved.** It snapshots each symbol's latest
  bar date before and after the fetch; the 4-model ensemble is re-run only for symbols
  whose latest bar advanced. So on weekends/holidays (no new bars) the expensive step is
  skipped entirely.
* **Best-effort.** One bad symbol or a provider hiccup is logged and skipped — it never
  aborts the sweep for the rest.

This drives the same production code path as manual ingestion (``run_ingestion``) and
detection (``run_regime_detection``); it is not a parallel implementation.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import func, select

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.features.engineering import compute_features
from app.models.market_data import MarketData
from app.models.organization import Organization, OrganizationStatus
from app.providers import get_provider
from app.services.ingestion import persist_features, persist_market_data, validate_and_clean
from app.services.regime import run_regime_detection

logger = logging.getLogger(__name__)

# The refresh must fetch enough trailing history for feature engineering to compute —
# the longest rolling window is SMA-50, and the ``ta`` indicators raise (not NaN) when
# given fewer rows than their period. ~120 calendar days ≈ 83 trading days comfortably
# clears the 50-bar window with a holiday buffer. It's still ~6x smaller than a full
# 2-year pull, and ``persist_market_data`` upserts, so the overlap is deduped — the net
# effect is "today's bar + a recompute of the recent trailing window", i.e. incremental.
_DEFAULT_LOOKBACK_DAYS = 120
_DEFAULT_PROVIDER = "yfinance"


async def _active_org_ids() -> list[str]:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        rows = (
            await s.execute(
                select(Organization.id).where(Organization.status == OrganizationStatus.ACTIVE)
            )
        ).scalars().all()
    return [str(r) for r in rows]


async def _symbol_latest_dates(session) -> dict[str, date]:
    """symbol -> latest bar date, for the currently-bound org."""
    rows = (
        await session.execute(
            select(MarketData.symbol, func.max(MarketData.timestamp)).group_by(MarketData.symbol)
        )
    ).all()
    return {sym: ts.date() for sym, ts in rows if ts is not None}


async def refresh_organization(
    org_id: str,
    *,
    lookback_days: int = _DEFAULT_LOOKBACK_DAYS,
    provider_name: str = _DEFAULT_PROVIDER,
    symbols: list[str] | None = None,
) -> dict:
    """Refresh one org's tracked symbols; recompute regimes only where data advanced.

    ``symbols`` restricts the refresh to a subset (e.g. a watchlist); ``None`` refreshes
    every symbol the org already tracks.
    """
    import uuid

    org_uuid = uuid.UUID(org_id)
    provider = get_provider(provider_name)
    end = date.today()
    start = end - timedelta(days=lookback_days)

    async with get_tenant_session(org_uuid) as session:
        before = await _symbol_latest_dates(session)

    symbols = sorted(before.keys()) if symbols is None else [s for s in symbols if s in before]
    refreshed = 0
    advanced: list[str] = []

    for symbol in symbols:
        try:
            raw = provider.fetch_ohlcv(symbol, start, end, "1d")
            if raw is None or len(raw) == 0:
                continue
            clean, _warnings = validate_and_clean(raw, "1d")
            if clean.empty:
                continue
            feats = compute_features(clean)
            async with get_tenant_session(org_uuid) as session:
                await persist_market_data(
                    session, organization_id=org_uuid, symbol=symbol, source=provider.name, df=clean
                )
                await persist_features(
                    session, organization_id=org_uuid, symbol=symbol, features=feats
                )
            refreshed += 1
            # Did the latest bar move forward? (New trading day vs. weekend/holiday.)
            # ``clean`` carries a ``timestamp`` column (not a datetime index), so read it.
            new_latest = clean["timestamp"].max()
            new_date = new_latest.date() if hasattr(new_latest, "date") else new_latest
            if symbol not in before or new_date > before[symbol]:
                advanced.append(symbol)
        except Exception as exc:  # noqa: BLE001 - per-symbol failure is logged, not fatal
            logger.warning("Market refresh failed for %s (org=%s): %s", symbol, org_id, exc)

    # Regime recompute only for symbols that actually gained a newer bar.
    regimes_recomputed = 0
    for symbol in advanced:
        try:
            await run_regime_detection(org_uuid, symbol)
            regimes_recomputed += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Regime recompute failed for %s (org=%s): %s", symbol, org_id, exc)

    summary = {
        "organization_id": org_id,
        "symbols_tracked": len(symbols),
        "symbols_refreshed": refreshed,
        "symbols_advanced": len(advanced),
        "regimes_recomputed": regimes_recomputed,
    }
    logger.info("Market refresh for org %s: %s", org_id, summary)
    return summary


async def refresh_all_active_orgs(
    *, lookback_days: int = _DEFAULT_LOOKBACK_DAYS, provider_name: str = _DEFAULT_PROVIDER
) -> list[dict]:
    """Sweep every ACTIVE org. Returns one summary dict per org."""
    org_ids = await _active_org_ids()
    summaries: list[dict] = []
    for org_id in org_ids:
        summaries.append(
            await refresh_organization(
                org_id, lookback_days=lookback_days, provider_name=provider_name
            )
        )
    return summaries
