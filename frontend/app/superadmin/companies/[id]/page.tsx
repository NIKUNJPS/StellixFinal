"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
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
import { ConfirmActionDialog, money, OrgStatusBadge, shortDate } from "@/components/superadmin/shared";
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
      <div className="mx-auto max-w-4xl">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!org) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const isActive = org.status === "active";
  const isPending = org.status === "pending_approval";
  const isSuspended = org.status === "suspended";
  const isTerminated = org.status === "terminated";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/superadmin/companies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All companies
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{org.name}</h1>
            <OrgStatusBadge status={org.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {org.slug} · <span className="capitalize">{org.plan}</span> plan · {money(org.monthly_revenue_usd)}/mo
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {isPending && (
            <Button onClick={() => setDialog("approve")}>Approve</Button>
          )}
          {isActive && (
            <Button variant="destructive" onClick={() => setDialog("suspend")}>Suspend</Button>
          )}
          {isSuspended && (
            <Button onClick={() => setDialog("reactivate")}>Reactivate</Button>
          )}
          {!isTerminated && (
            <Button variant="outline" onClick={() => setDialog("terminate")}>Terminate</Button>
          )}
        </div>
      </div>

      {org.suspended_reason && (
        <div className="rounded-md border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-crimson">
          Suspended: {org.suspended_reason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Fact label="Users" value={String(org.user_count)} />
        <Fact label="Strategies" value={String(org.strategy_count)} />
        <Fact label="LLM cost (mo)" value={money(org.llm_cost_this_month)} />
        <Fact label="Last active" value={shortDate(org.last_active_at)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Last login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell>{u.full_name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{u.role.replace("_", " ")}</TableCell>
                  <TableCell>{u.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{shortDate(u.last_login_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {org.internal_notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{org.internal_notes}</pre>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle action dialogs */}
      <ConfirmActionDialog
        open={dialog === "approve"}
        onOpenChange={(v) => setDialog(v ? "approve" : null)}
        title={`Approve ${org.name}?`}
        description="The organization becomes active and can sign in immediately."
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
        description="All of this org's users are locked out of the entire client API until reactivated. Sessions are revoked."
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
        description="Restores full access. Users can sign in again."
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
        description="Permanent-intent: every endpoint returns 410 and sessions are revoked. Revenue is zeroed."
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
