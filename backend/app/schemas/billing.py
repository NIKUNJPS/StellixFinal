"""Pydantic schemas for billing (Batch 14). Field names match the ORM/API exactly."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.organization import OrganizationTier
from app.models.subscription import SubscriptionStatus


class CheckoutRequest(BaseModel):
    tier: OrganizationTier


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class BillingStatusResponse(BaseModel):
    tier: OrganizationTier
    max_strategies: int | None
    active_strategy_count: int
    subscription_status: SubscriptionStatus | None
    current_period_end: datetime | None
    cancel_at_period_end: bool


class InvoiceItem(BaseModel):
    id: str
    number: str | None
    status: str | None
    amount_due: int
    amount_paid: int
    currency: str
    created: datetime
    hosted_invoice_url: str | None
    invoice_pdf: str | None


class InvoiceListResponse(BaseModel):
    items: list[InvoiceItem]
