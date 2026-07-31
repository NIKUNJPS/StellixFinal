"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { REGIME_COLORS, type RegimeLabel } from "@/lib/regime-types";
import { listStrategies } from "@/lib/strategy";
import { STATUS_COLORS, type StrategyListItem, type StrategyStatus } from "@/lib/strategy-types";

type SortKey = "name" | "robustness_score" | "created_at";

function robustnessColor(v: number | null): string {
  if (v === null) return "#64748b";
  if (v >= 0.7) return "#16a34a";
  if (v >= 0.4) return "#f59e0b";
  return "#dc2626";
}

export default function StrategyExplorerPage() {
  const [rows, setRows] = useState<StrategyListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StrategyStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    listStrategies()
      .then((data) => setRows(data.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const view = useMemo(() => {
    let items = rows;
    if (statusFilter !== "all") items = items.filter((r) => r.status === statusFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "robustness_score") return ((a.robustness_score ?? -1) - (b.robustness_score ?? -1)) * dir;
      return (+new Date(a.created_at) - +new Date(b.created_at)) * dir;
    });
  }, [rows, statusFilter, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Strategy Explorer</CardTitle>
              <CardDescription>All strategies in your organization.</CardDescription>
            </div>
            <Link
              href="/admin/strategies/new"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + New strategy
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Status</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StrategyStatus | "all")}
            >
              {["all", "draft", "candidate", "active", "failed", "retired"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : view.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">No strategies yet — build your first.</p>
              <Link
                href="/admin/strategies/new"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Build a strategy →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="strategy-table">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <Th onClick={() => sortBy("name")}>Name</Th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Version</th>
                    <Th onClick={() => sortBy("robustness_score")}>Robustness</Th>
                    <th className="px-3 py-2">Regime compatibility</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/admin/strategies/${s.id}/validation`}
                          className="hover:text-stellix-highlight hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge style={{ background: STATUS_COLORS[s.status], color: "white" }}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{s.version}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold" style={{ color: robustnessColor(s.robustness_score) }}>
                          {s.robustness_score === null ? "—" : s.robustness_score.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {s.regime_compatibility
                            ? Object.entries(s.regime_compatibility).map(([regime, sharpe]) => (
                                <span
                                  key={regime}
                                  title={`Sharpe ${sharpe === null ? "n/a" : sharpe.toFixed(2)}`}
                                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                                  style={{ background: REGIME_COLORS[regime as RegimeLabel] ?? "#64748b" }}
                                >
                                  {regime}
                                </span>
                              ))
                            : <span className="text-xs text-muted-foreground">not backtested</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th className="cursor-pointer px-3 py-2 hover:text-foreground" onClick={onClick}>
      {children} ↕
    </th>
  );
}
