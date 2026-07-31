"""ComplianceExportJob model — async job tracking for governance exports (Batch 10)."""

from __future__ import annotations

import enum
import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel


def _values(enum_cls):
    return [member.value for member in enum_cls]


class ComplianceExportStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ComplianceExportJob(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "compliance_export_jobs"

    requested_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    export_format: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[ComplianceExportStatus] = mapped_column(
        Enum(ComplianceExportStatus, name="compliance_export_status", native_enum=True, values_callable=_values),
        nullable=False,
        default=ComplianceExportStatus.PENDING,
    )
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
