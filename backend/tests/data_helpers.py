"""Helpers for Batch 2 data tests: deterministic synthetic OHLCV + seeding."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
from app.db.tenant import bind_organization
from app.features.engineering import FEATURE_COLUMNS
from app.models.failure import Failure, FailureTrigger
from app.models.feature_matrix import FeatureMatrix
from app.models.market_data import MarketData
from app.models.regime_label import RegimeLabelRecord
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.validation_result import ValidationResult
from app.regime.taxonomy import RegimeLabel
from app.validation.composite import ValidationClassification
from sqlalchemy.ext.asyncio import async_sessionmaker

_VALID_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_VALID_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_VALID_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


def make_synthetic_ohlcv(n: int = 120, seed: int = 42) -> pd.DataFrame:
    """A deterministic, OHLC-valid daily series (random walk with fixed seed)."""
    rng = np.random.default_rng(seed)
    start = datetime(2023, 1, 2, tzinfo=UTC)
    timestamps = [start + timedelta(days=i) for i in range(n)]

    steps = rng.normal(0, 1.0, size=n).cumsum()
    close = 100.0 + steps
    close = np.maximum(close, 1.0)  # keep prices positive
    open_ = np.concatenate([[close[0]], close[:-1]])
    span = rng.uniform(0.1, 1.0, size=n)
    high = np.maximum(open_, close) + span
    low = np.minimum(open_, close) - span
    low = np.maximum(low, 0.5)
    volume = rng.integers(1_000_000, 5_000_000, size=n).astype(float)

    return pd.DataFrame(
        {
            "timestamp": pd.to_datetime(timestamps, utc=True),
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
    )


async def seed_market_data(
    maker: async_sessionmaker,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    closes: list[float],
    source: str = "test",
) -> None:
    """Insert simple market_data rows for an org (tenant-bound, auto-stamped)."""
    start = datetime(2024, 1, 1, tzinfo=UTC)
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        for i, close in enumerate(closes):
            session.add(
                MarketData(
                    symbol=symbol,
                    timestamp=start + timedelta(days=i),
                    open=close,
                    high=close + 1,
                    low=close - 1,
                    close=close,
                    volume=1_000_000.0,
                    source=source,
                )
            )
            # Flush per row: a multi-row INSERT of a composite-PK + tz-datetime table
            # trips SQLAlchemy's insertmanyvalues sentinel matching on SQLite.
            await session.flush()
        await session.commit()


async def seed_regime_labels(
    maker: async_sessionmaker,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    labels: list[tuple[str, float]],
) -> None:
    """Insert regime_labels rows (label, confidence) for an org (tenant-bound)."""
    start = datetime(2024, 1, 1, tzinfo=UTC)
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        for i, (label, conf) in enumerate(labels):
            session.add(
                RegimeLabelRecord(
                    symbol=symbol,
                    timestamp=start + timedelta(days=i),
                    regime_label=RegimeLabel(label),
                    confidence_score=conf,
                    model_votes={"hmm": label, "pelt": label, "gmm": label, "garch": label},
                    transition_probs={"matrix": [[1.0]]},
                )
            )
            await session.flush()
        await session.commit()


async def seed_oscillating_market_with_features(
    maker: async_sessionmaker,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    n: int = 220,
    regime_labels: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Seed real MarketData + FeatureMatrix (real ta-computed RSI, same as production
    feature engineering) + RegimeLabelRecord rows for an oscillating price series —
    enough swing for RSI(14) to repeatedly cross 30/70. Returns the (feature_df,
    regime_df) an in-process backtest would load, for cross-checking in tests.
    """
    from ta.momentum import RSIIndicator

    start = datetime(2024, 1, 1, tzinfo=UTC)
    timestamps = [start + timedelta(days=i) for i in range(n)]
    t = np.arange(n)
    close = 100 + 15 * np.sin(t / 8.0) + 3 * np.sin(t / 3.0)
    rsi = RSIIndicator(close=pd.Series(close), window=14, fillna=False).rsi().to_numpy()

    if regime_labels is None:
        half = n // 2
        regime_labels = ["Bull"] * half + ["Bear"] * (n - half)

    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        for i in range(n):
            session.add(
                MarketData(
                    symbol=symbol, timestamp=timestamps[i],
                    open=float(close[i]), high=float(close[i] + 1), low=float(close[i] - 1),
                    close=float(close[i]), volume=1_000_000.0, source="test",
                )
            )
            await session.flush()
        await session.commit()

    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        for i in range(n):
            rsi_value = float(rsi[i]) if not np.isnan(rsi[i]) else None
            fm_kwargs = {col: None for col in FEATURE_COLUMNS}
            fm_kwargs["rsi_14"] = rsi_value
            session.add(
                FeatureMatrix(
                    symbol=symbol, timestamp=timestamps[i], features={}, **fm_kwargs,
                )
            )
            await session.flush()
        await session.commit()

    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        for i in range(n):
            label = regime_labels[i]
            session.add(
                RegimeLabelRecord(
                    symbol=symbol, timestamp=timestamps[i], regime_label=RegimeLabel(label),
                    confidence_score=0.9,
                    model_votes={"hmm": label, "pelt": label, "gmm": label, "garch": label},
                )
            )
            await session.flush()
        await session.commit()

    feature_df = pd.DataFrame({"timestamp": timestamps, "close": close, "rsi_14": rsi}).set_index("timestamp")
    regime_df = pd.DataFrame({"timestamp": timestamps, "regime_label": regime_labels})
    return feature_df, regime_df


async def seed_strategy(
    maker: async_sessionmaker,
    *,
    organization_id: uuid.UUID,
    name: str = "Seed Strategy",
    status: StrategyStatus = StrategyStatus.DRAFT,
    robustness_score: float | None = None,
    valid_rules: bool = False,
    created_by_user_id: uuid.UUID | None = None,
    parent_strategy_id: uuid.UUID | None = None,
    regime_compatibility: dict | None = None,
    with_validation: bool = True,
) -> uuid.UUID:
    """Insert a Strategy row directly in a chosen status (tenant-bound)."""
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        strat = Strategy(
            name=name,
            creator=StrategyCreator.HUMAN,
            created_by_user_id=created_by_user_id,
            status=status,
            version="v1.0",
            parameters={},
            entry_rules=_VALID_ENTRY if valid_rules else {},
            exit_rules=_VALID_EXIT if valid_rules else {},
            risk_constraints=_VALID_RISK if valid_rules else {},
            robustness_score=robustness_score,
            parent_strategy_id=parent_strategy_id,
            regime_compatibility=regime_compatibility,
        )
        session.add(strat)
        await session.flush()
        # ADR 0008: a gate score exists because validation produced it. Seeding one
        # without its ValidationResult would be a state the product can no longer
        # reach, and the activation gate now (correctly) refuses it.
        if robustness_score is not None and with_validation:
            session.add(
                ValidationResult(
                    strategy_id=strat.id,
                    strategy_version=strat.version,
                    walk_forward_score=robustness_score,
                    regime_cv_score=robustness_score,
                    monte_carlo_score=robustness_score,
                    persistence_score=robustness_score,
                    stress_test_score=robustness_score,
                    composite_score=robustness_score,
                    classification=(
                        ValidationClassification.ELIGIBLE_ACTIVE
                        if robustness_score >= 0.70
                        else ValidationClassification.CANDIDATE
                    ),
                    method_details={"seeded": True},
                )
            )
        await session.commit()
        await session.refresh(strat)
        return strat.id


async def seed_failure(
    maker: async_sessionmaker,
    *,
    organization_id: uuid.UUID,
    strategy_id: uuid.UUID,
    regime: str,
    trigger: str,
    top_features: list[str],
    day: int = 1,
) -> uuid.UUID:
    """Insert a Failure row with a controlled pattern (tenant-bound)."""
    fa = [{"feature_name": f, "shap_value": 1.0, "direction": "positive"} for f in top_features]
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        failure = Failure(
            strategy_id=strategy_id,
            strategy_version="v1.0",
            failure_timestamp=datetime(2024, 1, day, tzinfo=UTC),
            regime_at_failure=regime,
            trigger_condition=FailureTrigger(trigger),
            performance_metrics_at_failure={"sharpe": -0.5, "max_drawdown": -0.4, "win_rate": 0.3},
            feature_attribution=fa,
            market_context_snapshot={},
            related_failure_ids=[],
        )
        session.add(failure)
        await session.commit()
        await session.refresh(failure)
        return failure.id
