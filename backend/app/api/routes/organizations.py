"""Organization settings endpoint (Batch 12) — Settings > Profile.

Just one field today: benchmark_symbol (the Beta-vs-benchmark comparison
symbol, pre-note 3 of the Batch 12 spec: "a configurable parameter"). Admin-
only, mirroring the "role read-only unless admin" convention already used for
the rest of the Profile tab.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db, require_permission
from app.models.organization import Organization
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.organization import OrganizationRead, OrganizationUpdateRequest

router = APIRouter(prefix="/organizations", tags=["Organization"])


@router.patch("/me", response_model=OrganizationRead, summary="Update the current org's settings (admin only)")
async def update_my_organization(
    payload: OrganizationUpdateRequest,
    current_user: User = Depends(require_permission(P.ORGANIZATION_MANAGE)),
    db: AsyncSession = Depends(get_tenant_db),
) -> Organization:
    organization = await db.get(Organization, current_user.organization_id)
    # Apply only the fields the caller sent (every field is optional — Batch 22).
    if payload.benchmark_symbol is not None:
        organization.benchmark_symbol = payload.benchmark_symbol
    if payload.weekly_digest_enabled is not None:
        organization.weekly_digest_enabled = payload.weekly_digest_enabled
    await db.commit()
    await db.refresh(organization)
    return organization
