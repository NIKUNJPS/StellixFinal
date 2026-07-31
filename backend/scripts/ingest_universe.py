"""Bulk-ingest a real market-data universe (yfinance) into one organization.

Pulls real daily OHLC for the S&P 500 plus a set of asset-class ETFs (equities,
bonds, commodities, crypto) and runs the **real** ingestion pipeline for each symbol:

    provider.fetch_ohlcv -> validate_and_clean -> compute_features
      -> persist_market_data (+ features)

These are the exact functions ``app/services/ingestion.run_ingestion`` wraps, so this
is not a parallel reimplementation — it drives the production code path, just in a loop
and without creating one IngestionJob row per symbol.

It is idempotent: ``persist_market_data`` upserts on (org, symbol, timestamp), so
re-running only refreshes/extends existing bars.

Honest scope note: "cover all stocks and bonds" is not achievable or useful — there is
no free comprehensive feed (individual bonds especially trade OTC with no free data), and
per-symbol fetching is rate-limited. The professional approach, used here, is a curated
cross-asset UNIVERSE: the S&P 500 for equities and liquid ETFs as proxies for the other
asset classes (e.g. TLT/IEF/AGG/LQD/HYG for bonds, GLD/SLV/USO for commodities,
BTC-USD/ETH-USD for crypto).

Usage (from backend/):
    .venv/Scripts/python.exe -m scripts.ingest_universe --org-slug meridian-capital --years 2
    ...--limit 30        # smoke test on the first 30 symbols
    ...--etfs-only       # just the asset-class ETFs (fast)
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import io
import urllib.request
import uuid
import warnings
from datetime import date, timedelta

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.features.engineering import compute_features
from app.models.organization import Organization
from app.providers import get_provider
from app.services.ingestion import (
    persist_features,
    persist_market_data,
    validate_and_clean,
)
from sqlalchemy import select

# Silence noisy runtime warnings from yfinance/pandas (import order kept clean above).
warnings.filterwarnings("ignore")

_SP500_CSV = (
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
)

# Liquid ETFs standing in for whole asset classes (the "bonds" answer is proxy ETFs,
# since individual bonds have no free feed).
ASSET_CLASS_ETFS = [
    # Equities (broad)
    "SPY", "QQQ", "DIA", "IWM", "VTI",
    # Bonds (treasuries, aggregate, corp IG, high-yield, TIPS)
    "TLT", "IEF", "SHY", "AGG", "BND", "LQD", "HYG", "TIP",
    # Commodities
    "GLD", "SLV", "USO", "DBC", "UNG",
    # Crypto
    "BTC-USD", "ETH-USD",
]


def _fetch_sp500() -> list[str]:
    with urllib.request.urlopen(_SP500_CSV, timeout=30) as resp:
        rows = list(csv.DictReader(io.StringIO(resp.read().decode())))
    # yfinance uses '-' for class shares (BRK.B -> BRK-B, BF.B -> BF-B).
    return [r["Symbol"].strip().replace(".", "-") for r in rows if r.get("Symbol")]


def build_universe(*, etfs_only: bool) -> list[str]:
    universe = list(ASSET_CLASS_ETFS)
    if not etfs_only:
        universe += _fetch_sp500()
    # De-dup, preserve order (ETFs first so the dashboard-relevant symbols land early).
    seen: set[str] = set()
    ordered: list[str] = []
    for s in universe:
        if s not in seen:
            seen.add(s)
            ordered.append(s)
    return ordered


async def _resolve_org(slug: str) -> uuid.UUID:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        org_id = (
            await s.execute(select(Organization.id).where(Organization.slug == slug))
        ).scalar_one_or_none()
    if org_id is None:
        raise SystemExit(f"No organization with slug {slug!r}")
    return org_id


async def ingest_symbol(
    org_id: uuid.UUID, symbol: str, *, start: date, end: date, provider_name: str
) -> tuple[bool, str]:
    """Returns (ok, detail). Never raises — a bad symbol must not abort the run."""
    try:
        provider = get_provider(provider_name)
        raw = provider.fetch_ohlcv(symbol, start, end, "1d")
        if raw is None or len(raw) == 0:
            return False, "no data returned"
        clean, _warnings = validate_and_clean(raw, "1d")
        if clean.empty:
            return False, "empty after validation"
        feats = compute_features(clean)
        async with get_tenant_session(org_id) as session:
            n_md = await persist_market_data(
                session, organization_id=org_id, symbol=symbol, source=provider.name, df=clean
            )
            await persist_features(
                session, organization_id=org_id, symbol=symbol, features=feats
            )
        return True, f"bars={n_md}"
    except Exception as exc:  # noqa: BLE001 - one symbol's failure is logged, not fatal
        return False, f"{type(exc).__name__}: {str(exc)[:120]}"


async def main() -> int:
    ap = argparse.ArgumentParser(description="Bulk-ingest a real market universe via yfinance.")
    ap.add_argument("--org-slug", required=True)
    ap.add_argument("--years", type=int, default=2, help="Years of daily history (default 2).")
    ap.add_argument("--provider", default="yfinance")
    ap.add_argument("--limit", type=int, default=0, help="Ingest only the first N symbols (0 = all).")
    ap.add_argument("--etfs-only", action="store_true", help="Skip the S&P 500; ETFs only.")
    ap.add_argument("--sleep", type=float, default=0.3, help="Seconds between symbols (rate-limit guard).")
    args = ap.parse_args()

    org_id = await _resolve_org(args.org_slug)
    universe = build_universe(etfs_only=args.etfs_only)
    if args.limit:
        universe = universe[: args.limit]

    end = date.today()
    start = end - timedelta(days=args.years * 365)
    total = len(universe)
    print(f"UNIVERSE: {total} symbols into org {args.org_slug} ({args.years}y daily, {args.provider})", flush=True)

    ok = 0
    failures: list[tuple[str, str]] = []
    for i, symbol in enumerate(universe, 1):
        good, detail = await ingest_symbol(
            org_id, symbol, start=start, end=end, provider_name=args.provider
        )
        if good:
            ok += 1
        else:
            failures.append((symbol, detail))
        # One line per symbol so progress is streamable; keep it compact.
        status = "ok " if good else "FAIL"
        print(f"[{i}/{total}] {status} {symbol:10} {detail}", flush=True)
        if args.sleep:
            await asyncio.sleep(args.sleep)

    print(f"\nDONE: {ok}/{total} succeeded, {len(failures)} failed.", flush=True)
    if failures:
        print("Failed symbols (first 25):", flush=True)
        for sym, why in failures[:25]:
            print(f"  {sym:10} {why}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
