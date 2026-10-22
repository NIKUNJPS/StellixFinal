"""Shared helpers for the evaluation experiments: load real frames once, cache them, split by time.

Everything here uses the platform's own code paths (feature matrix, regime labels, the DSL signal
generator, the vectorbt backtest settings) so the experiments measure the shipped system.
"""
from __future__ import annotations

import asyncio
import json
import os
import pickle
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.join(ROOT, "backend")
EVAL_DIR = os.path.join(ROOT, "docs", "evaluation")
EVIDENCE = os.path.join(EVAL_DIR, "evidence")
CACHE = os.path.join(os.environ.get("EVAL_CACHE", os.path.join(ROOT, "var", "eval_cache")))
os.makedirs(EVIDENCE, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)
os.chdir(BACKEND)

SEED = 42
TRAIN_FRACTION = 0.6
SYMBOL_BY_PREFIX = {"SPY": "SPY", "QQQ": "QQQ", "GOLD": "GLD", "GLD": "GLD", "BTC": "BTC-USD"}


def strategy_symbol(name: str, symbol: str | None) -> str | None:
    return symbol.strip().upper() if symbol else SYMBOL_BY_PREFIX.get(name.split()[0].upper())


def canonical(strategy: dict) -> str:
    return json.dumps(
        {k: strategy.get(k) for k in ("entry_rules", "exit_rules", "risk_constraints")}, sort_keys=True, default=str
    )


async def _load(symbol: str):
    import app.models  # noqa: F401
    from sqlalchemy import select

    from app.db.session import SessionFactory, dispose_engine, get_tenant_session
    from app.db.tenant import bind_organization, mark_session_unscoped
    from app.models.organization import Organization
    from app.services.strategy import _load_backtest_frames

    try:
        async with SessionFactory() as s0:
            mark_session_unscoped(s0.sync_session)
            org = (await s0.execute(select(Organization.id).where(Organization.slug == "meridian-capital"))).scalar_one()
        async with get_tenant_session(org) as session:
            bind_organization(session.sync_session, org)
            return await _load_backtest_frames(session, symbol)
    finally:
        await dispose_engine()


def load_frames(symbol: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(feature_df indexed by timestamp incl. close, regime_df[timestamp, regime_label]); cached on disk."""
    path = os.path.join(CACHE, f"{symbol}.pkl")
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return pickle.load(fh)
    feature_df, regime_df = asyncio.run(_load(symbol))
    with open(path, "wb") as fh:
        pickle.dump((feature_df, regime_df), fh)
    return feature_df, regime_df


def split_frames(feature_df: pd.DataFrame, regime_df: pd.DataFrame, frac: float = TRAIN_FRACTION):
    """Chronological split. Returns (train_f, train_r, test_f, test_r); regimes follow the feature index."""
    df = feature_df.sort_index()
    cut = int(len(df) * frac)
    train, test = df.iloc[:cut], df.iloc[cut:]

    def sl(frame: pd.DataFrame) -> pd.DataFrame:
        return regime_df[(regime_df["timestamp"] >= frame.index.min()) & (regime_df["timestamp"] <= frame.index.max())]

    return train, sl(train), test, sl(test)


def load_strategies() -> list[dict]:
    """Every Meridian strategy (id, name, symbol, creator, status, rule dicts)."""
    async def _q():
        import app.models  # noqa: F401
        from sqlalchemy import select

        from app.db.session import SessionFactory, dispose_engine
        from app.db.tenant import mark_session_unscoped
        from app.models.organization import Organization
        from app.models.strategy import Strategy

        try:
            async with SessionFactory() as s:
                mark_session_unscoped(s.sync_session)
                org = (await s.execute(select(Organization.id).where(Organization.slug == "meridian-capital"))).scalar_one()
                rows = (await s.execute(select(Strategy).where(Strategy.organization_id == org))).scalars().all()
                return [{
                    "id": str(r.id)[:8], "name": r.name, "symbol": strategy_symbol(r.name, r.symbol),
                    "creator": getattr(r.creator, "value", r.creator), "status": r.status.value,
                    "entry_rules": r.entry_rules, "exit_rules": r.exit_rules, "risk_constraints": r.risk_constraints,
                } for r in rows]
        finally:
            await dispose_engine()
    return asyncio.run(_q())


def unique_human_strategies(min_symbol_bars: int = 700) -> list[dict]:
    """Human-authored strategies, de-duplicated by (symbol, rules, risk): the seed created several with
    identical rules and a copy/paste would double-count one idea."""
    seen, out = set(), []
    for s in load_strategies():
        if s["creator"] != "human" or not s["symbol"]:
            continue
        key = (s["symbol"], canonical(s))
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def bootstrap_ci(values: np.ndarray, n: int = 10_000, seed: int = SEED, alpha: float = 0.05):
    rng = np.random.default_rng(seed)
    values = np.asarray(values, dtype=float)
    means = np.array([rng.choice(values, size=len(values), replace=True).mean() for _ in range(n)])
    return float(np.percentile(means, 100 * alpha / 2)), float(np.percentile(means, 100 * (1 - alpha / 2)))
