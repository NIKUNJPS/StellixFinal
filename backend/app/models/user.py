"""User model — authentication subject and RBAC principal, scoped to one tenant.

See docs/schemas.md → User. Email uniqueness is enforced PER ORGANIZATION.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class UserRole(str, enum.Enum):
    """RBAC roles (PROJECT_CONSTITUTION §2 → Auth)."""

    RESEARCHER = "researcher"
    RISK_MANAGER = "risk_manager"
    CIO = "cio"
    COMPLIANCE_OFFICER = "compliance_officer"
    ADMIN = "admin"


class User(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        # Email is unique within an organization, not globally: the same human may
        # belong to multiple organizations.
        UniqueConstraint("organization_id", "email", name="uq_users_org_email"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        # values_callable: persist enum VALUES ("researcher", ...) not member NAMES
        # ("RESEARCHER", ...), to match the lowercase Postgres enum labels. See the
        # matching note on Organization.tier.
        Enum(
            UserRole,
            name="user_role",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=UserRole.RESEARCHER,
    )
    # Batch 26: the role that actually grants permissions. NULL means "the system role
    # matching the legacy ``role`` column above" (every user created before migration
    # 0020, and any code path that only sets ``role``). ``role`` itself is DEPRECATED for
    # authorization and kept only for the rollback window — see docs/adr/0006.
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # --- Email ownership (Batch 25) ------------------------------------------
    # Proves the person controls the mailbox they registered with. Self-registered
    # users start False and must redeem an EmailVerificationToken; users created by
    # an admin invitation are True on creation (they proved it by opening the invite).
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )

    # --- Founder / platform-operator flag (Batch 24) -------------------------
    # The ONLY thing that grants access to /superadmin/*. Deliberately separate from
    # the RBAC `role` above (which governs actions WITHIN a tenant); this is a
    # platform-wide, cross-tenant capability held only by internal Stellix accounts.
    is_super_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )

    # --- Account-lockout state (5 failures → 15-minute lock) ----------------
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- MFA (Batch 12) -------------------------------------------------------
    # Base32 TOTP secret (pyotp.random_base32()). mfa_enabled only flips to True
    # once a code has been verified against it — see app/services/mfa.py.
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # --- Profile + preferences (Batch 12) -------------------------------------
    # Served path to a locally-stored upload (var/avatars/) — dev-only, see
    # docs/schemas.md "User additions (Batch 12)" for the S3/MinIO note.
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # {"default_regime_filter": ..., "default_date_range_days": ..., "notifications": {...}}
    # Missing keys fall back to defaults applied at the service layer, not the DB.
    preferences: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<User id={self.id} email={self.email!r} role={self.role.value}>"
