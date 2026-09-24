"""Schemas for the research-signals API (Batch 26 Part B)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.strategy_signal import SignalType


class SignalItem(BaseModel):
    """The current Buy/Sell/Hold signal for one genuinely-Active strategy."""

    strategy_id: uuid.UUID
    strategy_name: str
    symbol: str | None
    signal_type: SignalType | None
    # The ADR-0008-corrected validated composite — labeled "validated robustness score"
    # in the UI, never framed as a prediction of future performance.
    robustness_score: float | None
    regime_at_signal: str | None
    evaluated_at: datetime | None
    last_evaluated_at: datetime | None
    rule_snapshot: dict | None = None
    # Present only when a signal could not be computed (e.g. no market data yet).
    unavailable_reason: str | None = None


class SignalListResponse(BaseModel):
    count: int
    items: list[SignalItem]
