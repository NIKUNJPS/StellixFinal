"""Multi-agent desk API schemas (Batch 30). Field names match docs/schemas.md."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AnalystKey = Literal["market", "social", "news", "fundamentals"]
_TICKER = re.compile(r"^[A-Za-z0-9.\-=^]{1,20}$")
_DEFAULT_ANALYSTS: list[AnalystKey] = ["market", "social", "news", "fundamentals"]
_LANGUAGE = re.compile(r"^[A-Za-z][A-Za-z \-()]{1,31}$")


def _check_ticker(value: str) -> str:
    value = value.strip()
    if not _TICKER.match(value):
        raise ValueError("ticker must be 1-20 characters: letters, digits, '.', '-', '=', '^'")
    return value.upper()


def _check_analysts(value: list[AnalystKey]) -> list[AnalystKey]:
    unique = list(dict.fromkeys(value))
    if not unique:
        raise ValueError("select at least one analyst")
    return unique


class PositionInput(BaseModel):
    """TradingAgents' Position shape; quantity is signed (negative = short)."""

    model_config = ConfigDict(extra="forbid")

    ticker: str
    quantity: float
    average_price: float | None = Field(default=None, gt=0)

    @field_validator("ticker")
    @classmethod
    def _valid_ticker(cls, value: str) -> str:
        return _check_ticker(value)


class PortfolioInput(BaseModel):
    """TradingAgents' PortfolioContext shape. An empty ``positions`` list is a flat
    book; omitting ``portfolio`` altogether means no context at all."""

    model_config = ConfigDict(extra="forbid")

    cash: float | None = None
    currency: str | None = Field(default=None, max_length=8)
    positions: list[PositionInput] = Field(default_factory=list, max_length=200)


class AgentAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(..., description="Yahoo Finance symbol, e.g. NVDA, 0700.HK, BTC-USD")
    trade_date: date | None = Field(default=None, description="Analysis date; defaults to today. Never in the future.")
    selected_analysts: list[AnalystKey] = Field(default_factory=lambda: list(_DEFAULT_ANALYSTS))
    portfolio: PortfolioInput | None = Field(
        default=None, description="Your holdings; the trader, risk team and portfolio manager then work against them."
    )
    output_language: str | None = Field(
        default=None, description="Language of the reports and decision, e.g. English, Chinese, Hindi."
    )
    holdings_portfolio_id: uuid.UUID | None = Field(
        default=None,
        description="Use one of your Market Terminal holdings portfolios as the book (instead of `portfolio`).",
    )

    @model_validator(mode="after")
    def _one_book(self) -> AgentAnalysisRequest:
        if self.portfolio is not None and self.holdings_portfolio_id is not None:
            raise ValueError("give either portfolio or holdings_portfolio_id, not both")
        return self

    @field_validator("output_language")
    @classmethod
    def _valid_language(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not _LANGUAGE.match(value):
            raise ValueError("output_language must be a language name, e.g. 'English' or 'Chinese'")
        return value

    @field_validator("ticker")
    @classmethod
    def _valid_ticker(cls, value: str) -> str:
        return _check_ticker(value)

    @field_validator("selected_analysts")
    @classmethod
    def _valid_analysts(cls, value: list[AnalystKey]) -> list[AnalystKey]:
        return _check_analysts(value)


class AgentBacktestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tickers: list[str] = Field(..., min_length=1, max_length=10)
    start_date: date
    end_date: date
    every_n_days: int = Field(default=7, ge=1, le=90)
    selected_analysts: list[AnalystKey] = Field(default_factory=lambda: ["market", "news"])

    @field_validator("tickers")
    @classmethod
    def _tickers(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(_check_ticker(v) for v in value))

    @field_validator("selected_analysts")
    @classmethod
    def _valid_analysts(cls, value: list[AnalystKey]) -> list[AnalystKey]:
        return _check_analysts(value)

    @model_validator(mode="after")
    def _range(self) -> AgentBacktestRequest:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class ProgressStage(BaseModel):
    stage: str
    at: str


class AgentAnalysisSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticker: str
    trade_date: date
    asset_type: str
    status: str
    rating: str | None
    trader_action: str | None
    regime_at_analysis: str | None
    regime_confidence: float | None
    selected_analysts: list[str]
    llm_provider: str
    deep_model: str
    quick_model: str
    backtest_run_id: uuid.UUID | None
    requested_by_user_id: uuid.UUID | None
    progress: list[ProgressStage]
    expected_stages: list[str] = Field(default_factory=list)
    llm_call_count: int
    settled_alpha: float | None
    settled_raw_return: float | None
    benchmark: str | None
    holding_days: int | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, v):
        return getattr(v, "value", v)


class AgentAnalysisDetail(AgentAnalysisSummary):
    config_snapshot: dict
    portfolio: dict | None
    regime_context: dict
    reports: dict
    time_horizon: str | None
    position_sizing: str | None
    research_note_id: uuid.UUID | None
    input_tokens: int | None
    output_tokens: int | None
    settled_resolution_date: date | None
    settled_reflection: str | None
    settled_at: datetime | None


class AgentAnalysisListResponse(BaseModel):
    count: int
    items: list[AgentAnalysisSummary]


class AgentAnalysisEnqueued(BaseModel):
    analysis_id: uuid.UUID
    task_id: str | None
    message: str


class DeskStatus(BaseModel):
    configured: bool
    reason: str | None
    provider: str
    deep_model: str
    quick_model: str
    max_debate_rounds: int
    max_risk_rounds: int
    holding_days: int
    backtest_max_cells: int
    framework: str
    analysts: list[str]
    pipeline: list[str]
    supported_providers: list[str]
    output_language: str
    fundamentals_vendors: str
    sec_edgar_enabled: bool
    sec_edgar_user_agent_set: bool
    jev_screening_enabled: bool
    checkpoint_enabled: bool


class AgentBacktestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tickers: list[str]
    trade_dates: list[str]
    selected_analysts: list[str]
    status: str
    total_cells: int
    completed_cells: int
    failed_cells: int
    summary: dict
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, v):
        return getattr(v, "value", v)


class AgentBacktestDetail(AgentBacktestSummary):
    cells: list[AgentAnalysisSummary]


class AgentBacktestListResponse(BaseModel):
    count: int
    items: list[AgentBacktestSummary]


class AgentBacktestEnqueued(BaseModel):
    run_id: uuid.UUID
    total_cells: int
    task_id: str | None
    message: str


class TrackRecordResponse(BaseModel):
    ticker: str | None
    summary: dict
