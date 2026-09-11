"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Users,
  Cpu,
  Clock,
  ShieldAlert,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ConfirmActionDialog,
  money,
  OrgStatusBadge,
  shortDate,
} from "@/components/superadmin/shared";
import {
  approveOrg,
  getOrgDetail,
  reactivateOrg,
  suspendOrg,
  terminateOrg,
} from "@/lib/superadmin";
import type { OrgDetail } from "@/lib/superadmin-types";

type DialogKind = "approve" | "suspend" | "reactivate" | "terminate" | null;

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);

  const load = useCallback(async () => {
    try {
      setOrg(await getOrgDetail(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl py-6 text-[#F5F5F7]">
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
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center py-24 text-[#F5F5F7]">
        <div className="flex items-center gap-3 text-sm text-[#9A9DA8]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
          <span className="font-mono text-xs">Loading organization details...</span>
        </div>
      </div>
    );
  }

  const isActive = org.status === "active";
  const isPending = org.status === "pending_approval";
  const isSuspended = org.status === "suspended";
  const isTerminated = org.status === "terminated";

  return (
    <div className="relative mx-auto max-w-4xl space-y-6 text-[#F5F5F7]">
      {/* Ambient Background Glow Orbs */}
      <div className="pointer-events-none absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-48 right-0 h-64 w-64 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {/* Back Link */}
      <div>
        <Link
          href="/superadmin/companies"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0D0F14]/60 px-3 py-1.5 font-mono text-xs text-[#9A9DA8] backdrop-blur-md transition-all hover:border-white/[0.15] hover:text-[#F5F5F7]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to all companies
        </Link>
      </div>

      {/* Header Profile & Actions */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#F5F5F7] sm:text-3xl">
              {org.name}
            </h1>
            <OrgStatusBadge status={org.status} />
          </div>
          <p className="mt-1.5 font-mono text-xs text-[#9A9DA8]">
            <span className="text-[#8E88C7]">{org.slug}</span> ·{" "}
            <span className="capitalize text-[#F5F5F7]">{org.plan}</span> plan ·{" "}
            <span className="font-semibold text-[#34D399]">{money(org.monthly_revenue_usd)}</span>/mo
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {isPending && (
            <Button
              onClick={() => setDialog("approve")}
              className="rounded-xl border border-[#8E88C7]/40 bg-[#8E88C7] font-mono text-xs font-semibold text-[#07080B] shadow-md transition-all hover:bg-[#8E88C7]/90 active:scale-95"
            >
              Approve Org
            </Button>
          )}
          {isActive && (
            <Button
              onClick={() => setDialog("suspend")}
              className="rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 font-mono text-xs font-medium text-[#F87171] transition-all hover:bg-[#F87171] hover:text-white active:scale-95"
            >
              Suspend Access
            </Button>
          )}
          {isSuspended && (
            <Button
              onClick={() => setDialog("reactivate")}
              className="rounded-xl border border-[#34D399]/40 bg-[#34D399]/10 font-mono text-xs font-medium text-[#34D399] transition-all hover:bg-[#34D399] hover:text-[#07080B] active:scale-95"
            >
              Reactivate Org
            </Button>
          )}
          {!isTerminated && (
            <Button
              variant="outline"
              onClick={() => setDialog("terminate")}
              className="rounded-xl border border-white/[0.08] bg-[#0D0F14]/70 font-mono text-xs text-[#9A9DA8] transition-all hover:border-[#F87171]/40 hover:bg-[#F87171]/10 hover:text-[#F87171] active:scale-95"
            >
              Terminate
            </Button>
          )}
        </div>
      </div>

      {/* Suspension Alert */}
      {org.suspended_reason && (
        <div
          className="flex items-start gap-3 rounded-2xl border p-4 font-mono text-xs text-[#F87171] shadow-lg backdrop-blur-md"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.08)",
            borderColor: "rgba(248, 113, 113, 0.25)",
          }}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold uppercase tracking-wider">Account Suspended:</span>{" "}
            {org.suspended_reason}
          </div>
        </div>
      )}

      {/* Fact Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Fact
          label="Provisioned Users"
          value={String(org.user_count)}
          icon={Users}
        />
        <Fact
          label="Quant Strategies"
          value={String(org.strategy_count)}
          icon={Building2}
        />
        <Fact
          label="LLM Cost (Current Mo)"
          value={money(org.llm_cost_this_month)}
          icon={Cpu}
          highlight
        />
        <Fact
          label="Last Tenant Activity"
          value={shortDate(org.last_active_at)}
          icon={Clock}
        />
      </div>

      {/* Users Roster Table */}
      <Card
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
          <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
            Organization Users ({org.users.length})
          </CardTitle>
          <Users className="h-4 w-4 text-[#8E88C7]" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-white/[0.06] bg-[#0F1115]/40">
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Email
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Name
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Role
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Last Login
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.users.map((u) => (
                <TableRow
                  key={u.id}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <TableCell className="py-3.5 font-mono text-xs font-medium text-[#F5F5F7]">
                    {u.email}
                  </TableCell>
                  <TableCell className="py-3.5 text-xs text-[#9A9DA8]">
                    {u.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs capitalize text-[#8E88C7]">
                    {u.role.replace("_", " ")}
                  </TableCell>
                  <TableCell className="py-3.5">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#34D399]">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-[#F87171]/30 bg-[#F87171]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#F87171]">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#808495]">
                    {shortDate(u.last_login_at)}
                  </TableCell>
                </TableRow>
              ))}

              {org.users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center font-mono text-xs text-[#808495]"
                  >
                    No users provisioned for this organization.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Internal Notes Section */}
      {org.internal_notes && (
        <Card
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 backdrop-blur-xl"
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-3.5 px-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#8E88C7]" />
              <CardTitle className="text-sm font-semibold text-[#F5F5F7]">
                Internal Administrative Notes
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <pre className="whitespace-pre-wrap font-mono text-xs text-[#9A9DA8]">
              {org.internal_notes}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle Action Dialogs */}
      <ConfirmActionDialog
        open={dialog === "approve"}
        onOpenChange={(v) => setDialog(v ? "approve" : null)}
        title={`Approve ${org.name}?`}
        description="The organization becomes active and tenant members can sign in immediately."
        confirmLabel="Approve"
        onConfirm={async () => {
          await approveOrg(org.id, { plan: org.plan });
          toast.success("Organization approved");
          await load();
        }}
      />
      <ConfirmActionDialog
        open={dialog === "suspend"}
        onOpenChange={(v) => setDialog(v ? "suspend" : null)}
        title={`Suspend ${org.name}?`}
        description="All of this org's users are locked out of the client API until reactivated. Current active tokens are revoked."
        confirmLabel="Suspend"
        destructive
        requireReason
        onConfirm={async (reason) => {
          await suspendOrg(org.id, reason);
          toast.success("Organization suspended");
          await load();
        }}
      />
      <ConfirmActionDialog
        open={dialog === "reactivate"}
        onOpenChange={(v) => setDialog(v ? "reactivate" : null)}
        title={`Reactivate ${org.name}?`}
        description="Restores full client platform access. Users can authenticate again immediately."
        confirmLabel="Reactivate"
        onConfirm={async () => {
          await reactivateOrg(org.id);
          toast.success("Organization reactivated");
          await load();
        }}
      />
      <ConfirmActionDialog
        open={dialog === "terminate"}
        onOpenChange={(v) => setDialog(v ? "terminate" : null)}
        title={`Terminate ${org.name}?`}
        description="Permanent-intent action: all tenant endpoints return 410, active sessions are immediately severed, and revenue is zeroed."
        confirmLabel="Terminate"
        destructive
        requireReason
        onConfirm={async (reason) => {
          await terminateOrg(org.id, reason);
          toast.success("Organization terminated");
          await load();
        }}
      />
    </div>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18]"
      style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
    >
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
        style={{ backgroundColor: highlight ? "#F87171" : "#8E88C7" }}
      />
      <CardContent className="flex min-h-[110px] flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
            {label}
          </p>
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-110"
            style={{
              backgroundColor: highlight ? "rgba(248, 113, 113, 0.12)" : "rgba(142, 136, 199, 0.12)",
              borderColor: highlight ? "rgba(248, 113, 113, 0.25)" : "rgba(142, 136, 199, 0.25)",
              color: highlight ? "#F87171" : "#8E88C7",
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <p
          className={`mt-2 font-mono text-xl font-bold tracking-tight ${
            highlight ? "text-[#F87171]" : "text-[#F5F5F7]"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}