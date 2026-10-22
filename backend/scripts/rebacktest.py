"""Re-run regime-aware backtests for an organization's strategies.

Use after a market-data refresh so performance metrics reflect the latest real prices
rather than whatever the data looked like when the strategy was first evaluated.

What it changes (via the production ``app.services.strategy.run_backtest``):
  * performance snapshots + trade records are deleted and re-inserted for the strategy
  * ``robustness_score`` and ``regime_compatibility`` are recomputed

What it deliberately does NOT change: the strategy's lifecycle ``status`` and its
approval records. A re-backtest refreshes evidence; promoting or retiring a strategy
stays a governed, human decision.

``regime_compatibility`` drives Research Memory's ``VALID_IN`` relationships; the API
rebuilds that index from Postgres on its next refresh, so nothing else needs running.

Symbol selection: strategies do not store a symbol (it is a backtest parameter), so it
is derived from the strategy name — the convention the demo data follows — and falls
back to the organization's ``benchmark_symbol`` when the name carries no hint.

Usage (from backend/):
    .venv/Scripts/python.exe -m scripts.rebacktest --org-slug meridian-capital
    ...--symbol SPY        # force one symbol for every strategy
    ...--limit 5           # smoke test
"""

from __future__ import annotations

import argparse
import asyncio
import uuid
import warnings

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.models.organization import Organization
from app.models.strategy import Strategy
from app.services import strategy as strategy_service
from sqlalchemy import select

warnings.filterwarnings("ignore")

# Longest prefix wins, so "GOLD" is matched before a bare fallback.
_NAME_HINTS: tuple[tuple[str, str], ...] = (
    ("SPY", "SPY"),
    ("QQQ", "QQQ"),
    ("GOLD", "GLD"),
    ("GLD", "GLD"),
    ("BTC", "BTC-USD"),
    ("ETH", "ETH-USD"),
)


def symbol_for(name: str, *, fallback: str) -> str:
    upper = name.upper()
    for hint, symbol in _NAME_HINTS:
        if hint in upper:
            return symbol
    return fallback


async def _resolve_org(slug: str) -> tuple[uuid.UUID, str]:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        row = (
            await s.execute(
                select(Organization.id, Organization.benchmark_symbol).where(
                    Organization.slug == slug
                )
            )
        ).first()
    if row is None:
        raise SystemExit(f"No organization with slug {slug!r}")
    return row[0], (row[1] or "SPY")


async def main() -> int:
    ap = argparse.ArgumentParser(description="Re-run backtests against current market data.")
    ap.add_argument("--org-slug", required=True)
    ap.add_argument("--symbol", help="Force this symbol for every strategy.")
    ap.add_argument("--limit", type=int, default=0, help="Only the first N strategies (0 = all).")
    args = ap.parse_args()

    org_id, benchmark = await _resolve_org(args.org_slug)

    async with get_tenant_session(org_id) as session:
        rows = (await session.execute(select(Strategy.id, Strategy.name))).all()
    if args.limit:
        rows = rows[: args.limit]

    total = len(rows)
    print(f"Re-backtesting {total} strategies in {args.org_slug} (benchmark {benchmark})", flush=True)

    ok = 0
    failures: list[tuple[str, str]] = []
    for i, (strategy_id, name) in enumerate(rows, 1):
        symbol = args.symbol or symbol_for(name, fallback=benchmark)
        try:
            result = await strategy_service.run_backtest(org_id, strategy_id, symbol)
            score = result.get("robustness_score")
            score_str = f"{score:.3f}" if isinstance(score, (int, float)) else "n/a"
            print(f"[{i}/{total}] ok   {name[:38]:38} {symbol:8} robustness={score_str}", flush=True)
            ok += 1
        except Exception as exc:  # noqa: BLE001 - one strategy's failure is not fatal
            detail = f"{type(exc).__name__}: {str(exc)[:110]}"
            failures.append((name, detail))
            print(f"[{i}/{total}] FAIL {name[:38]:38} {symbol:8} {detail}", flush=True)

    print(f"\nDONE: {ok}/{total} succeeded, {len(failures)} failed.", flush=True)
    for name, why in failures[:25]:
        print(f"  {name[:40]:40} {why}", flush=True)
    if ok:
        print("\nNOTE: regime_compatibility changed -> Research Memory picks up the new VALID_IN "
              "relationships on the API's next rebuild.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
