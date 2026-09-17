"""Organization role administration (Batch 26).

SuperAdmins define the permission catalog and the platform-wide system roles
(app/api/routes/superadmin.py). Org admins — anyone whose role grants ``roles.manage`` —
use them day to day: assigning roles to their own members and creating custom roles
visible only inside their own organization.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db, require_any_permission, require_permission
from app.models.rbac import Permission, Role
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.rbac import (
    PermissionCatalogResponse,
    PermissionRead,
    RoleCreateRequest,
    RoleListResponse,
    RoleRead,
    RoleUpdateRequest,
)
from app.services import rbac as rbac_svc

router = APIRouter(prefix="/roles", tags=["Roles & Permissions"])


def rbac_http(exc: rbac_svc.RbacError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


async def role_reads(session: AsyncSession, roles: list[Role], organization_id: uuid.UUID | None) -> list[RoleRead]:
    perms = await rbac_svc.permission_keys_by_role(session, [r.id for r in roles])
    counts = await rbac_svc.member_counts_by_role(session, organization_id)
    return [
        RoleRead(
            id=r.id,
            organization_id=r.organization_id,
            name=r.name,
            description=r.description,
            is_system_default=r.is_system_default,
            system_key=r.system_key,
            scope="system" if r.organization_id is None else "organization",
            permissions=perms.get(r.id, []),
            member_count=counts.get(r.id, 0),
            created_at=r.created_at,
        )
        for r in roles
    ]


@router.get("/permissions", response_model=PermissionCatalogResponse, summary="The platform permission catalog")
async def permission_catalog(
    _user: User = Depends(require_permission(P.ROLES_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db),
) -> PermissionCatalogResponse:
    rows = (await db.execute(select(Permission).order_by(Permission.category, Permission.key))).scalars().all()
    return PermissionCatalogResponse(items=[PermissionRead.model_validate(p) for p in rows])


@router.get(
    "",
    response_model=RoleListResponse,
    summary="Roles assignable in this organization: system roles + its own custom roles",
)
async def list_roles(
    user: User = Depends(require_any_permission(P.ROLES_MANAGE, P.MEMBERS_INVITE)),
    db: AsyncSession = Depends(get_tenant_db),
) -> RoleListResponse:
    roles = await rbac_svc.roles_visible_to_org(db, user.organization_id)
    return RoleListResponse(items=await role_reads(db, roles, user.organization_id))


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED, summary="Create a custom role for this organization")
async def create_role(
    payload: RoleCreateRequest,
    user: User = Depends(require_permission(P.ROLES_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db),
) -> RoleRead:
    try:
        role = await rbac_svc.create_org_role(
            db, actor=user, name=payload.name, description=payload.description, permission_keys=payload.permissions
        )
    except rbac_svc.RbacError as exc:
        raise rbac_http(exc) from exc
    return (await role_reads(db, [role], user.organization_id))[0]


@router.patch("/{role_id}", response_model=RoleRead, summary="Edit one of this organization's custom roles")
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdateRequest,
    user: User = Depends(require_permission(P.ROLES_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db),
) -> RoleRead:
    try:
        role = await rbac_svc.update_org_role(
            db,
            actor=user,
            role_id=role_id,
            name=payload.name,
            description=payload.description,
            permission_keys=payload.permissions,
        )
    except rbac_svc.RbacError as exc:
        await db.rollback()
        raise rbac_http(exc) from exc
    return (await role_reads(db, [role], user.organization_id))[0]


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an unused custom role")
async def delete_role(
    role_id: uuid.UUID,
    user: User = Depends(require_permission(P.ROLES_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db),
) -> Response:
    try:
        await rbac_svc.delete_org_role(db, actor=user, role_id=role_id)
    except rbac_svc.RbacError as exc:
        raise rbac_http(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
