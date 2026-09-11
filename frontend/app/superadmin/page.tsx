"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  DollarSign,
  Inbox,
  Users,
  Activity,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  ShieldAlert,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformStats, listDemoRequests } from "@/lib/superadmin";
import type { PlatformStats } from "@/lib/superadmin-types";

const STATUS_ORDER = ["pending_approval", "active", "suspended", "terminated"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Metric({
  label,
  value,
  icon: Icon,
  hint,
  trendColor = "text-[#8E88C7]",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  trendColor?: string;
}) {
  return (
    <Card
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18]"
      style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
    >
      <div className="pointer-events-none absolute -top-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-[#8E88C7]/20 opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50" />
      <CardContent className="flex min-h-[125px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
            {label}
          </p>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/15 text-[#8E88C7] transition-transform duration-300 group-hover:scale-110">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div>
          <p className="truncate font-mono text-2xl font-bold tracking-tight text-[#F5F5F7] sm:text-3xl">{value}</p>
          {hint && (
            <p className={`mt-1 truncate font-mono text-[11px] ${trendColor}`}>
              <span>{hint}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SuperadminHome() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [pendingDemos, setPendingDemos] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformStats().then(setStats).catch((e) => setError(e.message));
    listDemoRequests()
      .then((inbox) => setPendingDemos(inbox.pending.length))
      .catch(() => setPendingDemos(null));
  }, []);

  const cardClass =
    "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300";

  return (
    <div className="relative mx-auto max-w-6xl space-y-6 text-[#F5F5F7]">
      {/* Ambient Background Glow Orbs */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {/* Page Title & Subtitle */}
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
            Command Center
          </h1>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Platform-wide telemetry and multi-tenant operational status.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#8E88C7]" />
            <span className="text-[#8E88C7]">Live Metrics</span>
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

      {stats && (
        <>
          {/* Top Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Organizations"
              value={String(stats.total_orgs)}
              icon={Building2}
              hint={`+${stats.new_orgs_30d} new in 30d`}
              trendColor="text-[#8E88C7]"
            />
            <Metric
              label="Total Users"
              value={String(stats.total_users)}
              icon={Users}
              hint="Cross-tenant access"
              trendColor="text-[#9A9DA8]"
            />
            <Metric
              label="Monthly Recurring Rev"
              value={money(stats.mrr_usd)}
              icon={DollarSign}
              hint={stats.mrr_is_list_price ? "List price (no live billing key)" : undefined}
              trendColor="text-[#34D399]"
            />
            <Metric
              label="Pending Demo Leads"
              value={pendingDemos === null ? "—" : String(pendingDemos)}
              icon={Inbox}
              hint={pendingDemos && pendingDemos > 0 ? "Awaiting review" : "Inbox clear"}
              trendColor={pendingDemos && pendingDemos > 0 ? "text-[#F87171]" : "text-[#8E88C7]"}
            />
          </div>

          {/* Detailed Cards Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Organizations Breakdown */}
            <Card className={cardClass} style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}>
              <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Organizations by Status
                  </CardTitle>
                  <Building2 className="h-4 w-4 text-[#8E88C7]" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                {STATUS_ORDER.map((s) => {
                  const count = stats.orgs_by_status[s] ?? 0;
                  const pct = stats.total_orgs ? (count / stats.total_orgs) * 100 : 0;
                  const isProblematic = s === "suspended" || s === "terminated";
                  const isPending = s === "pending_approval";

                  return (
                    <div key={s} className="space-y-1.5">
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="text-[#9A9DA8]">{STATUS_LABEL[s]}</span>
                        <span className="font-semibold text-[#F5F5F7]">
                          {count}{" "}
                          <span className="font-normal text-[#808495]">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06] p-[1px]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${
                            isProblematic
                              ? "bg-[#F87171] shadow-[0_0_10px_rgba(248,113,113,0.6)]"
                              : isPending
                              ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                              : "bg-gradient-to-r from-[#6F6B9B] to-[#8E88C7] shadow-[0_0_8px_rgba(142,136,199,0.5)]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Platform Activity Overview */}
            <Card className={cardClass} style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}>
              <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Platform Activity & Compute
                  </CardTitle>
                  <Activity className="h-4 w-4 text-[#8E88C7]" />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 p-6">
                <Stat
                  label="Total Strategies"
                  value={stats.total_strategies}
                  icon={TrendingUp}
                />
                <Stat
                  label="Backtest Runs"
                  value={stats.total_backtests}
                  icon={Activity}
                />
                <Stat
                  label="LLM Invocations"
                  value={stats.total_llm_calls}
                  icon={Cpu}
                />
                <Stat
                  label="LLM Cost (All-Time)"
                  value={money(stats.total_llm_cost_usd)}
                  icon={DollarSign}
                  highlight
                />
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions Bar */}
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-wider text-[#808495]">
              Operational Shortcuts
            </p>
            <div className="flex flex-wrap gap-3">
              <QuickLink href="/superadmin/companies" icon={Building2}>
                Manage Companies
              </QuickLink>
              <QuickLink href="/superadmin/demo-requests" icon={Inbox}>
                Review Demo Requests
              </QuickLink>
              <QuickLink href="/superadmin/analytics" icon={DollarSign}>
                Revenue & Usage Telemetry
              </QuickLink>
            </div>
          </div>
        </>
      )}

      {!stats && !error && (
        <div className="flex items-center justify-center py-24 text-[#F5F5F7]">
          <div className="flex items-center gap-3 text-sm text-[#9A9DA8]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
            <span className="font-mono text-xs">Loading Command Center data...</span>
          </div>
        </div>
      )}

      {/* Footer Info Notice */}
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0D0F14]/70 px-4 py-3 font-mono text-xs text-[#9A9DA8] backdrop-blur-md">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#8E88C7]" />
        <span>
          Revenue reflects list-price MRR computed from active subscription tiers.
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#0F1115]/60 p-4 transition-all duration-300 hover:border-white/[0.14] hover:bg-[#14161B]/80"
      style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04)" }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[#808495]">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${highlight ? "text-[#34D399]" : "text-[#8E88C7]"}`} />
      </div>
      <p className={`mt-2 font-mono text-xl font-bold tracking-tight ${highlight ? "text-[#34D399]" : "text-[#F5F5F7]"}`}>
        {value}
      </p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0D0F14]/70 px-4 py-2.5 font-mono text-xs font-semibold text-[#F5F5F7] backdrop-blur-md transition-all duration-200 hover:border-[#8E88C7]/40 hover:bg-[#14161B] hover:text-[#8E88C7] hover:shadow-lg hover:shadow-black/40 active:scale-95"
      style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)" }}
    >
      <Icon className="h-4 w-4 text-[#8E88C7] transition-colors group-hover:text-[#8E88C7]" />
      <span>{children}</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#808495] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#8E88C7]" />
    </Link>
  );
}