"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, ExternalLink, ShieldCheck, Sparkles, AlertCircle, Check, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCheckout, createPortalSession, getBillingStatus, getInvoices } from "@/lib/billing";
import { SUBSCRIPTION_STATUS_LABELS, TIER_LABELS, type BillingStatusResponse, type InvoiceItem } from "@/lib/billing-types";
import type { OrganizationTier } from "@/lib/auth-types";

const PLAN_CARDS: { tier: OrganizationTier; price: string; blurb: string }[] = [
  { tier: "starter", price: "$49/mo", blurb: "Up to 25 active strategies." },
  { tier: "pro", price: "$199/mo", blurb: "Unlimited active strategies." },
  { tier: "enterprise", price: "Contact Sales", blurb: "Custom terms for large research teams." },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[] | null>(null);
  const [invoicesUnavailable, setInvoicesUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await getBillingStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing status");
    }
    try {
      setInvoices((await getInvoices()).items);
      setInvoicesUnavailable(false);
    } catch {
      // Billing not configured yet (no STRIPE_SECRET_KEY) — degrade gracefully,
      // current plan/usage above still works without Stripe.
      setInvoicesUnavailable(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") setNotice("Subscription updated — thanks!");
    else if (checkout === "cancelled") setNotice("Checkout was cancelled — no changes were made.");
  }, [searchParams]);

  async function handleSubscribe(tier: OrganizationTier) {
    setActionError(null);
    setActionBusy(tier);
    try {
      const { checkout_url } = await createCheckout({ tier });
      window.location.href = checkout_url;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to start checkout");
      setActionBusy(null);
    }
  }

  async function handleManageBilling() {
    setActionError(null);
    setActionBusy("portal");
    try {
      const { portal_url } = await createPortalSession();
      window.location.href = portal_url;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to open billing portal");
      setActionBusy(null);
    }
  }

  const usagePercent =
    status && status.max_strategies
      ? Math.min(100, (status.active_strategy_count / status.max_strategies) * 100)
      : 0;

  const cardClass = "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#8E88C7]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-60 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* HEADER */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
              <Sparkles className="h-3.5 w-3.5 text-[#8E88C7]" />
              Quantix Intelligence • Subscription Management
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
              Billing & Plans
            </h1>

            <p className="mt-1 text-xs text-[#9A9DA8]">
              Manage organization tier subscriptions, resource allocations, and live Stripe invoices.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {status && (
              <Badge variant="secondary" className="rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/10 px-3 py-1 font-mono text-xs font-semibold text-[#8E88C7]">
                {TIER_LABELS[status.tier]}
              </Badge>
            )}
            {status?.subscription_status && (
              <Badge
                variant={status.subscription_status === "active" ? "success" : "destructive"}
                className={`rounded-xl px-3 py-1 font-mono text-xs font-semibold ${
                  status.subscription_status === "active"
                    ? "border border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                    : "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                }`}
              >
                {SUBSCRIPTION_STATUS_LABELS[status.subscription_status]}
              </Badge>
            )}
          </div>
        </div>

        {/* NOTICES & ERRORS */}
        {notice && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#34D399]/30 bg-[#34D399]/10 p-4 text-xs font-medium text-[#34D399] shadow-lg backdrop-blur-md">
            <Check className="h-4 w-4 shrink-0 text-[#34D399]" />
            <p>{notice}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#F87171]/30 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#F87171]" />
            <p>{error}</p>
          </div>
        )}
        {actionError && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#F87171]/30 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#F87171]" />
            <p>{actionError}</p>
          </div>
        )}

        {/* CURRENT PLAN & USAGE OVERVIEW */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* CURRENT PLAN CARD */}
          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader className="border-b border-white/[0.06] p-5">
              <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                Current Subscription
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs text-[#808495]">
                {status?.cancel_at_period_end
                  ? `Cancels on ${formatDate(status.current_period_end)}`
                  : status?.current_period_end
                    ? `Renews on ${formatDate(status.current_period_end)}`
                    : "No active subscription — you're on the free Starter tier."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <Button
                size="sm"
                onClick={handleManageBilling}
                disabled={actionBusy !== null}
                className="h-10 rounded-xl bg-[#8E88C7] px-4 font-semibold text-white shadow-lg hover:bg-[#8E88C7]/90"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {actionBusy === "portal" ? "Opening Portal..." : "Manage Billing & Payment"}
              </Button>
            </CardContent>
          </Card>

          {/* USAGE METRICS CARD */}
          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader className="border-b border-white/[0.06] p-5">
              <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                Resource Capacity & Usage
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs text-[#808495]">
                Active strategies vs. allocated tier allowance
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {status && (
                <div>
                  <div className="mb-2 flex items-center justify-between font-mono text-xs">
                    <span className="text-[#808495]">Active Strategies</span>
                    <span className="font-semibold text-[#F5F5F7]">
                      {status.active_strategy_count} / {status.max_strategies ?? "∞"}
                    </span>
                  </div>
                  <Progress
                    value={status.max_strategies ? usagePercent : 0}
                    className="h-2 rounded-full bg-[#07080B]"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* TIERS AND PRICING */}
        <Card
          className={cardClass}
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <CardHeader className="border-b border-white/[0.06] p-5">
            <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
              Available Plans
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-[#808495]">
              Upgrade or downgrade at any time via Stripe Checkout.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
            {PLAN_CARDS.map((plan) => {
              const isCurrent = status?.tier === plan.tier;
              return (
                <div
                  key={plan.tier}
                  className={`flex flex-col justify-between rounded-xl border p-5 transition-colors ${
                    isCurrent
                      ? "border-[#8E88C7]/50 bg-[#8E88C7]/[0.08]"
                      : "border-white/[0.08] bg-[#0F1117]/80"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#F5F5F7]">
                        {TIER_LABELS[plan.tier]}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full border border-[#8E88C7]/30 bg-[#8E88C7]/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-[#8E88C7]">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-[#F5F5F7]">{plan.price}</p>
                    <p className="mt-1 text-xs text-[#9A9DA8]">{plan.blurb}</p>
                  </div>

                  <div className="mt-6">
                    {plan.tier === "enterprise" ? (
                      <a
                        href="mailto:sales@stellixlabs.com"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-10 w-full rounded-xl border-white/10 bg-transparent text-xs font-semibold text-[#F5F5F7] hover:bg-white/[0.05]"
                        )}
                      >
                        Contact Sales
                      </a>
                    ) : (
                      <Button
                        variant={isCurrent ? "outline" : "default"}
                        size="sm"
                        className={`h-10 w-full rounded-xl text-xs font-semibold ${
                          isCurrent
                            ? "border-white/10 bg-transparent text-[#808495]"
                            : "bg-[#8E88C7] text-white shadow-lg hover:bg-[#8E88C7]/90"
                        }`}
                        disabled={isCurrent || actionBusy !== null}
                        onClick={() => handleSubscribe(plan.tier)}
                      >
                        {isCurrent ? "Current Plan" : actionBusy === plan.tier ? "Redirecting..." : "Subscribe"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* INVOICE HISTORY */}
        <Card
          className={cardClass}
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <CardHeader className="border-b border-white/[0.06] p-5">
            <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
              Invoice History
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-[#808495]">
              Pulled live from Stripe.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invoicesUnavailable ? (
              <p className="p-5 text-xs text-[#808495]">
                Billing isn&apos;t configured yet — invoice history will appear here once configured.
              </p>
            ) : !invoices || invoices.length === 0 ? (
              <p className="p-5 text-xs text-[#808495]">No invoices recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.06] bg-[#0F1117]/40 font-mono text-[10px] uppercase tracking-wider text-[#808495]">
                      <TableHead className="px-5 py-3">Date</TableHead>
                      <TableHead className="px-5 py-3">Amount</TableHead>
                      <TableHead className="px-5 py-3">Status</TableHead>
                      <TableHead className="px-5 py-3" />
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-white/[0.04]">
                    {invoices.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-white/[0.02]">
                        <TableCell className="px-5 py-3.5 font-mono text-[#F5F5F7]">{formatDate(inv.created)}</TableCell>
                        <TableCell className="px-5 py-3.5 font-mono text-[#F5F5F7]">{formatCurrency(inv.amount_paid || inv.amount_due, inv.currency)}</TableCell>
                        <TableCell className="px-5 py-3.5 capitalize font-mono text-[#9A9DA8]">{inv.status ?? "—"}</TableCell>
                        <TableCell className="px-5 py-3.5 text-right">
                          {inv.hosted_invoice_url && (
                            <a
                              href={inv.hosted_invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-medium text-[#8E88C7] transition-colors hover:bg-white/[0.08] hover:text-[#F5F5F7]"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPageContent />
    </Suspense>
  );
}