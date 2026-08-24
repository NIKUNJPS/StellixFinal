"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Cpu,
  Layers,
  ShieldAlert,
  Percent,
} from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getRevenueBreakdown().then(setRevenue),
      getUsageByOrg().then(setUsage),
    ])
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  const totalMrr = revenue?.by_plan.reduce((s, p) => s + p.mrr_usd, 0) ?? 0;
  const totalLlmCost = usage?.items.reduce((s, r) => s + r.llm_cost_this_month, 0) ?? 0;
  const overallMargin = totalMrr - totalLlmCost;

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-[#E4EEF0]/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Analytics & Unit Economics
          </h1>
          <p className="mt-1 text-sm text-[#E4EEF0]/70">
            Revenue breakdown by tier, compute consumption, and per-tenant gross margin checks.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div className="flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/50 px-3 py-1.5 font-mono text-xs text-[#E4EEF0]/80">
            <TrendingUp className="h-3.5 w-3.5 text-[#F4D47C]" />
            <span>Platform MRR: {money(totalMrr)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Stat Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#E4EEF0]/10 bg-[#042F34]/50 p-4 shadow-lg shadow-black/20 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">Total Plan MRR</p>
            <DollarSign className="h-4 w-4 text-[#F4D47C]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-white">{money(totalMrr)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#E4EEF0]/50">Active subscription value</p>
        </div>

        <div className="rounded-xl border border-[#E4EEF0]/10 bg-[#042F34]/50 p-4 shadow-lg shadow-black/20 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">LLM Inference Cost (Mo)</p>
            <Cpu className="h-4 w-4 text-[#FF5B04]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#FF5B04]">{money(totalLlmCost)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#E4EEF0]/50">Aggregated tenant usage</p>
        </div>

        <div className="rounded-xl border border-[#E4EEF0]/10 bg-[#042F34]/50 p-4 shadow-lg shadow-black/20 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">Gross Margin Estimate</p>
            <Percent className="h-4 w-4 text-[#F4D47C]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#F4D47C]">{money(overallMargin)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#E4EEF0]/50">MRR − Token compute</p>
        </div>
      </div>

      {/* Revenue by Plan Table Card */}
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-4 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <Layers className="h-4 w-4 text-[#F4D47C]" />
              <span>Revenue by Plan Tier</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/40">
              <TableRow className="border-b border-[#E4EEF0]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Plan Tier
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Active Organizations
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Aggregated MRR
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenue?.by_plan.map((p) => (
                <TableRow
                  key={p.plan}
                  className="border-b border-[#E4EEF0]/5 transition-colors hover:bg-[#16232B]/50"
                >
                  <TableCell className="py-3.5 font-mono text-xs capitalize font-medium text-white">
                    {p.plan}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-xs text-[#E4EEF0]/80">
                    {p.org_count}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm font-semibold text-[#F4D47C]">
                    {money(p.mrr_usd)}
                  </TableCell>
                </TableRow>
              ))}

              {revenue && (
                <TableRow className="border-t border-[#E4EEF0]/15 bg-[#16232B]/60 font-semibold hover:bg-[#16232B]/60">
                  <TableCell className="py-3.5 font-mono text-xs uppercase tracking-wider text-white">
                    Total
                  </TableCell>
                  <TableCell />
                  <TableCell className="py-3.5 text-right font-mono text-sm text-[#F4D47C]">
                    {money(totalMrr)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {revenue?.mrr_is_list_price && (
            <div className="flex items-center gap-2 border-t border-[#E4EEF0]/10 bg-[#16232B]/40 p-4 font-mono text-xs text-[#E4EEF0]/60">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#F4D47C]" />
              <span>List-price MRR computed from active subscription plans (live billing key unconfigured in this cluster).</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Org LLM Cost and Margin Table */}
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-4 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <Cpu className="h-4 w-4 text-[#FF5B04]" />
              <span>Per-Organization LLM Cost (Current Month)</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/40">
              <TableRow className="border-b border-[#E4EEF0]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Organization
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Plan Tier
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Monthly Revenue
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  LLM Cost
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Est. Margin
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage?.items.map((r) => {
                const margin = r.monthly_revenue_usd - r.llm_cost_this_month;
                const isNegative = margin < 0;

                return (
                  <TableRow
                    key={r.organization_id}
                    className="border-b border-[#E4EEF0]/5 transition-colors hover:bg-[#16232B]/50"
                  >
                    <TableCell className="py-3.5 font-mono text-xs font-medium text-white">
                      {r.name}
                    </TableCell>
                    <TableCell className="py-3.5 font-mono text-xs capitalize text-[#E4EEF0]/80">
                      {r.plan}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-xs text-white">
                      {money(r.monthly_revenue_usd)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-xs text-[#FF5B04]">
                      {money(r.llm_cost_this_month)}
                    </TableCell>
                    <TableCell
                      className={`py-3.5 text-right font-mono text-xs font-semibold ${
                        isNegative ? "text-[#FF5B04]" : "text-[#F4D47C]"
                      }`}
                    >
                      {money(margin)}
                    </TableCell>
                  </TableRow>
                );
              })}

              {usage && usage.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center font-mono text-xs text-[#E4EEF0]/50">
                    No active usage recorded for this billing cycle.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-[#E4EEF0]/70">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
                      <span className="font-mono">Computing telemetry & margins...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="border-t border-[#E4EEF0]/10 bg-[#16232B]/40 p-4 font-mono text-xs text-[#E4EEF0]/50">
            Estimated Gross Margin = List-Price Revenue − Direct LLM API Invocations. Excludes server compute, database clusters, and underlying bandwidth costs.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}