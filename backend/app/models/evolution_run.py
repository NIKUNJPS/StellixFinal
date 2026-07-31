"""EvolutionRun model — one row per GA run (Batch 8). See docs/schemas.md."""

from __future__ import annotations

import enum

from sqlalchemy import JSON, Enum, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


def _values(enum_cls):
    return [member.value for member in enum_cls]


class EvolutionRunStatus(str, enum.Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EvolutionRun(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "evolution_runs"

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[EvolutionRunStatus] = mapped_column(
        Enum(EvolutionRunStatus, name="evolution_run_status", native_enum=True, values_callable=_values),
        nullable=False,
        default=EvolutionRunStatus.RUNNING,
    )
    ga_config: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
    seed_strategy_ids: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    generation_history: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    best_fitness: Mapped[float | None] = mapped_column(Float, nullable=True)
    generations_run: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_strategy_ids: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
