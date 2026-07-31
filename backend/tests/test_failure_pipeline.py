"""End-to-end failure pipeline: assess() detects a trigger, persist_failure() records it
and flips the strategy to failed via the active→failed hook."""

from __future__ import annotations

import numpy as np
import pandas as pd
from app.db.tenant import bind_organization
from app.failure import detection
from app.features.engineering import FEATURE_COLUMNS
from app.models.failure import Failure, FailureTrigger
from app.models.strategy import Strategy, StrategyStatus
from app.services.failure import persist_failure
from sqlalchemy import select

from tests.data_helpers import seed_strategy
from tests.helpers import create_org_user

_CROSSOVER = {
    "entry_rules": {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_20"},
    "exit_rules": {"indicator": "close", "comparator": "crosses_below", "value_ref": "sma_20"},
    "risk_constraints": {"max_drawdown_pct": 1, "stop_loss_pct": 50, "max_position_size_pct": 100},
}


def _losing_market(n=160):
    # Gently declining + high-amplitude oscillation → the crossover buys the swing highs
    # and repeatedly loses, so cumulative drawdown breaches the 1% limit (verified ≈ -8%).
    idx = pd.date_range("2022-01-01", periods=n, freq="D", tz="UTC")
    t = np.arange(n)
    close = 100 - 0.1 * t + 10 * np.sin(t / 4.0)
    df = pd.DataFrame({"close": close}, index=idx)
    df["sma_20"] = df["close"].rolling(20).mean()
    rng = np.random.default_rng(0)
    for col in FEATURE_COLUMNS:
        if col not in df:
            df[col] = rng.normal(size=n)
    regime_df = pd.DataFrame({"timestamp": idx, "regime_label": ["Bull"] * n})
    return df, regime_df


async def test_drawdown_breach_creates_failure_record(db_session_factory):
    org, _user = await create_org_user(
        db_session_factory, org_name="Fail Co", slug="fail-co", email="f@fail.io"
    )
    sid = await seed_strategy(db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE)

    feature_df, regime_df = _losing_market()
    # regime_compatibility includes the current regime (Bull) so regime_mismatch won't fire —
    # isolating the drawdown_breach trigger.
    assessment = detection.assess(_CROSSOVER, {"Bull": 0.8}, feature_df, regime_df)

    assert assessment is not None
    assert assessment.trigger == FailureTrigger.DRAWDOWN_BREACH
    assert assessment.performance_metrics["max_drawdown"] is not None
    assert abs(assessment.performance_metrics["max_drawdown"]) > 0.01

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = (await session.execute(select(Strategy).where(Strategy.id == sid))).scalar_one()
        failure = await persist_failure(session, strategy=strategy, assessment=assessment)
        await session.commit()
        failure_id = failure.id
        assert strategy.status == StrategyStatus.FAILED  # active → failed hook fired

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        f = (await session.execute(select(Failure).where(Failure.id == failure_id))).scalar_one()
        assert f.trigger_condition == FailureTrigger.DRAWDOWN_BREACH
        assert f.regime_at_failure == "Bull"
        assert f.performance_metrics_at_failure["max_drawdown"] is not None
