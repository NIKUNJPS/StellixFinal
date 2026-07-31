"""Backtest chart-series cache (Batch 12) — Backtest Results page.

The equity curve / drawdown / rolling-Sharpe series are ~1 point per trading
day over the whole backtest window: not snapshot-shaped (PerformanceSnapshot,
one row per regime) and not trade-shaped (TradeRecord, one row per trade), so
they don't fit either existing Postgres table. Like system_health.py's
uptime%/consistency-sweep data, this is a "latest result, overwritten on
every re-run" cache, not durable business data — the durable, audit-relevant
numbers (aggregate metrics, trade log) are already in Postgres. If this cache
expires or Redis is flushed, the worst case is an empty chart until the next
backtest run, not data loss.
"""

from __future__ import annotations

import json
import uuid

import pandas as pd

from app.clients import redis_client

_KEY_PREFIX = "backtest:charts:"
_TTL_SECONDS = 90 * 24 * 3600  # long-lived cache, bounded so abandoned strategies don't grow Redis forever


def _series_to_points(series: pd.Series) -> list[dict]:
    return [
        {"timestamp": pd.Timestamp(ts).isoformat(), "value": None if pd.isna(v) else float(v)}
        for ts, v in series.items()
    ]


async def record_backtest_charts(
    strategy_id: uuid.UUID,
    *,
    equity_curve: pd.Series,
    drawdown_series: pd.Series,
    rolling_sharpe: pd.Series,
) -> None:
    redis = redis_client.get_client()
    payload = {
        "equity_curve": _series_to_points(equity_curve),
        "drawdown_series": _series_to_points(drawdown_series),
        "rolling_sharpe": _series_to_points(rolling_sharpe),
    }
    await redis.set(f"{_KEY_PREFIX}{strategy_id}", json.dumps(payload), ex=_TTL_SECONDS)


async def get_backtest_charts(strategy_id: uuid.UUID) -> dict | None:
    """None means "never run" (or the cache expired) — distinct from an empty
    backtest, which still has a flat equity curve and would return real data."""
    redis = redis_client.get_client()
    raw = await redis.get(f"{_KEY_PREFIX}{strategy_id}")
    if raw is None:
        return None
    return json.loads(raw)
