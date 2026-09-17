"""Pydantic schemas for global market index quotes (Batch 25)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class IndexQuote(BaseModel):
    symbol: str
    name: str
    region: str
    # None whenever status == "unavailable": a stale number is never sent as current.
    last_price: float | None
    previous_close: float | None
    change: float | None
    change_pct: float | None
    # The exchange session the price belongs to (not a live trade timestamp).
    session_date: date | None
    # When the platform last refreshed this quote successfully.
    fetched_at: datetime | None
    last_attempt_at: datetime | None
    status: Literal["ok", "unavailable"]
    unavailable_reason: str | None


class GlobalIndicesResponse(BaseModel):
    provider: str
    is_realtime: bool
    refresh_interval_seconds: int
    stale_after_seconds: int
    data_delay_note: str
    generated_at: datetime
    refresh_requested: bool = False
    quotes: list[IndexQuote]
