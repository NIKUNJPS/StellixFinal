"""ResearchNote model — researcher hypotheses/annotations (Pillar 3).

Batch 7 shipped the minimal version (content, hypothesis, author_user_id). Batch 10
extends it into the full Research Notebook backing store: title, method, status,
tags, related_strategy_ids, related_failure_ids, updated_at (for autosave), and a
generated tsvector column for full-text search. See docs/schemas.md.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import JSON, Enum, FetchedValue, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")
# Plain TEXT on SQLite (hermetic tests — unused there), a real tsvector on Postgres.
_TSVECTOR = Text().with_variant(TSVECTOR(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


class ResearchNoteStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class ResearchNote(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "research_notes"

    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    hypothesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    method: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ResearchNoteStatus] = mapped_column(
        Enum(ResearchNoteStatus, name="research_note_status", native_enum=True, values_callable=_values),
        nullable=False,
        default=ResearchNoteStatus.IN_PROGRESS,
    )
    tags: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    related_strategy_ids: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    related_failure_ids: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Postgres-only GENERATED ALWAYS column (raw SQL in migration 0010, not declared
    # via SQLAlchemy's Computed() here so the expression — Postgres-only syntax —
    # doesn't leak into hermetic SQLite's plain-TEXT DDL for this column).
    # server_default=FetchedValue() tells the ORM this is server-managed: never send
    # a value on INSERT/UPDATE (Postgres rejects any explicit value, even NULL, into
    # a generated column), just re-fetch it after write.
    search_vector: Mapped[str | None] = mapped_column(
        _TSVECTOR, nullable=True, server_default=FetchedValue()
    )
