"""Research Notebook service (Batch 7 minimal CRUD, extended Batch 10): full
CRUD + autosave + full-text search, syncing every create/update into the
Research Memory via the existing GraphSyncService path (no parallel sync)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.sync_service import GraphSyncService
from app.models.research_note import ResearchNote, ResearchNoteStatus

_PARTIAL_FIELDS = (
    "title",
    "content",
    "hypothesis",
    "method",
    "status",
    "tags",
    "related_strategy_ids",
    "related_failure_ids",
)


def _stringify_ids(value: list[uuid.UUID] | None) -> list[str] | None:
    if value is None:
        return None
    return [str(v) for v in value]


async def create_note(session: AsyncSession, *, user_id: uuid.UUID, data: dict) -> ResearchNote:
    note = ResearchNote(
        title=data.get("title") or "",
        content=data["content"],
        hypothesis=data.get("hypothesis"),
        method=data.get("method"),
        status=data.get("status", ResearchNoteStatus.IN_PROGRESS),
        tags=list(data.get("tags") or []),
        related_strategy_ids=_stringify_ids(data.get("related_strategy_ids")) or [],
        related_failure_ids=_stringify_ids(data.get("related_failure_ids")) or [],
        author_user_id=user_id,
    )
    session.add(note)
    await session.commit()
    await session.refresh(note)
    await GraphSyncService().sync_research_note_node(session, note)
    return note


async def apply_partial_update(session: AsyncSession, *, note: ResearchNote, data: dict) -> ResearchNote:
    """Shared by both the full update and the autosave endpoint — only fields
    actually present in ``data`` (Pydantic's ``exclude_unset``) are touched."""
    for field in _PARTIAL_FIELDS:
        if field not in data:
            continue
        value = data[field]
        if field in ("related_strategy_ids", "related_failure_ids"):
            value = _stringify_ids(value) or []
        note.__setattr__(field, value)
    await session.commit()
    await session.refresh(note)
    await GraphSyncService().sync_research_note_node(session, note)
    return note


async def list_notes(
    session: AsyncSession,
    *,
    status_filter: ResearchNoteStatus | None,
    tag: str | None,
    author_user_id: uuid.UUID | None,
    start_date: date | None,
    end_date: date | None,
    query: str | None,
    limit: int,
    offset: int,
) -> tuple[int, list[ResearchNote]]:
    conditions = []
    if status_filter is not None:
        conditions.append(ResearchNote.status == status_filter)
    if author_user_id is not None:
        conditions.append(ResearchNote.author_user_id == author_user_id)
    if start_date is not None:
        conditions.append(ResearchNote.created_at >= datetime.combine(start_date, time.min, tzinfo=UTC))
    if end_date is not None:
        conditions.append(ResearchNote.created_at <= datetime.combine(end_date, time.max, tzinfo=UTC))

    is_postgres = session.bind.dialect.name == "postgresql"

    if tag is not None:
        if is_postgres:
            from sqlalchemy.dialects.postgresql import JSONB

            conditions.append(ResearchNote.tags.op("@>")(cast([tag], JSONB)))
        else:
            # Hermetic/SQLite fallback: tags is a plain JSON-serialized TEXT column
            # there, so containment can't use a real JSON operator — a substring
            # check on the serialized form is good enough for exercising this
            # endpoint's plumbing in hermetic tests.
            conditions.append(cast(ResearchNote.tags, String).like(f'%"{tag}"%'))

    base_stmt = select(ResearchNote).where(*conditions)
    total = await session.scalar(select(func.count()).select_from(ResearchNote).where(*conditions))

    if query:
        if is_postgres:
            # websearch_to_tsquery (not plainto_tsquery): a search *bar* should accept
            # the syntax users already expect from any search engine — quoted phrases,
            # "OR", "-exclude" — rather than treating the whole input as one AND'd
            # bag of words.
            ts_query = func.websearch_to_tsquery("english", query)
            base_stmt = base_stmt.where(ResearchNote.search_vector.op("@@")(ts_query))
            base_stmt = base_stmt.order_by(func.ts_rank(ResearchNote.search_vector, ts_query).desc())
        else:
            # Hermetic/SQLite fallback: no tsvector/ts_rank there — a naive
            # case-insensitive substring match keeps pagination/filter plumbing
            # testable without a live Postgres. Real relevance ranking is only
            # meaningful (and only tested) against Postgres — see
            # tests/test_research_note_search_integration.py.
            like = f"%{query}%"
            base_stmt = base_stmt.where(
                ResearchNote.title.ilike(like)
                | ResearchNote.content.ilike(like)
                | ResearchNote.hypothesis.ilike(like)
            )
            base_stmt = base_stmt.order_by(ResearchNote.updated_at.desc())
        # A search narrows to matching rows only, so recompute the total under
        # the same predicate rather than reusing the unfiltered count above.
        total = await session.scalar(
            select(func.count()).select_from(base_stmt.with_only_columns(ResearchNote.id).subquery())
        )
    else:
        base_stmt = base_stmt.order_by(ResearchNote.updated_at.desc())

    rows = (await session.execute(base_stmt.limit(limit).offset(offset))).scalars().all()
    return total or 0, list(rows)
