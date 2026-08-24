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
      const res = await listOrgs({ status: statusFilter || undefined, search: search || undefined, limit: 100 });
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
    <div className="mx-auto max-w-6xl space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-[#E4EEF0]/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Companies
          </h1>
          <p className="mt-1 text-sm text-[#E4EEF0]/70">
            Tenant organization registry, plan allocations, and live subscription status.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div className="flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/50 px-3 py-1.5 font-mono text-xs text-[#E4EEF0]/80">
            <Building2 className="h-3.5 w-3.5 text-[#F4D47C]" />
            <span>Total: {data?.total ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/30 p-1 backdrop-blur-sm">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-all duration-150 ${
                  active
                    ? "border border-[#FF5B04]/40 bg-[#16232B] text-white shadow-sm"
                    : "text-[#E4EEF0]/60 hover:bg-[#16232B]/50 hover:text-white"
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
              className="w-64 border-[#E4EEF0]/10 bg-[#042F34]/60 text-sm text-white placeholder:text-[#E4EEF0]/40 focus:border-[#FF5B04]/50 focus:ring-1 focus:ring-[#FF5B04]/50"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="border border-[#E4EEF0]/10 bg-[#16232B] text-[#FF5B04] hover:border-[#FF5B04]/40 hover:bg-[#FF5B04]/10"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Card */}
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70">
              <TableRow className="border-b border-[#E4EEF0]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Company
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Plan Tier
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  MRR
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Users
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Strategies
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Provisioned
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((org) => (
                <TableRow
                  key={org.id}
                  className="group border-b border-[#E4EEF0]/5 transition-colors hover:bg-[#16232B]/50"
                >
                  <TableCell className="py-3.5">
                    <Link
                      href={`/superadmin/companies/${org.id}`}
                      className="group/link flex items-center gap-1.5 font-medium text-white transition-colors hover:text-[#F4D47C]"
                    >
                      <span>{org.name}</span>
                      <ChevronRight className="h-3 w-3 text-[#E4EEF0]/30 transition-transform group-hover/link:translate-x-0.5 group-hover/link:text-[#FF5B04]" />
                    </Link>
                    <p className="font-mono text-[11px] text-[#E4EEF0]/50">{org.slug}</p>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <OrgStatusBadge status={org.status} />
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs capitalize text-[#E4EEF0]">
                    {org.plan}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm font-semibold text-[#F4D47C]">
                    {money(org.monthly_revenue_usd)}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm text-white">
                    {org.user_count}
                  </TableCell>
                  <TableCell className="py-3.5 text-right font-mono text-sm text-white">
                    {org.strategy_count}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#E4EEF0]/60">
                    {shortDate(org.created_at)}
                  </TableCell>
                </TableRow>
              ))}

              {data && data.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center font-mono text-sm text-[#E4EEF0]/50">
                    No organizations match the selected criteria.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-[#E4EEF0]/70">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
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
        <p className="font-mono text-xs text-[#E4EEF0]/50">
          Displaying {data.items.length} of {data.total} registered organizations.
        </p>
      )}
    </div>
  );
}