"""Health endpoints — live connectivity status for Postgres and Redis.

GET /health always returns HTTP 200 (even when a dependency is down); the body carries
per-service status so a monitoring UI can render each independently — this contract is
unchanged. GET /health/live and GET /health/ready (Batch 13) are separate, deliberately
minimal endpoints for the K8s-probe use case Batch 17 will wire up: liveness has zero
dependency checks (never fails due to a slow dependency), readiness checks Postgres +
Redis and returns 503 on failure (so an orchestrator stops routing traffic without
restarting the pod).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.health import HealthResponse
from app.services.health import check_health, check_readiness

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse, summary="Service health & connectivity")
async def health() -> HealthResponse:
    return await check_health()


@router.get("/health/live", summary="Liveness probe (Batch 13) — is the process up")
async def health_live() -> dict:
    """No dependency checks at all — returns 200 the instant the ASGI process
    can schedule a coroutine. A K8s liveness probe failing here means kill
    and restart the pod, so this must never fail because Postgres is briefly
    slow; that's what /health/ready is for."""
    return {"status": "ok"}


@router.get("/health/ready", summary="Readiness probe (Batch 13) — can this pod serve a real request")
async def health_ready() -> dict:
    """503 (not 200-with-a-status-field, unlike /health) when Postgres or
    Redis is unreachable. A K8s readiness probe failing here means stop
    routing traffic to this pod but don't restart it — the correct response
    to "the DB is briefly unreachable," not "this process is broken."""
    if not await check_readiness():
        raise HTTPException(status_code=503, detail="not ready")
    return {"status": "ok"}
