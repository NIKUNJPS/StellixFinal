"""Pydantic schemas for the health endpoint.

This contract is the seed of the future System Monitoring page — keep it stable and
extend rather than redefine.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ServiceStatus(str, Enum):
    OK = "ok"
    ERROR = "error"


class ServiceHealth(BaseModel):
    status: ServiceStatus
    latency_ms: float | None = Field(
        default=None, description="Round-trip latency of the connectivity probe, in milliseconds."
    )
    detail: str | None = Field(
        default=None, description="Error detail when status is 'error'; null when ok."
    )


class HealthResponse(BaseModel):
    """Overall health plus per-service breakdown.

    ``status`` is 'ok' only when every dependency is 'ok'.
    """

    status: ServiceStatus
    postgres: ServiceHealth
    redis: ServiceHealth
