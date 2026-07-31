"""Pydantic schemas for the Research Notebook endpoints (Batch 7, extended Batch 10)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models.research_note import ResearchNoteStatus

# A markdown research note is legitimately long-form, but still needs a ceiling —
# 100KB matches the Batch 11 spec's suggested cap for a large text/JSONB field.
_CONTENT_MAX_LENGTH = 100_000
_SHORT_TEXT_MAX_LENGTH = 5000  # hypothesis / method — shorter than full content
_MAX_TAGS = 20
_MAX_LINKED_IDS = 100
_Tag = Annotated[str, Field(max_length=50)]


class ResearchNoteCreateRequest(BaseModel):
    title: str = Field(default="", max_length=255)
    content: str = Field(min_length=1, max_length=_CONTENT_MAX_LENGTH)
    hypothesis: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX_LENGTH)
    method: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX_LENGTH)
    status: ResearchNoteStatus = ResearchNoteStatus.IN_PROGRESS
    tags: list[_Tag] = Field(default_factory=list, max_length=_MAX_TAGS)
    related_strategy_ids: list[uuid.UUID] = Field(default_factory=list, max_length=_MAX_LINKED_IDS)
    related_failure_ids: list[uuid.UUID] = Field(default_factory=list, max_length=_MAX_LINKED_IDS)


class ResearchNoteUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=_CONTENT_MAX_LENGTH)
    hypothesis: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX_LENGTH)
    method: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX_LENGTH)
    status: ResearchNoteStatus | None = None
    tags: list[_Tag] | None = Field(default=None, max_length=_MAX_TAGS)
    related_strategy_ids: list[uuid.UUID] | None = Field(default=None, max_length=_MAX_LINKED_IDS)
    related_failure_ids: list[uuid.UUID] | None = Field(default=None, max_length=_MAX_LINKED_IDS)


# Same partial shape as update today — kept as a distinct class so the autosave
# contract can evolve independently (e.g. if it later drops fields update keeps).
class ResearchNoteAutosaveRequest(ResearchNoteUpdateRequest):
    pass


class ResearchNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    content: str
    hypothesis: str | None
    method: str | None
    status: ResearchNoteStatus
    tags: list[str]
    related_strategy_ids: list[str]
    related_failure_ids: list[str]
    author_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ResearchNoteListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: ResearchNoteStatus
    tags: list[str]
    author_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ResearchNoteListResponse(BaseModel):
    total: int
    count: int
    items: list[ResearchNoteListItem]
