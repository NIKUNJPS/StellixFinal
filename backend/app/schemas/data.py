"""Pydantic schemas for the data ingestion endpoints."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.ingestion_job import IngestionStatus
from app.providers import AVAILABLE_PROVIDERS
from app.services.ingestion import ALLOWED_INTERVALS


class IngestRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "symbol": "SPY",
                "start_date": "2023-01-01",
                "end_date": "2024-01-01",
                "interval": "1d",
                "provider": "yfinance",
            }
        }
    )

    symbol: str = Field(min_length=1, max_length=32)
    start_date: date
    end_date: date
    interval: str = "1d"
    provider: str = "yfinance"

    @field_validator("symbol")
    @classmethod
    def _normalize_symbol(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("interval")
    @classmethod
    def _check_interval(cls, v: str) -> str:
        if v not in ALLOWED_INTERVALS:
            raise ValueError(f"interval must be one of {sorted(ALLOWED_INTERVALS)}")
        return v

    @field_validator("provider")
    @classmethod
    def _check_provider(cls, v: str) -> str:
        if v not in AVAILABLE_PROVIDERS:
            raise ValueError(f"provider must be one of {AVAILABLE_PROVIDERS}")
        return v

    @model_validator(mode="after")
    def _check_range(self) -> IngestRequest:
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class IngestEnqueuedResponse(BaseModel):
    job_id: uuid.UUID
    status: IngestionStatus
    message: str


class JobStatusResponse(BaseModel):
    job_id: uuid.UUID
    symbol: str
    status: IngestionStatus
    rows_ingested: int
    features_computed: int
    warnings: list[dict]
    error: str | None
    created_at: datetime
    updated_at: datetime


class MarketBar(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketSeriesResponse(BaseModel):
    symbol: str
    count: int
    points: list[MarketBar]


# --------------------------------------------------------------------------- #
# CSV upload (Batch 21)
# --------------------------------------------------------------------------- #
class CsvConfirmRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"upload_id": "352754603fd342d1b0d604badf75567c"}}
    )

    upload_id: str = Field(min_length=1, max_length=64)


class CsvConfirmResponse(BaseModel):
    inserted: int
    features_computed: int
    symbol: str
    interval: str
    date_range: dict[str, str | None]
