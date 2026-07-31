"""Run real regime detection for a set of symbols in one organization.

Calls the production ``app.services.regime.run_regime_detection`` (the 4-model
ensemble: HMM + GMM + GARCH + PELT) for each symbol and persists the resulting
regime labels — the same code path the Celery ``run_regime_detection`` task uses.

This is what makes the dashboard's "Current Market Regime" and the cross-asset regime
view show *real* regimes for the ingested price data.

Default symbol set is the dashboard/cross-asset-relevant one (benchmark + asset-class
ETFs); pass --symbols to override, or --from-market-data to run every symbol that has
ingested bars (slow — the ensemble is CPU-heavy per symbol).

Usage (from backend/):
    .venv/Scripts/python.exe -m scripts.compute_regimes --org-slug meridian-capital
    ...--symbols SPY,QQQ,TLT
    ...--from-market-data          # every ingested symbol (slow)
"""

from __future__ import annotations

import argparse
import asyncio
import uuid
import warnings

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.models.market_data import MarketData
from app.models.organization import Organization
from app.services.regime import run_regime_detection
from sqlalchemy import distinct, select

# Silence noisy runtime warnings from the detectors (import order kept clean above).
warnings.filterwarnings("ignore")

DEFAULT_SYMBOLS = [
    "SPY", "QQQ", "DIA", "IWM", "VTI",           # equities
    "TLT", "IEF", "AGG", "LQD", "HYG",           # bonds
    "GLD", "SLV", "USO",                          # commodities
    "BTC-USD", "ETH-USD",                         # crypto
]


async def _resolve_org(slug: str) -> uuid.UUID:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        org_id = (
            await s.execute(select(Organization.id).where(Organization.slug == slug))
        ).scalar_one_or_none()
    if org_id is None:
        raise SystemExit(f"No organization with slug {slug!r}")
    return org_id


async def _symbols_with_data(org_id: uuid.UUID) -> list[str]:
    async with get_tenant_session(org_id) as s:
        rows = (await s.execute(select(distinct(MarketData.symbol)))).scalars().all()
    return sorted(rows)


async def main() -> int:
    ap = argparse.ArgumentParser(description="Run regime detection for a set of symbols.")
    ap.add_argument("--org-slug", required=True)
    ap.add_argument("--symbols", help="Comma-separated symbols (default: dashboard/cross-asset set).")
    ap.add_argument("--from-market-data", action="store_true", help="Every symbol that has bars (slow).")
    args = ap.parse_args()

    org_id = await _resolve_org(args.org_slug)
    if args.from_market_data:
        symbols = await _symbols_with_data(org_id)
    elif args.symbols:
        symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    else:
        symbols = DEFAULT_SYMBOLS

    total = len(symbols)
    print(f"Regime detection for {total} symbols in {args.org_slug}", flush=True)
    ok = 0
    failures: list[tuple[str, str]] = []
    for i, symbol in enumerate(symbols, 1):
        try:
            result = await run_regime_detection(org_id, symbol)
            print(
                f"[{i}/{total}] ok   {symbol:10} latest={result.new_regime} rows={result.rows}",
                flush=True,
            )
            ok += 1
        except Exception as exc:  # noqa: BLE001
            failures.append((symbol, f"{type(exc).__name__}: {str(exc)[:120]}"))
            print(f"[{i}/{total}] FAIL {symbol:10} {type(exc).__name__}: {str(exc)[:120]}", flush=True)

    print(f"\nDONE: {ok}/{total} succeeded, {len(failures)} failed.", flush=True)
    for sym, why in failures:
        print(f"  {sym:10} {why}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
