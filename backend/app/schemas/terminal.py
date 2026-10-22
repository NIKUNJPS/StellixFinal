"""Market Terminal request/response schemas (Batch 31). Field names match docs/schemas.md."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SYMBOL = re.compile(r"^[A-Za-z0-9.\-=^]{1,20}$")
WidgetType = Literal[
    "chart", "quote", "watchlist", "news", "screener", "heatmap", "options", "crypto", "macro",
    "holdings", "calendar", "insider", "recap", "tv", "ai", "alerts",
]


def symbol(value: str) -> str:
    value = value.strip()
    if not _SYMBOL.match(value):
        raise ValueError("symbol must be 1-20 characters: letters, digits, '.', '-', '=', '^'")
    return value.upper()


def symbols(values: list[str], limit: int) -> list[str]:
    out = list(dict.fromkeys(symbol(v) for v in values))
    if len(out) > limit:
        raise ValueError(f"at most {limit} symbols")
    return out


class Widget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")
    type: WidgetType
    config: dict = Field(default_factory=dict)

    @field_validator("config")
    @classmethod
    def _small(cls, value: dict) -> dict:
        if len(str(value)) > 2000:
            raise ValueError("widget config too large")
        return value


class LayoutItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    i: str = Field(min_length=1, max_length=40)
    x: int = Field(ge=0, le=48)
    y: int = Field(ge=0, le=1000)
    w: int = Field(ge=1, le=48)
    h: int = Field(ge=1, le=100)


class WorkspacePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    widgets: list[Widget] = Field(max_length=40)
    layout: list[LayoutItem] = Field(max_length=40)
    active_symbol: str = "SPY"

    @field_validator("active_symbol")
    @classmethod
    def _sym(cls, value: str) -> str:
        return symbol(value)


class WorkspaceRead(WorkspacePayload):
    model_config = ConfigDict(from_attributes=True, extra="ignore")
    updated_at: datetime | None = None


class WatchlistCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    symbols: list[str] = Field(default_factory=list)

    @field_validator("symbols")
    @classmethod
    def _syms(cls, value: list[str]) -> list[str]:
        return symbols(value, 100)


class WatchlistUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    symbols: list[str] | None = None

    @field_validator("symbols")
    @classmethod
    def _syms(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else symbols(value, 100)


class WatchlistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    symbols: list[str]
    created_at: datetime


class PortfolioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=64)
    base_currency: str = Field(default="USD", min_length=1, max_length=8, pattern=r"^[A-Za-z]{1,8}$")
    cash: float | None = Field(default=None, ge=0)


class PortfolioCashUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cash: float | None = Field(default=None, ge=0)


class PortfolioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    base_currency: str
    cash: float | None
    created_at: datetime


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    side: Literal["buy", "sell"]
    quantity: float = Field(gt=0)
    price: float = Field(gt=0)
    fee: float = Field(default=0.0, ge=0)
    executed_at: datetime
    note: str | None = Field(default=None, max_length=255)

    @field_validator("symbol")
    @classmethod
    def _sym(cls, value: str) -> str:
        return symbol(value)


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    symbol: str
    side: str
    quantity: float
    price: float
    fee: float
    executed_at: datetime
    note: str | None

    @field_validator("side", mode="before")
    @classmethod
    def _side(cls, v):
        return getattr(v, "value", v)


class AlertCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    condition: Literal["above", "below"]
    target_price: float = Field(gt=0)
    note: str | None = Field(default=None, max_length=255)

    @field_validator("symbol")
    @classmethod
    def _sym(cls, value: str) -> str:
        return symbol(value)


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    symbol: str
    condition: str
    target_price: float
    status: str
    triggered_at: datetime | None
    triggered_price: float | None
    note: str | None
    created_at: datetime

    @field_validator("condition", "status", mode="before")
    @classmethod
    def _enum(cls, v):
        return getattr(v, "value", v)
