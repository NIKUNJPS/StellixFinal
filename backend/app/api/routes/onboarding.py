"""Onboarding status (Batch 21).

A newly-approved org (Batch 24 flow) can log in to empty screens. The frontend
wizard gates on this endpoint: it shows only when onboarding is incomplete AND the
org has no strategies yet. ``organizations.onboarding_completed`` already exists
(Batch 24 migration 0016) — no schema change here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.models.organization import Organization
from app.models.strategy import Strategy
from app.models.user import User

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


@router.get("/status", summary="Whether the caller's org has completed onboarding")
async def onboarding_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> dict:
    org = await db.get(Organization, current_user.organization_id)
    # Strategy is a TenantScopedModel, so this count auto-scopes to the caller's org.
    strategy_count = await db.scalar(select(func.count()).select_from(Strategy))
    return {
        "completed": bool(org.onboarding_completed) if org else False,
        "strategy_count": int(strategy_count or 0),
    }


@router.post("/complete", summary="Mark the caller's org onboarding as complete")
async def complete_onboarding(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> dict:
    org = await db.get(Organization, current_user.organization_id)
    if org is None:  # pragma: no cover - the caller's org always exists
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    org.onboarding_completed = True
    await db.commit()
    return {"completed": True}
