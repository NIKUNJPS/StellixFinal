"""Billing endpoints (Batch 14).

Two separate APIRouter instances registered differently in app/api/router.py
(see docs/schemas.md -> Billing & Subscriptions "Billing endpoints" for why):
`router` is JWT-authenticated/admin-only and gets the router-wide global rate
limiter like every other feature router; `webhook_router` is Stripe-
authenticated via signature only (no JWT exists for a server-to-server
webhook call) and must NOT get the JWT-keyed global limiter — mirrors exactly
how auth.router is excluded from it for the same reason.
"""

from __future__ import annotations

import json
import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_system_db, get_tenant_db, require_role
from app.core.config import settings
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.billing import (
    BillingStatusResponse,
    CheckoutRequest,
    CheckoutResponse,
    InvoiceItem,
    InvoiceListResponse,
    PortalResponse,
)
from app.services import billing as billing_service
from app.services.billing import BillingUnavailableError, EnterpriseContactSalesError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Usage & Billing"])
webhook_router = APIRouter(prefix="/billing", tags=["Usage & Billing"])


@router.get("/status", response_model=BillingStatusResponse, summary="Current plan + usage (admin only)")
async def get_status(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> BillingStatusResponse:
    organization = await db.get(Organization, current_user.organization_id)
    status_dict = await billing_service.get_billing_status(db, organization=organization)
    return BillingStatusResponse(**status_dict)


@router.get("/invoices", response_model=InvoiceListResponse, summary="Invoice history, live from Stripe (admin only)")
async def get_invoices(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> InvoiceListResponse:
    subscription = await billing_service.get_subscription(db, current_user.organization_id)
    if subscription is None:
        return InvoiceListResponse(items=[])
    try:
        invoices = await billing_service.list_invoices(stripe_customer_id=subscription.stripe_customer_id)
    except BillingUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return InvoiceListResponse(items=[InvoiceItem(**item) for item in invoices])


@router.post("/checkout", response_model=CheckoutResponse, summary="Start a Stripe Checkout session (admin only)")
async def create_checkout(
    payload: CheckoutRequest,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> CheckoutResponse:
    organization = await db.get(Organization, current_user.organization_id)
    try:
        checkout_url = await billing_service.create_checkout_session(
            db, organization=organization, user=current_user, tier=payload.tier
        )
    except EnterpriseContactSalesError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except BillingUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return CheckoutResponse(checkout_url=checkout_url)


@router.post("/portal", response_model=PortalResponse, summary="Start a Stripe Customer Portal session (admin only)")
async def create_portal(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> PortalResponse:
    organization = await db.get(Organization, current_user.organization_id)
    try:
        portal_url = await billing_service.create_portal_session(db, organization=organization)
    except BillingUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return PortalResponse(portal_url=portal_url)


_WEBHOOK_HANDLERS = {
    "checkout.session.completed": billing_service.handle_checkout_completed,
    "customer.subscription.updated": billing_service.handle_subscription_updated,
    "customer.subscription.deleted": billing_service.handle_subscription_deleted,
    "invoice.payment_failed": billing_service.handle_invoice_payment_failed,
}


@webhook_router.post("/webhook", summary="Stripe webhook receiver (Stripe-signature-authenticated, no JWT)")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_system_db)) -> dict:
    if not settings.STRIPE_SECRET_KEY or not settings.STRIPE_WEBHOOK_SECRET:
        # A 503 is a normal, retryable response from Stripe's perspective —
        # it retries failed webhook deliveries on a backoff schedule for
        # several days, so this is safe even though no human sees it.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        # construct_event's return value is deliberately discarded: it wraps
        # the payload in stripe's StripeObject (a rich attribute-access
        # wrapper with no real .get() method — confirmed live, an
        # AttributeError, not the plain-dict behavior every handler function
        # below is written against). Called purely for its verification side
        # effect (raises on a bad/missing signature); the actual event dict
        # comes from parsing the same already-verified bytes ourselves.
        stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError) as exc:
        logger.warning("Rejected Stripe webhook: invalid signature (%s)", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature") from exc

    event = json.loads(payload)
    handler = _WEBHOOK_HANDLERS.get(event["type"])
    if handler is None:
        # Ack anything we don't act on — Stripe expects a 200 for every event
        # type sent to an endpoint subscribed to "all events."
        return {"received": True, "handled": False}

    await handler(db, event["data"]["object"])
    return {"received": True, "handled": True}
