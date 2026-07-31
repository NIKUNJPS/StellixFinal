"""Organization (tenant) model — the top-level multi-tenancy boundary.

This is the ONE table that does not carry an ``organization_id`` (it *is* the
tenant); it is therefore NOT ``TenantScopedModel``. Every other client-data table FKs
back to its ``id``. See docs/schemas.md → Organization.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OrganizationTier(str, enum.Enum):
    """Pricing tier (maps to the pricing table)."""

    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class OrganizationStatus(str, enum.Enum):
    """Lifecycle state of a tenant on the platform.

    Distinct from ``is_active`` (the pre-existing boolean, kept in sync: active
    ⟺ status == ACTIVE) — this is the richer state an operator manages, and the
    gate every client request checks (org-status enforcement, app/api/deps.py).
    (This docstring surfaces as the field description in the public OpenAPI schema,
    so it deliberately avoids internal tooling names.)"""

    PENDING_APPROVAL = "pending_approval"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"


# Default strategy cap per tier. NULL means unlimited.
TIER_MAX_STRATEGIES: dict[OrganizationTier, int | None] = {
    OrganizationTier.STARTER: 25,
    OrganizationTier.PRO: None,
    OrganizationTier.ENTERPRISE: None,
}


class Organization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    tier: Mapped[OrganizationTier] = mapped_column(
        # values_callable: persist the enum VALUES ("starter", ...) not the member
        # NAMES ("STARTER", ...). The Postgres enum type (see migration) uses the
        # lowercase values; without this, asyncpg rejects "STARTER" as an invalid
        # label. (SQLite has no native enum, which is why it never caught this.)
        Enum(
            OrganizationTier,
            name="organization_tier",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=OrganizationTier.STARTER,
    )
    # Enforced strategy cap; NULL = unlimited (pro/enterprise).
    max_strategies: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Legacy boolean, retained (used in existing queries). Kept in sync with `status`
    # by the service layer: is_active ⟺ status == ACTIVE.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # --- Lifecycle + onboarding (Batch 24) -----------------------------------
    # Non-native enum (VARCHAR) — see migration 0016 for why. New self-registrations
    # are set to PENDING_APPROVAL by the register service; everything migrated in
    # was backfilled to ACTIVE.
    status: Mapped[OrganizationStatus] = mapped_column(
        Enum(
            OrganizationStatus,
            name="organization_status",
            native_enum=False,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
            length=20,
        ),
        nullable=False,
        server_default=OrganizationStatus.PENDING_APPROVAL.value,
    )
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    terminated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- Control-plane metadata (Batch 24) -----------------------------------
    company_size: Mapped[str | None] = mapped_column(String(64), nullable=True)
    aum_usd_millions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_asset_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Derived from tier pricing at approval time (no fabricated payment data — see
    # app/services/superadmin.py). Numeric, not float, for money.
    monthly_revenue_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0", default=Decimal("0")
    )
    # Org-level Monte-Carlo max-drawdown risk tolerance (%). Risk-tolerant orgs may
    # set this looser than the 30% default (Batch 5 validation).
    risk_tolerance_max_drawdown_pct: Mapped[float] = mapped_column(
        Float, nullable=False, default=30.0, server_default="30.0"
    )
    # Batch 12: configurable benchmark for performance_snapshots.beta_vs_benchmark.
    benchmark_symbol: Mapped[str] = mapped_column(
        String(32), nullable=False, default="SPY", server_default="SPY"
    )
    # Batch 22: opt-out toggle for the weekly digest (delivered via the webhook/log
    # notification channel — no SMTP). The Celery beat sweep skips orgs where this
    # is False.
    weekly_digest_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Organization id={self.id} slug={self.slug!r} tier={self.tier.value}>"
