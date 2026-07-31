"""Pydantic schemas for the regime endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.regime.taxonomy import RegimeLabel


class RegimeDetectRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"symbol": "SPY"}})

    symbol: str = Field(min_length=1, max_length=32)

    @field_validator("symbol")
    @classmethod
    def _up(cls, v: str) -> str:
        return v.strip().upper()


class RegimeDetectEnqueued(BaseModel):
    symbol: str
    message: str
    task_id: str | None = None


class RegimePoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    timestamp: datetime
    regime_label: RegimeLabel
    confidence_score: float
    model_votes: dict


class RegimeObject(RegimePoint):
    """A full regime record including the HMM transition matrix."""

    transition_probs: dict | None = None


class RegimeHistoryResponse(BaseModel):
    symbol: str
    count: int
    points: list[RegimePoint]


class RegimeStatisticsItem(BaseModel):
    regime_label: RegimeLabel
    duration_days: int
    avg_return: float | None
    avg_volatility: float | None
    avg_sharpe: float | None


class RegimeStatisticsResponse(BaseModel):
    symbol: str
    items: list[RegimeStatisticsItem]


class StrategyCompatibilityAlert(BaseModel):
    strategy_id: uuid.UUID
    strategy_name: str
    compatibility_sharpe: float | None


class StrategyCompatibilityAlertsResponse(BaseModel):
    symbol: str
    current_regime: RegimeLabel | None
    alerts: list[StrategyCompatibilityAlert]
