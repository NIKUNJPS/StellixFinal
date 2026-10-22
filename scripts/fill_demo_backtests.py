"""Populate the Meridian demo book so no dashboard panel is empty.

Idempotent and uses only the platform's own engine (no fabricated numbers):

1. Adds well-known, real-world strategy families (Bollinger breakout, RSI pullback in an
   uptrend, MACD trend following, low-volatility trend, RSI mean reversion) on the symbols
   that have real ingested history, then runs the real regime-aware backtest and the full
   5-method validation for each. They are submitted as *candidates*; nothing is activated
   here - going live still needs a human approval with a written reason.
2. Re-runs the real backtest for every existing Meridian strategy so its equity curve /
   drawdown / rolling-Sharpe series are cached (the dashboard's top-5 overlay and the
   Backtest Results page read that cache; it had never been populated, or had expired).

Usage:  backend\\.venv\\Scripts\\python.exe scripts\\fill_demo_backtests.py [--skip-new] [--only-missing]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(ROOT, "backend"))
sys.path.insert(0, os.getcwd())

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.clients import redis_client  # noqa: E402
from app.db.session import SessionFactory, dispose_engine, get_tenant_session  # noqa: E402
from app.db.tenant import bind_organization, mark_session_unscoped  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.strategy import Strategy  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import strategy as strat_svc  # noqa: E402

ORG_SLUG = "meridian-capital"
AUTHOR_EMAIL = "dpark@meridian.com"
SYMBOL_BY_PREFIX = {"SPY": "SPY", "QQQ": "QQQ", "GOLD": "GLD", "GLD": "GLD", "BTC": "BTC-USD", "ETH": "ETH-USD"}


def _risk(dd: float = 20.0, pos: float = 15.0, stop: float = 6.0) -> dict:
    return {"max_drawdown_pct": dd, "max_position_size_pct": pos, "stop_loss_pct": stop}


def _rule(*conditions: dict, op: str = "AND") -> dict:
    return {"operator": op, "conditions": list(conditions)}


def _c(ind: str, cmp: str, ref: str | None = None, value: float | None = None) -> dict:
    cond: dict = {"indicator": ind, "comparator": cmp}
    if ref is not None:
        cond["value_ref"] = ref
    else:
        cond["value"] = value
    return cond


TREND_EXIT = _rule(_c("close", "crosses_below", "sma_50"))

# (name, symbol, entry rule, exit rule, risk) - recognisable public strategy families.
NEW_STRATEGIES = [
    ("QQQ Bollinger Breakout (Turtle-style)", "QQQ",
     _rule(_c("close", "crosses_above", "bollinger_upper")),
     _rule(_c("close", "crosses_below", "sma_20")), _risk()),
    ("GLD Bollinger Breakout", "GLD",
     _rule(_c("close", "crosses_above", "bollinger_upper")),
     _rule(_c("close", "crosses_below", "sma_20")), _risk()),
    ("SPY RSI Pullback in Uptrend", "SPY",
     _rule(_c("rsi_14", "<", value=40), _c("close", ">", "sma_50")),
     _rule(_c("rsi_14", ">", value=60)), _risk()),
    ("QQQ RSI Pullback in Uptrend", "QQQ",
     _rule(_c("rsi_14", "<", value=40), _c("close", ">", "sma_50")),
     _rule(_c("rsi_14", ">", value=60)), _risk()),
    ("BTC RSI Pullback in Uptrend", "BTC-USD",
     _rule(_c("rsi_14", "<", value=40), _c("close", ">", "sma_50")),
     _rule(_c("rsi_14", ">", value=60)), _risk(dd=30.0, pos=10.0, stop=10.0)),
    ("SPY Low-Volatility Trend", "SPY",
     _rule(_c("close", "crosses_above", "sma_50"), _c("realized_vol_20", "<", value=0.012)),
     TREND_EXIT, _risk()),
    ("SPY MACD Signal Cross", "SPY",
     _rule(_c("macd", "crosses_above", "macd_signal")),
     _rule(_c("macd", "crosses_below", "macd_signal")), _risk()),
    ("GLD MACD Trend Following", "GLD",
     _rule(_c("macd", "crosses_above", "macd_signal"), _c("close", ">", "sma_50")),
     TREND_EXIT, _risk()),
    ("BTC MACD Trend Following", "BTC-USD",
     _rule(_c("macd", "crosses_above", "macd_signal"), _c("close", ">", "sma_50")),
     TREND_EXIT, _risk(dd=30.0, pos=10.0, stop=10.0)),
    ("GLD RSI Mean Reversion", "GLD",
     _rule(_c("rsi_14", "<", value=35)),
     _rule(_c("rsi_14", ">", value=55)), _risk()),
]


def symbol_for(strategy: Strategy) -> str:
    if strategy.symbol:
        return strategy.symbol.strip().upper()
    head = strategy.name.split()[0].upper()
    return SYMBOL_BY_PREFIX.get(head, "SPY")


async def add_new(org_id, author_id) -> None:
    async with SessionFactory() as s:
        mark_session_unscoped(s.sync_session)
        existing = set((await s.execute(select(Strategy.name).where(Strategy.organization_id == org_id))).scalars())
    todo = [spec for spec in NEW_STRATEGIES if spec[0] not in existing]
    print(f"[new] {len(NEW_STRATEGIES) - len(todo)} already present, creating {len(todo)}", flush=True)
    created: list[tuple] = []
    async with get_tenant_session(org_id) as session:
        bind_organization(session.sync_session, org_id)
        organization = await session.get(Organization, org_id)
        author = await session.get(User, author_id)
        for name, symbol, entry, exit_rules, risk in todo:
            strat = await strat_svc.create_strategy(
                session, organization=organization, user=author,
                data={"name": name, "creator": "human", "entry_rules": entry,
                      "exit_rules": exit_rules, "risk_constraints": risk},
            )
            created.append((strat.id, name, symbol))
    for sid, name, symbol in created:
        t0 = time.time()
        try:
            await strat_svc.run_backtest(org_id, sid, symbol)
            vr = await strat_svc.run_strategy_validation(org_id, sid, symbol)
            async with get_tenant_session(org_id) as session:
                bind_organization(session.sync_session, org_id)
                strat = await session.get(Strategy, sid)
                strat.symbol = symbol
                try:
                    await strat_svc.submit(session, strategy=strat)
                    state = "candidate"
                except Exception as exc:  # noqa: BLE001
                    state = f"draft ({exc})"
            print(f"  {name:42s} robustness={vr.get('composite_score')} -> {state} [{time.time()-t0:.1f}s]", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  {name:42s} FAILED: {exc}", flush=True)


async def refill_cache(org_id, only_missing: bool) -> None:
    async with SessionFactory() as s:
        mark_session_unscoped(s.sync_session)
        rows = (await s.execute(select(Strategy).where(Strategy.organization_id == org_id).order_by(Strategy.created_at))).scalars().all()
        targets = [(r.id, r.name, symbol_for(r)) for r in rows]
    redis = redis_client.get_client()
    ok = failed = skipped = 0
    for i, (sid, name, symbol) in enumerate(targets, 1):
        if only_missing and await redis.exists(f"backtest:charts:{sid}"):
            skipped += 1
            continue
        try:
            await strat_svc.run_backtest(org_id, sid, symbol)
            ok += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  [{i}/{len(targets)}] {name[:48]} ({symbol}) FAILED: {str(exc)[:120]}", flush=True)
        if i % 10 == 0:
            print(f"  ...{i}/{len(targets)} (ok={ok} failed={failed})", flush=True)
    print(f"[cache] re-ran {ok}, failed {failed}, already cached {skipped}", flush=True)


async def main() -> None:
    # Offline data job: index into a throwaway Research Memory. The API re-derives the real
    # index from Postgres on its next rebuild, so nothing else needs syncing afterwards.
    from app.graph.memory_repository import InMemoryGraphRepository
    from app.graph.sync_service import set_repository_override

    set_repository_override(InMemoryGraphRepository())
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-new", action="store_true")
    ap.add_argument("--only-missing", action="store_true")
    args = ap.parse_args()
    async with SessionFactory() as s:
        mark_session_unscoped(s.sync_session)
        org_id = (await s.execute(select(Organization.id).where(Organization.slug == ORG_SLUG))).scalar_one()
        author_id = (await s.execute(select(User.id).where(User.email == AUTHOR_EMAIL))).scalar_one()
    if not args.skip_new:
        await add_new(org_id, author_id)
    await refill_cache(org_id, args.only_missing)
    await dispose_engine()


asyncio.run(main())
