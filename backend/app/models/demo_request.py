"""DemoRequest model — public lead capture (Batch 15).

Deliberately NOT TenantScopedModel: a demo request comes from an anonymous
public visitor with no organization yet — a pre-tenant lead, the mirror image
of Organization/registration. Written by the unauthenticated
POST /contact/demo-request endpoint. See docs/schemas.md -> DemoRequest.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin


class DemoRequestStatus(str, enum.Enum):
    """Review workflow (Batch 24). A pending lead the founder approves (→ creates an
    org + admin user, status CONVERTED) or rejects."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CONVERTED = "converted"

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class DemoFirmType(str, enum.Enum):
    HEDGE_FUND = "hedge_fund"
    PROP_TRADING = "prop_trading"
    CRYPTO_FUND = "crypto_fund"
    INVESTMENT_BANK = "investment_bank"
    ASSET_MANAGER = "asset_manager"
    FAMILY_OFFICE = "family_office"
    ACADEMIC_OTHER = "academic_other"


class DemoTeamSize(str, enum.Enum):
    SIZE_1_5 = "size_1_5"
    SIZE_6_20 = "size_6_20"
    SIZE_21_50 = "size_21_50"
    SIZE_51_200 = "size_51_200"
    SIZE_200_PLUS = "size_200_plus"


class DemoPrimaryInterest(str, enum.Enum):
    REGIME_DETECTION = "regime_detection"
    FAILURE_INTELLIGENCE = "failure_intelligence"
    KNOWLEDGE_GRAPH = "knowledge_graph"
    EVOLUTION_ENGINE = "evolution_engine"
    VALIDATION_GOVERNANCE = "validation_governance"
    FULL_PLATFORM = "full_platform"


class DemoRequest(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "demo_requests"

    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    work_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    firm_type: Mapped[DemoFirmType] = mapped_column(
        Enum(
            DemoFirmType,
            name="demo_firm_type",
            native_enum=True,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
    )
    team_size: Mapped[DemoTeamSize] = mapped_column(
        Enum(
            DemoTeamSize,
            name="demo_team_size",
            native_enum=True,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
    )
    use_case_description: Mapped[str] = mapped_column(Text, nullable=False)
    # Small fixed vocabulary read only for lead triage — stored as a JSON string
    # array (like ApiKey.scopes), not a second enum table.
    primary_interest: Mapped[list] = mapped_column(_JSONB, nullable=False, default=list)
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    consent: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # --- Review workflow (Batch 24) ------------------------------------------
    status: Mapped[DemoRequestStatus] = mapped_column(
        Enum(
            DemoRequestStatus,
            name="demo_request_status",
            native_enum=False,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
            length=20,
        ),
        nullable=False,
        server_default=DemoRequestStatus.PENDING.value,
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<DemoRequest id={self.id} email={self.work_email} firm={self.firm_type.value}>"
