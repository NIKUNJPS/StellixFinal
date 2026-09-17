"""Pydantic schemas for the LLM endpoints (Batch 9)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.llm.schemas import GraphSummary, HypothesisResult, StrategyCritique


class ChatRequest(BaseModel):
    """Batch 18: free-form research chat, streamed over SSE."""

    message: str = Field(min_length=1, max_length=4000)
    # Drives the cost router: "high" forces Claude even for chat. Constrained to
    # the three known values so an arbitrary string can't silently fall through
    # the router's `stakes == "high"` check and get billed on the wrong lane.
    stakes: Literal["low", "medium", "high"] = "low"


class HypothesisRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    user_prompt: str | None = Field(default=None, max_length=2000)


class HypothesisResponse(BaseModel):
    hypothesis: HypothesisResult
    research_note_id: uuid.UUID


class CritiqueResponse(BaseModel):
    critique: StrategyCritique
    numeric_validation_passed: bool | None


class GraphSummaryResponse(BaseModel):
    query_name: str
    summary: GraphSummary


class AuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    function_name: str
    full_prompt: str
    full_response: str
    model_used: str
    # Batch 18: null on rows written before the cost router existed.
    model_key: str | None = None
    input_tokens: int | None
    output_tokens: int | None
    estimated_cost_usd: Decimal | None = None
    numeric_validation_passed: bool | None
    created_at: datetime
    # Batch 25: who made the call, readable (None = a system/background call).
    user_email: str | None = None
    user_name: str | None = None


class AuditLogListResponse(BaseModel):
    total: int
    count: int
    items: list[AuditLogEntry]
