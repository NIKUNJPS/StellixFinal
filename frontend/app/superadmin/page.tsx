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
  trendColor = "text-[#F4D47C]",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  trendColor?: string;
}) {
  return (
    <Card className="border border-[#E4EEF0]/10 bg-[#042F34]/50 shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-200 hover:border-[#FF5B04]/40 hover:bg-[#042F34]/80">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-[#E4EEF0]/70">
            {label}
          </p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4EEF0]/10 bg-[#16232B] text-[#FF5B04]">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-white">{value}</p>
        {hint && (
          <p className={`mt-1.5 flex items-center gap-1.5 font-mono text-xs ${trendColor}`}>
            <span>{hint}</span>
          </p>
        )}
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-[#FFFFFF]">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col gap-1 border-b border-[#E4EEF0]/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Command Center
          </h1>
          <p className="mt-1 text-sm text-[#E4EEF0]/70">
            Platform-wide telemetry and multi-tenant operational status.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <span className="flex items-center gap-1.5 rounded-full border border-[#FF5B04]/30 bg-[#FF5B04]/10 px-3 py-1 font-mono text-xs text-[#FF5B04]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF5B04]" />
            Live Metrics
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
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
              trendColor="text-[#F4D47C]"
            />
            <Metric
              label="Total Users"
              value={String(stats.total_users)}
              icon={Users}
              hint="Cross-tenant access"
              trendColor="text-[#E4EEF0]/60"
            />
            <Metric
              label="Monthly Recurring Rev"
              value={money(stats.mrr_usd)}
              icon={DollarSign}
              hint={stats.mrr_is_list_price ? "List price (no live billing key)" : undefined}
              trendColor="text-[#F4D47C]"
            />
            <Metric
              label="Pending Demo Leads"
              value={pendingDemos === null ? "—" : String(pendingDemos)}
              icon={Inbox}
              hint={pendingDemos && pendingDemos > 0 ? "Awaiting review" : "Inbox clear"}
              trendColor={pendingDemos && pendingDemos > 0 ? "text-[#FF5B04]" : "text-[#F4D47C]"}
            />
          </div>

          {/* Detailed Cards Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Organizations Breakdown */}
            <Card className="border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-lg shadow-black/20 backdrop-blur-md">
              <CardHeader className="border-b border-[#E4EEF0]/10 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-white">
                    Organizations by Status
                  </CardTitle>
                  <Building2 className="h-4 w-4 text-[#F4D47C]" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {STATUS_ORDER.map((s) => {
                  const count = stats.orgs_by_status[s] ?? 0;
                  const pct = stats.total_orgs ? (count / stats.total_orgs) * 100 : 0;
                  const isProblematic = s === "suspended" || s === "terminated";
                  const isPending = s === "pending_approval";

                  return (
                    <div key={s} className="space-y-1.5">
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="text-[#E4EEF0]/80">{STATUS_LABEL[s]}</span>
                        <span className="font-semibold text-white">
                          {count}{" "}
                          <span className="font-normal text-[#E4EEF0]/50">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#16232B]">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isProblematic
                              ? "bg-[#FF5B04]"
                              : isPending
                              ? "bg-[#F4D47C]"
                              : "bg-[#042F34] brightness-150"
                          }`}
                          style={{
                            width: `${pct}%`,
                            backgroundColor: !isProblematic && !isPending ? "#F4D47C" : undefined,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Platform Activity Overview */}
            <Card className="border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-lg shadow-black/20 backdrop-blur-md">
              <CardHeader className="border-b border-[#E4EEF0]/10 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-white">
                    Platform Activity & Compute
                  </CardTitle>
                  <Activity className="h-4 w-4 text-[#FF5B04]" />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 pt-5">
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
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
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
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-sm text-[#E4EEF0]/70">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
            <span className="font-mono">Loading Command Center data...</span>
          </div>
        </div>
      )}

      {/* Footer Info Notice */}
      <div className="flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#16232B]/60 px-4 py-3 font-mono text-xs text-[#E4EEF0]/70">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#F4D47C]" />
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
    <div className="rounded-lg border border-[#E4EEF0]/10 bg-[#16232B]/70 p-3.5 transition-colors hover:border-[#E4EEF0]/20">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[#E4EEF0]/60">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${highlight ? "text-[#FF5B04]" : "text-[#F4D47C]"}`} />
      </div>
      <p className={`mt-2 font-mono text-xl font-bold ${highlight ? "text-[#F4D47C]" : "text-white"}`}>
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
      className="group inline-flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/70 px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:border-[#FF5B04]/50 hover:bg-[#042F34] hover:text-[#F4D47C] hover:shadow-md hover:shadow-black/30"
    >
      <Icon className="h-4 w-4 text-[#FF5B04] transition-colors group-hover:text-[#F4D47C]" />
      <span>{children}</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-[#E4EEF0]/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#F4D47C]" />
    </Link>
  );
}