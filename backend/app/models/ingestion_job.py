"""ingestion_job — tracks an async data-ingestion run (status, results, warnings).

Tenant-scoped so the status endpoint is naturally isolated per organization. Data
quality warnings are retained here to be surfaced later on the System Monitoring page.
"""

from __future__ import annotations

import enum
from datetime import date

from sqlalchemy import JSON, Date, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class IngestionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class IngestionJob(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "ingestion_jobs"

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    interval: Mapped[str] = mapped_column(String(8), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)

    status: Mapped[IngestionStatus] = mapped_column(
        # values_callable: persist enum VALUES to match the Postgres enum labels
        # (see the note on User.role / Organization.tier — names vs values).
        Enum(
            IngestionStatus,
            name="ingestion_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=IngestionStatus.PENDING,
    )

    rows_ingested: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    features_computed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # List of data-quality warning dicts (gaps, dropped rows, ...).
    warnings: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
