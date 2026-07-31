/** Types mirroring backend app/schemas/billing.py (identical field names). */

import type { OrganizationTier } from "@/lib/auth-types";

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export interface CheckoutRequest {
  tier: OrganizationTier;
}

export interface CheckoutResponse {
  checkout_url: string;
}

export interface PortalResponse {
  portal_url: string;
}

export interface BillingStatusResponse {
  tier: OrganizationTier;
  max_strategies: number | null;
  active_strategy_count: number;
  subscription_status: SubscriptionStatus | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface InvoiceItem {
  id: string;
  number: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export interface InvoiceListResponse {
  items: InvoiceItem[];
}

export const TIER_LABELS: Record<OrganizationTier, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  trialing: "Trialing",
};
