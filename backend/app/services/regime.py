"""Regime detection service: pull feature_matrix → run the ensemble → persist labels."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_tenant_session
from app.models.feature_matrix import FeatureMatrix
from app.models.regime_label import RegimeLabelRecord
from app.regime.engine import RegimeResult, detect_regimes


async def _load_feature_frame(session: AsyncSession, symbol: str) -> pd.DataFrame:
    rows = (
        await session.execute(
            select(FeatureMatrix)
            .where(FeatureMatrix.symbol == symbol)
            .order_by(FeatureMatrix.timestamp.asc())
        )
    ).scalars().all()
    records = [
        {
            "timestamp": pd.Timestamp(r.timestamp),
            "log_return": r.log_return,
            "realized_vol": r.realized_vol_20,
        }
        for r in rows
    ]
    frame = pd.DataFrame.from_records(records)
    if not frame.empty:
        frame = frame.set_index("timestamp")
    return frame


async def _persist(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    result: RegimeResult,
) -> int:
    transition = {
        "matrix": result.transition_probs,
        "hmm_state_labels": result.hmm_state_labels,
    }
    rows = []
    for ts, r in result.frame.iterrows():
        rows.append(
            {
                "organization_id": organization_id,
                "symbol": symbol,
                "timestamp": pd.Timestamp(ts).to_pydatetime(),
                "regime_label": r["regime_label"],
                "confidence_score": float(r["confidence"]),
                "model_votes": {
                    "hmm": r["hmm"],
                    "pelt": r["pelt"],
                    "gmm": r["gmm"],
                    "garch": r["garch"],
                },
                "transition_probs": transition,
            }
        )
    if not rows:
        return 0

    if session.bind.dialect.name == "postgresql":
        stmt = pg_insert(RegimeLabelRecord).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="pk_regime_labels",
            set_={
                "regime_label": stmt.excluded.regime_label,
                "confidence_score": stmt.excluded.confidence_score,
                "model_votes": stmt.excluded.model_votes,
                "transition_probs": stmt.excluded.transition_probs,
            },
        )
        await session.execute(stmt)
    else:
        for row in rows:
            await session.merge(RegimeLabelRecord(**row))
    return len(rows)


async def _latest_regime(session: AsyncSession, symbol: str) -> str | None:
    """The most recent stored regime label for a symbol, or None if none yet."""
    row = (
        await session.execute(
            select(RegimeLabelRecord.regime_label)
            .where(RegimeLabelRecord.symbol == symbol)
            .order_by(RegimeLabelRecord.timestamp.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return row.value if row is not None else None


@dataclass(frozen=True)
class RegimeRunResult:
    """Outcome of a detection run: rows written, plus the head-of-series transition
    (Batch 19) so the caller can fire a realtime event only when it actually moved.
    """

    rows: int
    symbol: str
    old_regime: str | None
    new_regime: str | None
    confidence: float

    @property
    def changed(self) -> bool:
        # A change worth announcing: we have a new label, and it differs from the
        # last stored one. First-ever detection (old is None) is not a "change" —
        # there was no prior state to transition from, so it stays silent.
        return (
            self.new_regime is not None
            and self.old_regime is not None
            and self.new_regime != self.old_regime
        )


async def run_regime_detection(organization_id: uuid.UUID, symbol: str) -> RegimeRunResult:
    """Full detection run for one (organization, symbol).

    Returns a RegimeRunResult (Batch 19). Previously returned a bare row count;
    nothing asserted on that int, and the transition fields are what let the Celery
    task publish a realtime regime_update only when the head-of-series label
    actually moved.
    """
    symbol = symbol.strip().upper()
    async with get_tenant_session(organization_id) as session:
        old_regime = await _latest_regime(session, symbol)
        frame = await _load_feature_frame(session, symbol)
        result = detect_regimes(frame)
        rows = await _persist(
            session, organization_id=organization_id, symbol=symbol, result=result
        )
        new_regime = await _latest_regime(session, symbol)
        confidence = 0.0
        if not result.frame.empty:
            confidence = float(result.frame.iloc[-1]["confidence"])
    return RegimeRunResult(
        rows=rows,
        symbol=symbol,
        old_regime=old_regime,
        new_regime=new_regime,
        confidence=confidence,
    )


# --------------------------------------------------------------------------- #
# Page 15 (Regime Monitor) aggregations (Batch 12) — read-only queries over
# data that already exists; no new tables.
# --------------------------------------------------------------------------- #
async def compute_regime_statistics(session: AsyncSession, *, symbol: str) -> list[dict]:
    """One row per regime label this symbol has actually been in: bar count
    ("duration"), avg daily return (market_data.close), avg realized
    volatility (feature_matrix.realized_vol_20), and an aggregate Sharpe
    across every trade (any strategy) that entered a position while the
    market was in that regime (trade_records.regime_at_entry)."""
    from app.models.feature_matrix import FeatureMatrix
    from app.models.market_data import MarketData
    from app.models.trade_record import TradeRecord
    from app.regime.taxonomy import RegimeLabel

    regime_rows = (
        await session.execute(
            select(RegimeLabelRecord.timestamp, RegimeLabelRecord.regime_label)
            .where(RegimeLabelRecord.symbol == symbol)
            .order_by(RegimeLabelRecord.timestamp)
        )
    ).all()
    if not regime_rows:
        return []

    md_rows = (
        await session.execute(
            select(MarketData.timestamp, MarketData.close).where(MarketData.symbol == symbol)
        )
    ).all()
    closes = pd.Series({ts: close for ts, close in md_rows}).sort_index().astype(float)
    daily_return_by_ts = closes.pct_change()

    fm_rows = (
        await session.execute(
            select(FeatureMatrix.timestamp, FeatureMatrix.realized_vol_20)
            .where(FeatureMatrix.symbol == symbol)
        )
    ).all()
    vol_by_ts = {ts: v for ts, v in fm_rows}

    bars = pd.DataFrame(
        {
            "regime_label": [label.value for _ts, label in regime_rows],
            "daily_return": [daily_return_by_ts.get(ts) for ts, _label in regime_rows],
            "realized_vol_20": [vol_by_ts.get(ts) for ts, _label in regime_rows],
        }
    )

    trade_rows = (
        await session.execute(
            select(TradeRecord.regime_at_entry, TradeRecord.return_pct).where(
                TradeRecord.regime_at_entry.is_not(None)
            )
        )
    ).all()
    trades = pd.DataFrame(trade_rows, columns=["regime_at_entry", "return_pct"])

    results = []
    for label in RegimeLabel:
        sub = bars[bars["regime_label"] == label.value]
        if sub.empty:
            continue
        avg_return = float(sub["daily_return"].mean()) if sub["daily_return"].notna().any() else None
        avg_vol = float(sub["realized_vol_20"].mean()) if sub["realized_vol_20"].notna().any() else None

        avg_sharpe = None
        trade_sub = trades[trades["regime_at_entry"] == label.value]
        if len(trade_sub) >= 2:
            std = trade_sub["return_pct"].std(ddof=1)
            if std and std > 0:
                avg_sharpe = float(trade_sub["return_pct"].mean() / std)

        results.append(
            {
                "regime_label": label.value,
                "duration_days": int(len(sub)),
                "avg_return": avg_return,
                "avg_volatility": avg_vol,
                "avg_sharpe": avg_sharpe,
            }
        )
    return results


async def compute_strategy_compatibility_alerts(session: AsyncSession, *, symbol: str) -> dict:
    """Active strategies whose regime_compatibility doesn't show them as
    validated for `symbol`'s CURRENT regime — missing, null, or a negative
    Sharpe. `regime_compatibility` isn't itself symbol-tagged (Strategy has no
    `symbol` column — a strategy's rule-set is symbol-agnostic until backtest
    time), so this compares every active strategy against whichever symbol
    the caller is viewing on the Regime Monitor page; see docs/schemas.md
    "Judgment calls" for this tradeoff."""
    from app.models.strategy import Strategy, StrategyStatus

    current_row = (
        await session.execute(
            select(RegimeLabelRecord.regime_label)
            .where(RegimeLabelRecord.symbol == symbol)
            .order_by(RegimeLabelRecord.timestamp.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if current_row is None:
        return {"current_regime": None, "alerts": []}
    current_regime = current_row.value

    active = (
        await session.execute(select(Strategy).where(Strategy.status == StrategyStatus.ACTIVE))
    ).scalars().all()

    alerts = []
    for s in active:
        compat = s.regime_compatibility or {}
        sharpe = compat.get(current_regime)
        if sharpe is None or sharpe < 0:
            alerts.append(
                {
                    "strategy_id": s.id,
                    "strategy_name": s.name,
                    "compatibility_sharpe": sharpe,
                }
            )
    return {"current_regime": current_regime, "alerts": alerts}
