"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/components/superadmin/shared";
import { getRevenueBreakdown, getUsageByOrg } from "@/lib/superadmin";
import type { RevenueBreakdown, UsageResponse } from "@/lib/superadmin-types";

export default function AnalyticsPage() {
  const [revenue, setRevenue] = useState<RevenueBreakdown | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRevenueBreakdown().then(setRevenue).catch((e) => setError(e.message));
    getUsageByOrg().then(setUsage).catch((e) => setError(e.message));
  }, []);

  const totalMrr = revenue?.by_plan.reduce((s, p) => s + p.mrr_usd, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Revenue by plan and per-org LLM cost (the margin check).</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue by plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Active orgs</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenue?.by_plan.map((p) => (
                <TableRow key={p.plan}>
                  <TableCell className="capitalize font-medium">{p.plan}</TableCell>
                  <TableCell className="text-right">{p.org_count}</TableCell>
                  <TableCell className="text-right">{money(p.mrr_usd)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold">{money(totalMrr)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {revenue?.mrr_is_list_price && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              List-price MRR from active plans — not billed revenue (no Stripe key in this deployment).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-org LLM cost this month</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">LLM cost</TableHead>
                <TableHead className="text-right">Est. margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage?.items.map((r) => {
                const margin = r.monthly_revenue_usd - r.llm_cost_this_month;
                return (
                  <TableRow key={r.organization_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="capitalize">{r.plan}</TableCell>
                    <TableCell className="text-right">{money(r.monthly_revenue_usd)}</TableCell>
                    <TableCell className="text-right">{money(r.llm_cost_this_month)}</TableCell>
                    <TableCell className={"text-right " + (margin < 0 ? "text-crimson" : "text-foreground")}>
                      {money(margin)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {usage && usage.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No usage yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Margin = list-price revenue − LLM cost. Directional only; excludes infra/COGS.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
