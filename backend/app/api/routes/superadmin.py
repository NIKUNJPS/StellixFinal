"""SuperAdmin control-plane routes (Batch 24) — /superadmin/*.

Every route is behind ``require_super_admin`` (is_super_admin only). The service
runs on an UNSCOPED session (get_system_db) because these operations span all
tenants — the ORM tenant filter would otherwise hide other orgs' data. That
cross-tenant access is what superadmin_audit_log records (SOC 2).

Tagged "SuperAdmin (Internal)" so it is visually separated in the OpenAPI docs.
"""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_system_db, require_super_admin
from app.models.user import User
from app.schemas.superadmin import (
    ApproveDemoRequest,
    ApproveOrgRequest,
    ImpersonateRequest,
    InternalNoteRequest,
    RejectDemoRequest,
    SuspendOrgRequest,
    SuspendUserRequest,
    TerminateOrgRequest,
    UpdateOrgLimitsRequest,
)
from app.services import superadmin as svc

router = APIRouter(prefix="/superadmin", tags=["SuperAdmin (Internal)"])


def _client_ip(request: Request) -> str | None:
    if request.client:
        return request.client.host
    return None


def _uuid(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {what}") from exc


def _handle(exc: svc.SuperAdminError) -> HTTPException:
    # not-found vs. precondition — both surface as 404/409 rather than 500.
    detail = str(exc)
    code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() else status.HTTP_409_CONFLICT
    return HTTPException(status_code=code, detail=detail)


# --------------------------------------------------------------------------- #
# Platform analytics
# --------------------------------------------------------------------------- #
@router.get("/stats", summary="Platform-wide stats (all orgs)")
async def platform_stats(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    return await svc.get_platform_stats(db, super_admin_id=admin.id)


@router.get("/revenue", summary="Revenue breakdown by plan (list-price MRR)")
async def revenue(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    return await svc.get_revenue_breakdown(db, super_admin_id=admin.id)


@router.get("/usage", summary="Per-org usage/cost (margin check)")
async def usage(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    return await svc.get_usage_by_org(db, super_admin_id=admin.id)


# --------------------------------------------------------------------------- #
# Organizations
# --------------------------------------------------------------------------- #
@router.get("/orgs", summary="List all organizations (all tenants)")
async def list_orgs(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
    status_filter: str | None = Query(default=None, alias="status"),
    plan: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await svc.list_all_orgs(
        db,
        super_admin_id=admin.id,
        status_filter=status_filter,
        plan_filter=plan,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/orgs/{org_id}", summary="Full org profile + users")
async def org_detail(
    org_id: str,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        return await svc.get_org_detail(db, super_admin_id=admin.id, org_id=_uuid(org_id, "org_id"))
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc


@router.post("/orgs/{org_id}/approve", summary="Approve org → active")
async def approve_org(
    org_id: str,
    payload: ApproveOrgRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        org = await svc.approve_org(
            db,
            super_admin_id=admin.id,
            org_id=_uuid(org_id, "org_id"),
            plan=payload.plan.value if payload.plan else None,
            max_strategies=payload.max_strategies,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(org.id), "status": org.status.value, "plan": org.tier.value}


@router.post("/orgs/{org_id}/suspend", summary="Suspend org (locks out all endpoints)")
async def suspend_org(
    org_id: str,
    payload: SuspendOrgRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        org = await svc.suspend_org(
            db,
            super_admin_id=admin.id,
            org_id=_uuid(org_id, "org_id"),
            reason=payload.reason,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(org.id), "status": org.status.value}


@router.post("/orgs/{org_id}/reactivate", summary="Reactivate a suspended org")
async def reactivate_org(
    org_id: str,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        org = await svc.reactivate_org(
            db, super_admin_id=admin.id, org_id=_uuid(org_id, "org_id"), ip_address=_client_ip(request)
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(org.id), "status": org.status.value}


@router.post("/orgs/{org_id}/terminate", summary="Terminate org (410 on all endpoints)")
async def terminate_org(
    org_id: str,
    payload: TerminateOrgRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        org = await svc.terminate_org(
            db,
            super_admin_id=admin.id,
            org_id=_uuid(org_id, "org_id"),
            reason=payload.reason,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(org.id), "status": org.status.value}


@router.post("/orgs/{org_id}/limits", summary="Override plan limits / revenue")
async def update_limits(
    org_id: str,
    payload: UpdateOrgLimitsRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        org = await svc.update_org_limits(
            db,
            super_admin_id=admin.id,
            org_id=_uuid(org_id, "org_id"),
            max_strategies=payload.max_strategies,
            monthly_revenue_usd=payload.monthly_revenue_usd,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {
        "id": str(org.id),
        "max_strategies": org.max_strategies,
        "monthly_revenue_usd": float(org.monthly_revenue_usd or 0),
    }


@router.post("/orgs/{org_id}/notes", summary="Append an internal note")
async def add_note(
    org_id: str,
    payload: InternalNoteRequest,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        org = await svc.add_internal_note(
            db, super_admin_id=admin.id, org_id=_uuid(org_id, "org_id"), note=payload.note
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(org.id), "internal_notes": org.internal_notes}


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
@router.get("/users", summary="List all users (all tenants)")
async def list_users(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
    search: str | None = Query(default=None, max_length=320),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await svc.list_all_users(
        db, super_admin_id=admin.id, search=search, limit=limit, offset=offset
    )


@router.post("/impersonate", summary="Mint a 15-min read-only impersonation token")
async def impersonate(
    payload: ImpersonateRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        return await svc.impersonate_user(
            db,
            super_admin_id=admin.id,
            target_user_id=_uuid(payload.target_user_id, "target_user_id"),
            reason=payload.reason,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc


@router.post("/users/{user_id}/suspend", summary="Suspend a user")
async def suspend_user(
    user_id: str,
    payload: SuspendUserRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        user = await svc.suspend_user(
            db,
            super_admin_id=admin.id,
            user_id=_uuid(user_id, "user_id"),
            reason=payload.reason,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(user.id), "is_active": user.is_active}


@router.post("/users/{user_id}/force-password-reset", summary="Revoke sessions, force re-auth")
async def force_reset(
    user_id: str,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        await svc.force_password_reset(
            db, super_admin_id=admin.id, user_id=_uuid(user_id, "user_id"), ip_address=_client_ip(request)
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Demo requests
# --------------------------------------------------------------------------- #
@router.get("/demo-requests", summary="Sales inbox (pending first)")
async def demo_requests(
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    return await svc.list_demo_requests(db, super_admin_id=admin.id)


@router.post("/demo-requests/{request_id}/approve", summary="Approve → creates org + admin user")
async def approve_demo(
    request_id: str,
    payload: ApproveDemoRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    # Generate a strong temp password if the founder didn't supply one; returned
    # once so it can be relayed (no transactional email in this deployment).
    temp_password = payload.temp_password or secrets.token_urlsafe(12)
    try:
        result = await svc.approve_demo_request(
            db,
            super_admin_id=admin.id,
            request_id=_uuid(request_id, "request_id"),
            plan=payload.plan.value,
            temp_password=temp_password,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {**result, "temporary_password": temp_password}


@router.post("/demo-requests/{request_id}/reject", summary="Reject a demo request")
async def reject_demo(
    request_id: str,
    payload: RejectDemoRequest,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    try:
        demo = await svc.reject_demo_request(
            db,
            super_admin_id=admin.id,
            request_id=_uuid(request_id, "request_id"),
            reason=payload.reason,
            ip_address=_client_ip(request),
        )
    except svc.SuperAdminError as exc:
        raise _handle(exc) from exc
    return {"id": str(demo.id), "status": demo.status.value}
