"""ApprovalRecord — governance audit of approve/reject actions on a strategy."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel


class ApprovalAction(str, enum.Enum):
    APPROVE = "approve"
    REJECT = "reject"


class ApprovalRecord(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "approval_records"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approved_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[ApprovalAction] = mapped_column(
        Enum(
            ApprovalAction,
            name="approval_action",
            native_enum=True,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
    )
    justification: Mapped[str] = mapped_column(Text, nullable=False)
