"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search, Building2, ChevronRight, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, OrgStatusBadge, shortDate } from "@/components/superadmin/shared";
import { listOrgs } from "@/lib/superadmin";
import type { OrgListResponse } from "@/lib/superadmin-types";

const STATUS_FILTERS = ["", "pending_approval", "active", "suspended", "terminated"] as const;
const FILTER_LABEL: Record<string, string> = {
  "": "All",
  pending_approval: "Pending",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
};

export default function CompaniesPage() {
  const [data, setData] = useState<OrgListResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOrgs({
        status: statusFilter || undefined,
        search: search || undefined,
        limit: 100,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="relative mx-auto max-w-6xl space-y-6 text-[#F5F5F7]">
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
            Companies
          </h1>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Tenant organization registry, plan allocations, and live subscription status.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <Building2 className="h-3.5 w-3.5 text-[#8E88C7]" />
            <span>Total: {data?.total ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0D0F14]/70 p-1 backdrop-blur-md">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-all duration-150 ${
                  active
                    ? "border border-white/[0.14] bg-[#1A1D24] text-[#F5F5F7] shadow-sm"
                    : "text-[#9A9DA8] hover:bg-white/[0.04] hover:text-[#F5F5F7]"
                }`}
              >
                {FILTER_LABEL[s]}
              </button>
            );
          })}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <div className="relative">
            <Input
              placeholder="Search by company name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-xl border-white/[0.08] bg-[#0D0F14]/70 text-sm text-[#F5F5F7] placeholder:text-[#666A76] backdrop-blur-md transition-colors focus:border-[#8E88C7]/50 focus:ring-1 focus:ring-[#8E88C7]/50"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="rounded-xl border border-white/[0.08] bg-[#0D0F14]/80 text-[#8E88C7] transition-all hover:border-white/[0.18] hover:bg-[#1A1D24] hover:text-[#F5F5F7] active:scale-95"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
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

      {/* Table Card */}
      <Card
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-white/[0.06] bg-[#0F1115]/80">
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Company
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Plan Tier
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  MRR
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Users
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Strategies
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Provisioned
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((org) => (
                <TableRow
                  key={org.id}
                  className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <TableCell className="py-3.5">
                    <Link
                      href={`/superadmin/companies/${org.id}`}
                      className="group/link flex items-center gap-1.5 font-medium text-[#F5F5F7] transition-colors hover:text-[#8E88C7]"
                    >
                      <span>{org.name}</span>
                      <ChevronRight className="h-3 w-3 text-[#666A76] transition-transform group-hover/link:translate-x-0.5 group-hover/link:text-[#8E88C7]" />
                    </Link>
                    <p className="font-mono text-[11px] text-[#666A76]">{org.slug}</p>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <OrgStatusBadge status={org.status} />
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs capitalize text-[#9A9DA8]">
                    {org.plan}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm font-semibold text-[#34D399]">
                    {money(org.monthly_revenue_usd)}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm font-medium text-[#F5F5F7]">
                    {org.user_count}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm font-medium text-[#F5F5F7]">
                    {org.strategy_count}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#808495]">
                    {shortDate(org.created_at)}
                  </TableCell>
                </TableRow>
              ))}

              {data && data.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center font-mono text-xs text-[#808495]">
                    No organizations match the selected criteria.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs text-[#9A9DA8]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
                      <span className="font-mono">Loading companies...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Footer Meta */}
      {data && !loading && (
        <p className="font-mono text-xs text-[#808495]">
          Displaying {data.items.length} of {data.total} registered organizations.
        </p>
      )}
    </div>
  );
}