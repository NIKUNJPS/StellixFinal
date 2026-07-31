"""Declarative base and common column mixins.

`Base` is the single declarative base for the whole application. Every model imports
from here so Alembic autogenerate sees one consistent metadata object.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Single declarative base for all ORM models."""


class UUIDPrimaryKeyMixin:
    """Adds a UUID primary key, generated application-side (``uuid4``).

    The Postgres migration additionally sets a ``gen_random_uuid()`` server default so
    raw-SQL inserts also get an id; the ORM always supplies the id itself, which keeps
    the model portable (e.g. SQLite in tests).
    """

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    """Adds timezone-aware ``created_at`` / ``updated_at`` columns (UTC)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
