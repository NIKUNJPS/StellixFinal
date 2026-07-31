"""Pydantic schemas for the System Monitoring page (Batch 12)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.health import ServiceStatus


class ServiceHealthDetailed(BaseModel):
    status: ServiceStatus
    uptime_pct: float
    last_check: datetime
    response_time_ms: float | None
    detail: str | None = None


class JobQueueEntry(BaseModel):
    task_name: str
    active: int
    pending: int


class ResourceGauges(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_mb: float
    memory_total_mb: float
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float


class ConsistencyAlert(BaseModel):
    organization_id: uuid.UUID
    graph_unreachable: bool
    orphaned_graph_nodes: list[str]
    unsynced_strategies: list[str]
    missing_lineage_edges: list[str]
    checked_at: datetime


class SystemHealthDetailedResponse(BaseModel):
    status: ServiceStatus
    services: dict[str, ServiceHealthDetailed]
    job_queue: list[JobQueueEntry]
    failed_job_count: int
    resources: ResourceGauges
    consistency_alert: ConsistencyAlert | None
    # Batch 13: same two checks GET /health/live and GET /health/ready expose
    # as machine-facing probe endpoints, surfaced here too for the human
    # dashboard view — liveness is always true if this response returned at
    # all (the process had to be up to compute it); readiness reflects
    # Postgres + Redis connectivity.
    liveness: bool
    readiness: bool
