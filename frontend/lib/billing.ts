import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  BillingStatusResponse,
  CheckoutRequest,
  CheckoutResponse,
  InvoiceListResponse,
  PortalResponse,
} from "@/lib/billing-types";

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  const res = await apiFetch("/billing/status");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load billing status"));
  return (await res.json()) as BillingStatusResponse;
}

export async function getInvoices(): Promise<InvoiceListResponse> {
  const res = await apiFetch("/billing/invoices");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load invoices"));
  return (await res.json()) as InvoiceListResponse;
}

export async function createCheckout(payload: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await apiFetch("/billing/checkout", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to start checkout"));
  return (await res.json()) as CheckoutResponse;
}

export async function createPortalSession(): Promise<PortalResponse> {
  const res = await apiFetch("/billing/portal", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to open billing portal"));
  return (await res.json()) as PortalResponse;
}
