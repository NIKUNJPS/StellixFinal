"""Research notes endpoints (Batch 7 minimal CRUD, extended Batch 10 into the full
Research Notebook backend): CRUD, autosave, and Postgres full-text search. Every
create/update syncs into the Neo4j ResearchNote node via GraphSyncService."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.models.research_note import ResearchNote, ResearchNoteStatus
from app.models.user import User
from app.schemas.research_note import (
    ResearchNoteAutosaveRequest,
    ResearchNoteCreateRequest,
    ResearchNoteListItem,
    ResearchNoteListResponse,
    ResearchNoteRead,
    ResearchNoteUpdateRequest,
)
from app.services import research_note as svc

router = APIRouter(prefix="/research-notes", tags=["Research Notebook"])


async def _get_or_404(db: AsyncSession, note_id: uuid.UUID) -> ResearchNote:
    note = (
        await db.execute(select(ResearchNote).where(ResearchNote.id == note_id))
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research note not found")
    return note


@router.post("", response_model=ResearchNoteRead, status_code=status.HTTP_201_CREATED)
async def create_research_note(
    payload: ResearchNoteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ResearchNote:
    return await svc.create_note(db, user_id=current_user.id, data=payload.model_dump())


@router.get("", response_model=ResearchNoteListResponse)
async def list_research_notes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    status_filter: ResearchNoteStatus | None = Query(default=None, alias="status"),
    tag: str | None = Query(default=None, max_length=50),
    author_user_id: uuid.UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255, description="Full-text search over title+content+hypothesis"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ResearchNoteListResponse:
    total, rows = await svc.list_notes(
        db,
        status_filter=status_filter,
        tag=tag,
        author_user_id=author_user_id,
        start_date=start_date,
        end_date=end_date,
        query=q,
        limit=limit,
        offset=offset,
    )
    return ResearchNoteListResponse(
        total=total,
        count=len(rows),
        items=[ResearchNoteListItem.model_validate(r) for r in rows],
    )


@router.get("/{note_id}", response_model=ResearchNoteRead)
async def get_research_note(
    note_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ResearchNote:
    return await _get_or_404(db, note_id)


@router.put("/{note_id}", response_model=ResearchNoteRead)
async def update_research_note(
    note_id: uuid.UUID,
    payload: ResearchNoteUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ResearchNote:
    note = await _get_or_404(db, note_id)
    return await svc.apply_partial_update(db, note=note, data=payload.model_dump(exclude_unset=True))


@router.patch("/{note_id}/autosave", response_model=ResearchNoteRead)
async def autosave_research_note(
    note_id: uuid.UUID,
    payload: ResearchNoteAutosaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> ResearchNote:
    note = await _get_or_404(db, note_id)
    return await svc.apply_partial_update(db, note=note, data=payload.model_dump(exclude_unset=True))
