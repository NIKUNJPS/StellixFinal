"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCheckout, createPortalSession, getBillingStatus, getInvoices } from "@/lib/billing";
import {
  SUBSCRIPTION_STATUS_LABELS,
  TIER_LABELS,
  type BillingStatusResponse,
  type InvoiceItem,
} from "@/lib/billing-types";
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

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Billing</h1>
        {status && <Badge variant="secondary">{TIER_LABELS[status.tier]}</Badge>}
        {status?.subscription_status && (
          <Badge variant={status.subscription_status === "active" ? "success" : "destructive"}>
            {SUBSCRIPTION_STATUS_LABELS[status.subscription_status]}
          </Badge>
        )}
      </div>

      {notice && (
        <p className="mb-4 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-600">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {actionError && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>
              {status?.cancel_at_period_end
                ? `Cancels on ${formatDate(status.current_period_end)}`
                : status?.current_period_end
                  ? `Renews on ${formatDate(status.current_period_end)}`
                  : "No active subscription — you're on the free Starter tier."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={handleManageBilling} disabled={actionBusy !== null}>
              <CreditCard className="mr-2 h-4 w-4" />
              {actionBusy === "portal" ? "Opening..." : "Manage Billing"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Active strategies vs. your plan limit</CardDescription>
          </CardHeader>
          <CardContent>
            {status && (
              <>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Strategies</span>
                  <span className="font-medium">
                    {status.active_strategy_count} / {status.max_strategies ?? "∞"}
                  </span>
                </div>
                <Progress value={status.max_strategies ? usagePercent : 0} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Upgrade or downgrade at any time via Stripe Checkout.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLAN_CARDS.map((plan) => {
            const isCurrent = status?.tier === plan.tier;
            return (
              <div key={plan.tier} className="flex flex-col gap-2 rounded-lg border p-4">
                <p className="font-semibold">{TIER_LABELS[plan.tier]}</p>
                <p className="text-2xl font-bold">{plan.price}</p>
                <p className="text-sm text-muted-foreground">{plan.blurb}</p>
                {plan.tier === "enterprise" ? (
                  <a
                    href="mailto:sales@stellixlabs.com"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
                  >
                    Contact Sales
                  </a>
                ) : (
                  <Button
                    variant={isCurrent ? "outline" : "default"}
                    size="sm"
                    className="mt-2"
                    disabled={isCurrent || actionBusy !== null}
                    onClick={() => handleSubscribe(plan.tier)}
                  >
                    {isCurrent ? "Current Plan" : actionBusy === plan.tier ? "Redirecting..." : "Subscribe"}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>Pulled live from Stripe.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesUnavailable ? (
            <p className="text-sm text-muted-foreground">
              Billing isn&apos;t configured yet — invoice history will appear here once it is.
            </p>
          ) : !invoices || invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{formatDate(inv.created)}</TableCell>
                    <TableCell>{formatCurrency(inv.amount_paid || inv.amount_due, inv.currency)}</TableCell>
                    <TableCell className="capitalize">{inv.status ?? "—"}</TableCell>
                    <TableCell>
                      {inv.hosted_invoice_url && (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPageContent />
    </Suspense>
  );
}
