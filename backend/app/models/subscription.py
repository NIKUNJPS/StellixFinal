"""Subscription model — Stripe sync record (Batch 14).

Exactly one row per organization once they've ever completed Checkout
(enforced by the table-level unique constraint on organization_id, not an
override of TenantScopedModel's own non-unique organization_id column). An
org that has never upgraded off the free Starter default has no Subscription
row at all — see docs/schemas.md -> Subscription for why that's a normal
state, not an error, and why Organization.tier/max_strategies (not this
table) remain what the rest of the codebase actually reads.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel
from app.models.organization import OrganizationTier


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    TRIALING = "trialing"


class Subscription(Base, UUIDPrimaryKeyMixin, TenantScopedModel):
    __tablename__ = "subscriptions"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_subscriptions_organization_id"),)

    stripe_customer_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Nullable: a Customer can exist fractionally before checkout.session.completed
    # actually creates the underlying Subscription.
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    tier: Mapped[OrganizationTier] = mapped_column(
        # Reuses the SAME Postgres enum type as Organization.tier (schema-first
        # "extend, never redefine" rule) — not a second, parallel tier enum.
        Enum(
            OrganizationTier,
            name="organization_tier",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(
            SubscriptionStatus,
            name="subscription_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Subscription id={self.id} org={self.organization_id} tier={self.tier.value} status={self.status.value}>"
