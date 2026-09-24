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


class MacroSeriesPoint(BaseModel):
    date: date
    value: float


class MacroSeries(BaseModel):
    series_id: str
    label: str
    group: Literal["yield_curve", "volatility"]
    unit: str
    status: Literal["ok", "not_configured", "no_data", "error"]
    error: str | None
    points: list[MacroSeriesPoint]
    latest_value: float | None
    latest_date: date | None


class MacroResponse(BaseModel):
    configured: bool
    source: str
    refresh_interval_seconds: int
    data_delay_note: str
    generated_at: datetime
    series: list[MacroSeries]


class ScreenerRow(BaseModel):
    symbol: str
    name: str
    sector: str
    last_price: float | None
    previous_close: float | None
    change: float | None
    change_pct: float | None
    volume: float | None
    dollar_volume: float | None
    session_date: date | None
    fetched_at: datetime | None
    status: Literal["ok", "unavailable"]
    unavailable_reason: str | None


class ScreenerResponse(BaseModel):
    provider: str
    universe_size: int
    universe_note: str
    refresh_interval_seconds: int
    data_delay_note: str
    generated_at: datetime
    rows: list[ScreenerRow]


class HeatmapSymbol(BaseModel):
    symbol: str
    name: str
    change_pct: float | None
    dollar_volume: float | None
    status: Literal["ok", "unavailable"]


class HeatmapSector(BaseModel):
    sector: str
    total_dollar_volume: float | None
    avg_change_pct: float | None
    symbol_count: int
    available_count: int
    symbols: list[HeatmapSymbol]


class HeatmapResponse(BaseModel):
    universe_size: int
    universe_note: str
    generated_at: datetime
    sectors: list[HeatmapSector]


class Candle(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class IndicatorPoint(BaseModel):
    timestamp: datetime
    value: float


class ChartIndicators(BaseModel):
    sma_20: list[IndicatorPoint]
    sma_50: list[IndicatorPoint]
    ema_12: list[IndicatorPoint]
    ema_26: list[IndicatorPoint]
    rsi_14: list[IndicatorPoint]
    macd: list[IndicatorPoint]
    macd_signal: list[IndicatorPoint]
    bollinger_upper: list[IndicatorPoint]
    bollinger_lower: list[IndicatorPoint]
    vwap_20: list[IndicatorPoint]


class ChartResponse(BaseModel):
    symbol: str
    interval: str
    range: str
    provider: str
    data_delay_note: str
    candles: list[Candle]
    indicators: ChartIndicators
