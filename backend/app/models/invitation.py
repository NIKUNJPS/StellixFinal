"""Invitation model (Batch 25) — an org admin invites a colleague into their org.

This is the missing half of company onboarding: until now additional users could only
be created by seeding or the superadmin console. An invitation carries the *role* the
invitee will receive, so the 5-role RBAC is applied at the moment they join.

Security notes:
* The raw invite token is never stored — only its SHA-256 hash (same pattern as
  RefreshToken / PasswordResetToken / EmailVerificationToken).
* ``organization_id`` comes from TenantScopedModel, so an invitation is structurally
  bound to the inviting org and can never grant access to a different tenant.
* Single-use: ``accepted_at`` is set on redemption and checked on every accept.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel
from app.models.user import UserRole


class InvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"


class Invitation(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "invitations"

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    # The RBAC role the invitee receives when they accept.
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            native_enum=True,
            create_type=False,  # the enum type already exists (users.role)
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
        default=UserRole.RESEARCHER,
    )
    # Batch 26: the role (system or this org's custom role) the invitee receives. NULL
    # means the system role matching ``role`` above.
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(
            InvitationStatus,
            name="invitation_status",
            native_enum=False,  # VARCHAR + check — simple and fully reversible
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
            length=16,
        ),
        nullable=False,
        default=InvitationStatus.PENDING,
        server_default=InvitationStatus.PENDING.value,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Invitation id={self.id} email={self.email!r} role={self.role.value} status={self.status.value}>"
