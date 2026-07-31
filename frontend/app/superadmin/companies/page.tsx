"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

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
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Companies</h1>
        <p className="text-sm text-muted-foreground">Every organization on the platform.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium " +
                (statusFilter === s
                  ? "bg-crimson/15 text-crimson"
                  : "text-muted-foreground hover:bg-secondary")
              }
            >
              {FILTER_LABEL[s]}
            </button>
          ))}
        </div>
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Strategies</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((org) => (
                <TableRow key={org.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/superadmin/companies/${org.id}`} className="font-medium hover:text-crimson">
                      {org.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </TableCell>
                  <TableCell><OrgStatusBadge status={org.status} /></TableCell>
                  <TableCell className="capitalize">{org.plan}</TableCell>
                  <TableCell className="text-right">{money(org.monthly_revenue_usd)}</TableCell>
                  <TableCell className="text-right">{org.user_count}</TableCell>
                  <TableCell className="text-right">{org.strategy_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{shortDate(org.created_at)}</TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No organizations match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <p className="text-xs text-muted-foreground">
          Showing {data.items.length} of {data.total}.
        </p>
      )}
    </div>
  );
}
