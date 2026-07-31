"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Building2, DollarSign, Inbox, Users } from "lucide-react";

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
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-crimson" />
        </div>
        <p className="mt-2 text-3xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide health across every organization.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Organizations" value={String(stats.total_orgs)} icon={Building2} hint={`${stats.new_orgs_30d} new in 30d`} />
            <Metric label="Users" value={String(stats.total_users)} icon={Users} />
            <Metric
              label="MRR"
              value={money(stats.mrr_usd)}
              icon={DollarSign}
              hint={stats.mrr_is_list_price ? "list price (billing not keyed)" : undefined}
            />
            <Metric
              label="Pending demos"
              value={pendingDemos === null ? "—" : String(pendingDemos)}
              icon={Inbox}
              hint="awaiting review"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organizations by status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {STATUS_ORDER.map((s) => {
                  const count = stats.orgs_by_status[s] ?? 0;
                  const pct = stats.total_orgs ? (count / stats.total_orgs) * 100 : 0;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-muted-foreground">{STATUS_LABEL[s]}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={s === "suspended" || s === "terminated" ? "h-full bg-crimson" : "h-full bg-stellix-highlight"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-medium">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform activity</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <Stat label="Strategies" value={stats.total_strategies} />
                <Stat label="Backtested strategies" value={stats.total_backtests} />
                <Stat label="LLM calls" value={stats.total_llm_calls} />
                <Stat label="LLM cost (all-time)" value={money(stats.total_llm_cost_usd)} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <QuickLink href="/superadmin/companies" icon={Building2}>Manage companies</QuickLink>
            <QuickLink href="/superadmin/demo-requests" icon={Inbox}>Review demo requests</QuickLink>
            <QuickLink href="/superadmin/analytics" icon={DollarSign}>Revenue &amp; usage</QuickLink>
          </div>
        </>
      )}

      {!stats && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Revenue is list-price MRR from active plans — no live billing integration in this deployment.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
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
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:border-crimson/50 hover:text-crimson"
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
