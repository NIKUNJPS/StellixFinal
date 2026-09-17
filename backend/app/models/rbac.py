"""Dynamic RBAC models (Batch 26): Permission, Role, RolePermission.

``Role`` is deliberately NOT a ``TenantScopedModel``. A system role
(``organization_id IS NULL``) is shared by every tenant, which the auto-injected
``organization_id = :bound_org`` filter would hide. Tenant isolation for roles is
enforced instead in exactly one place — ``app.services.rbac`` — which always filters
``organization_id IS NULL OR organization_id = <caller's org>``. See
docs/adr/0006-dynamic-rbac.md.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Permission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "permissions"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(64), nullable=False)


class Role(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_roles_org_name"),
        # NULL organization_id values never collide under a normal unique constraint,
        # so system role names need their own partial unique index.
        Index(
            "uq_roles_system_name",
            "name",
            unique=True,
            postgresql_where=text("organization_id IS NULL"),
            sqlite_where=text("organization_id IS NULL"),
        ),
    )

    # NULL = platform-wide system role; set = custom role usable only inside that org.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # The five original roles. Cannot be deleted or renamed; description and permission
    # set remain editable by a SuperAdmin.
    is_system_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # For system default roles this is the legacy users.role value the row replaces.
    system_key: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )
