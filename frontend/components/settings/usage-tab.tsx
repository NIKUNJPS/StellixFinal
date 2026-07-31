"use client";

import { useEffect, useState } from "react";
import { Info, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRateLimitUsage } from "@/lib/usage";
import type { RateLimitUsage } from "@/lib/usage-types";
import { cn } from "@/lib/utils";

function barColor(pct: number): string {
  if (pct > 95) return "bg-red-500";
  if (pct > 80) return "bg-orange-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-emerald-500";
}

function humanWindow(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function humanResets(seconds: number): string {
  if (seconds <= 0) return "full";
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export function UsageTab() {
  const [usage, setUsage] = useState<RateLimitUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRateLimitUsage()
      .then(setUsage)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load usage"));
  }, []);

  if (error) {
    return (
      <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!usage) return <p className="text-sm text-muted-foreground">Loading usage…</p>;

  const categories = Object.entries(usage.endpoints);
  const nearLimit = categories.some(([, c]) => c.limit > 0 && c.used / c.limit > 0.8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API usage</CardTitle>
        <CardDescription>
          Current rate-limit consumption for your organization.{" "}
          {usage.tier && (
            <span className="capitalize">
              Plan: <Badge variant="secondary">{usage.tier}</Badge>
            </span>
          )}
          {usage.rate_multiplier > 1 && (
            <span className="ml-2 text-emerald-500">×{usage.rate_multiplier} tier boost</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {nearLimit && (
          <div className="flex items-center gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-500">
            <TrendingUp className="h-4 w-4 shrink-0" />
            You&apos;re approaching a rate limit. Consider upgrading your plan for higher limits.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {categories.map(([name, c]) => {
            const pct = c.limit > 0 ? Math.min(100, (c.used / c.limit) * 100) : 0;
            return (
              <div key={name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">
                    {c.used} / {c.limit} per {humanWindow(c.window_seconds)}
                    {c.used > 0 && ` · resets in ${humanResets(c.resets_in_seconds)}`}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor(pct))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {usage.llm_budget ? (
          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">LLM monthly budget</span>
              <span className="text-muted-foreground">
                ${usage.llm_budget.used_this_month_usd.toFixed(2)} / $
                {usage.llm_budget.monthly_limit_usd.toFixed(0)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full", barColor(usage.llm_budget.pct_used))}
                style={{ width: `${Math.min(100, usage.llm_budget.pct_used)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            LLM calls are metered by the hourly rate limit above. There is no separate
            monthly dollar budget on this plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
