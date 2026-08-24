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
  UserCheck,
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
      <div className="mx-auto max-w-4xl py-6 text-white">
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center py-20 text-white">
        <div className="flex items-center gap-3 text-sm text-[#E4EEF0]/70">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
          <span className="font-mono">Loading organization details...</span>
        </div>
      </div>
    );
  }

  const isActive = org.status === "active";
  const isPending = org.status === "pending_approval";
  const isSuspended = org.status === "suspended";
  const isTerminated = org.status === "terminated";

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-white">
      {/* Back Link */}
      <div>
        <Link
          href="/superadmin/companies"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-[#E4EEF0]/60 transition-colors hover:text-[#F4D47C]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to all companies
        </Link>
      </div>

      {/* Header Profile & Actions */}
      <div className="flex flex-col gap-4 border-b border-[#E4EEF0]/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {org.name}
            </h1>
            <OrgStatusBadge status={org.status} />
          </div>
          <p className="mt-1.5 font-mono text-xs text-[#E4EEF0]/70">
            <span className="text-[#F4D47C]">{org.slug}</span> ·{" "}
            <span className="capitalize text-white">{org.plan}</span> plan ·{" "}
            <span className="text-[#F4D47C] font-semibold">{money(org.monthly_revenue_usd)}</span>/mo
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {isPending && (
            <Button
              onClick={() => setDialog("approve")}
              className="border border-[#F4D47C]/40 bg-[#F4D47C] font-mono text-xs font-semibold text-[#042F34] shadow-md transition-all hover:bg-[#F4D47C]/90 hover:shadow-black/40"
            >
              Approve Org
            </Button>
          )}
          {isActive && (
            <Button
              onClick={() => setDialog("suspend")}
              className="border border-[#FF5B04]/50 bg-[#FF5B04]/15 font-mono text-xs text-[#FF5B04] transition-all hover:bg-[#FF5B04] hover:text-white"
            >
              Suspend Access
            </Button>
          )}
          {isSuspended && (
            <Button
              onClick={() => setDialog("reactivate")}
              className="border border-[#F4D47C]/40 bg-[#042F34] font-mono text-xs text-[#F4D47C] transition-all hover:bg-[#16232B] hover:text-white"
            >
              Reactivate Org
            </Button>
          )}
          {!isTerminated && (
            <Button
              variant="outline"
              onClick={() => setDialog("terminate")}
              className="border border-[#E4EEF0]/20 bg-[#16232B]/60 font-mono text-xs text-[#E4EEF0]/70 transition-all hover:border-[#FF5B04]/50 hover:bg-[#FF5B04]/10 hover:text-[#FF5B04]"
            >
              Terminate
            </Button>
          )}
        </div>
      </div>

      {/* Suspension Alert if applicable */}
      {org.suspended_reason && (
        <div className="flex items-start gap-3 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 p-4 font-mono text-xs text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
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
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-3.5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-white">
              Organization Users ({org.users.length})
            </CardTitle>
            <Users className="h-4 w-4 text-[#F4D47C]" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/40">
              <TableRow className="border-b border-[#E4EEF0]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Email
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Name
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Role
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Last Login
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.users.map((u) => (
                <TableRow
                  key={u.id}
                  className="border-b border-[#E4EEF0]/5 transition-colors hover:bg-[#16232B]/50"
                >
                  <TableCell className="py-3.5 font-mono text-xs font-medium text-white">
                    {u.email}
                  </TableCell>
                  <TableCell className="py-3.5 text-xs text-[#E4EEF0]/80">
                    {u.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs capitalize text-[#F4D47C]">
                    {u.role.replace("_", " ")}
                  </TableCell>
                  <TableCell className="py-3.5">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded border border-[#F4D47C]/30 bg-[#F4D47C]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#F4D47C]">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded border border-[#FF5B04]/30 bg-[#FF5B04]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#FF5B04]">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#E4EEF0]/60">
                    {shortDate(u.last_login_at)}
                  </TableCell>
                </TableRow>
              ))}

              {org.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center font-mono text-xs text-[#E4EEF0]/50">
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
        <Card className="border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-lg shadow-black/20 backdrop-blur-md">
          <CardHeader className="border-b border-[#E4EEF0]/10 py-3.5 px-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#F4D47C]" />
              <CardTitle className="text-sm font-semibold text-white">
                Internal Administrative Notes
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <pre className="whitespace-pre-wrap font-mono text-xs text-[#E4EEF0]/80">
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
    <Card className="border border-[#E4EEF0]/10 bg-[#042F34]/40 backdrop-blur-sm transition-all duration-200 hover:border-[#FF5B04]/30 hover:bg-[#042F34]/70">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">{label}</p>
          <Icon className={`h-3.5 w-3.5 ${highlight ? "text-[#FF5B04]" : "text-[#F4D47C]"}`} />
        </div>
        <p
          className={`mt-2 font-mono text-lg font-bold ${
            highlight ? "text-[#F4D47C]" : "text-white"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}