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
  ArrowUpRight,
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

  const cardClass =
    "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300";

  return (
    <div className="relative mx-auto max-w-5xl space-y-6 text-[#F5F5F7] px-2 py-4">
      {/* Ambient Background Glow Orbs */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8E88C7] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8E88C7]" />
            </span>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              Quantix Intelligence • Control Plane
            </p>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#F5F5F7] sm:text-3xl">
            Analytics & Unit Economics
          </h1>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Revenue breakdown by tier, compute consumption, and per-tenant gross margin checks.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <TrendingUp className="h-3.5 w-3.5 text-[#8E88C7]" />
            <span>Platform MRR: {money(totalMrr)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2.5 rounded-2xl border p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.08)",
            borderColor: "rgba(248, 113, 113, 0.25)",
          }}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Stat Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18]"
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <div className="pointer-events-none absolute -top-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-[#8E88C7]/20 opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50" />
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">Total Plan MRR</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#8E88C7]/15 text-[#8E88C7] border border-[#8E88C7]/30">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-[#F5F5F7]">{money(totalMrr)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#9A9DA8]">Active subscription value</p>
        </div>

        <div
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18]"
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <div className="pointer-events-none absolute -top-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-[#F87171]/20 opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50" />
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">LLM Inference Cost (Mo)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F87171]/15 text-[#F87171] border border-[#F87171]/30">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-[#F87171]">{money(totalLlmCost)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#9A9DA8]">Aggregated tenant usage</p>
        </div>

        <div
          className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18]"
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <div className="pointer-events-none absolute -top-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-[#34D399]/20 opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50" />
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">Gross Margin Estimate</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399] border border-[#34D399]/30">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-[#34D399]">{money(overallMargin)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#9A9DA8]">MRR − Token compute</p>
        </div>
      </div>

      {/* Revenue by Plan Table Card */}
      <Card className={cardClass} style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#F5F5F7]">
            <Layers className="h-4 w-4 text-[#8E88C7]" />
            <span>Revenue by Plan Tier</span>
          </CardTitle>
          <ArrowUpRight className="h-4 w-4 text-[#808495]" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-white/[0.06] bg-[#0F1115]/40">
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Plan Tier
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Active Organizations
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Aggregated MRR
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenue?.by_plan.map((p) => (
                <TableRow
                  key={p.plan}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <TableCell className="py-3.5 font-mono text-xs capitalize font-medium text-[#F5F5F7]">
                    {p.plan}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-xs text-[#9A9DA8]">
                    {p.org_count}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm font-semibold text-[#8E88C7]">
                    {money(p.mrr_usd)}
                  </TableCell>
                </TableRow>
              ))}

              {revenue && (
                <TableRow className="border-t border-white/[0.1] bg-[#0F1115]/60 font-semibold hover:bg-[#0F1115]/60">
                  <TableCell className="py-3.5 font-mono text-xs uppercase tracking-wider text-[#F5F5F7]">
                    Total
                  </TableCell>
                  <TableCell />
                  <TableCell className="py-3.5 text-right font-mono text-sm text-[#8E88C7]">
                    {money(totalMrr)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {revenue?.mrr_is_list_price && (
            <div className="flex items-center gap-2 border-t border-white/[0.06] bg-[#0F1115]/40 p-4 font-mono text-xs text-[#9A9DA8]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#8E88C7]" />
              <span>List-price MRR computed from active subscription plans (live billing key unconfigured in this cluster).</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Org LLM Cost and Margin Table */}
      <Card className={cardClass} style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#F5F5F7]">
            <Cpu className="h-4 w-4 text-[#F87171]" />
            <span>Per-Organization LLM Cost (Current Month)</span>
          </CardTitle>
          <ArrowUpRight className="h-4 w-4 text-[#808495]" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-white/[0.06] bg-[#0F1115]/40">
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Organization
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Plan Tier
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Monthly Revenue
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  LLM Cost
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
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
                    className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                  >
                    <TableCell className="py-3.5 font-mono text-xs font-medium text-[#F5F5F7]">
                      {r.name}
                    </TableCell>
                    <TableCell className="py-3.5 font-mono text-xs capitalize text-[#9A9DA8]">
                      {r.plan}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-xs text-[#F5F5F7]">
                      {money(r.monthly_revenue_usd)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-xs text-[#F87171]">
                      {money(r.llm_cost_this_month)}
                    </TableCell>
                    <TableCell
                      className={`py-3.5 text-right font-mono text-xs font-semibold ${
                        isNegative ? "text-[#F87171]" : "text-[#34D399]"
                      }`}
                    >
                      {money(margin)}
                    </TableCell>
                  </TableRow>
                );
              })}

              {usage && usage.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center font-mono text-xs text-[#808495]">
                    No active usage recorded for this billing cycle.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-xs text-[#9A9DA8]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
                      <span className="font-mono">Computing telemetry & margins...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="border-t border-white/[0.06] bg-[#0F1115]/40 p-4 font-mono text-xs text-[#808495]">
            Estimated Gross Margin = List-Price Revenue − Direct LLM API Invocations. Excludes server compute, database clusters, and underlying bandwidth costs.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}