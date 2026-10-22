"""System Monitoring endpoints (Batch 12) — admin-only, extends Batch 0's
/health into per-service uptime%/response-time, Celery worker liveness, job
queue counts, real host resource gauges, and the Research Memory index
status. Distinct from the unauthenticated, fast /health liveness probe —
this is a heavier, richer, gated view."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import require_permission
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.health import ServiceStatus
from app.schemas.system_health import (
    JobQueueEntry,
    MemoryIndexStatus,
    ResourceGauges,
    ServiceHealthDetailed,
    SystemHealthDetailedResponse,
)
from app.services import system_health as svc

router = APIRouter(prefix="/system", tags=["system"])


@router.get(
    "/health-detailed",
    response_model=SystemHealthDetailedResponse,
    summary="Full System Monitoring snapshot (admin only)",
)
async def health_detailed(
    current_user: User = Depends(require_permission(P.SYSTEM_MONITOR)),
) -> SystemHealthDetailedResponse:
    services = await svc.get_service_health()
    job_queue = await svc.get_job_queue_counts()
    failed_job_count = await svc.get_failed_job_count()
    resources = svc.get_resource_gauges()
    memory = await svc.get_memory_index_status(current_user.organization_id)

    overall = (
        ServiceStatus.OK
        if all(s["status"] == "ok" for s in services.values())
        else ServiceStatus.ERROR
    )
    # Reuses the postgres/redis results already probed above for `services`
    # rather than a second round-trip via app.services.health.check_readiness
    # — same Batch 13 definition (Postgres + Redis only), just sourced from
    # the concurrent probe this endpoint already ran.
    readiness = services["postgres"]["status"] == "ok" and services["redis"]["status"] == "ok"
    return SystemHealthDetailedResponse(
        status=overall,
        services={name: ServiceHealthDetailed(**data) for name, data in services.items()},
        job_queue=[JobQueueEntry(**row) for row in job_queue],
        failed_job_count=failed_job_count,
        resources=ResourceGauges(**resources),
        memory_index=MemoryIndexStatus(**memory) if memory else None,
        liveness=True,
        readiness=readiness,
    )


@router.get(
    "/observability/sentry-test",
    summary="Deliberately raise an exception to verify Sentry capture (admin only)",
)
async def sentry_test(_admin: User = Depends(require_permission(P.SYSTEM_MONITOR))) -> None:
    """Batch 13 DoD: "a deliberately thrown test exception appears in Sentry
    from both backend and frontend". Raises unconditionally, regardless of
    whether SENTRY_DSN is configured — this route's job is just to produce a
    real unhandled exception for the global handler (app.main) and Sentry's
    patched ExceptionMiddleware (when active) to both see; it is not itself
    a check of whether Sentry is configured."""
    raise RuntimeError("Batch 13 Sentry verification: this exception is intentional.")
