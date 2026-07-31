"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog, shortDate } from "@/components/superadmin/shared";
import { approveDemoRequest, listDemoRequests, rejectDemoRequest } from "@/lib/superadmin";
import type { DemoRequestInbox, DemoRequestSummary } from "@/lib/superadmin-types";
import type { OrganizationTier } from "@/lib/auth-types";

export default function DemoRequestsPage() {
  const [inbox, setInbox] = useState<DemoRequestInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<DemoRequestSummary | null>(null);
  const [rejecting, setRejecting] = useState<DemoRequestSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setInbox(await listDemoRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Demo Requests</h1>
        <p className="text-sm text-muted-foreground">Inbound leads from the public site. Approving one provisions a live org + admin.</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pending{inbox ? ` (${inbox.pending.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inbox?.pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {inbox?.pending.map((d) => (
            <div key={d.id} className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium">{d.company}</p>
                <p className="text-sm text-muted-foreground">
                  {d.contact_name} · {d.job_title} · {d.work_email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.firm_type.replace("_", " ")} · team {d.team_size.replace("size_", "").replace("_", "–")} · {shortDate(d.created_at)}
                </p>
                <p className="mt-2 max-w-xl text-sm">{d.use_case}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => setApproving(d)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(d)}>Reject</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reviewed{inbox ? ` (${inbox.reviewed.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {inbox?.reviewed.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {inbox?.reviewed.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
              <span className="font-medium">{d.company}</span>
              <span className="text-muted-foreground">{d.contact_name}</span>
              <Badge variant={d.status === "converted" ? "success" : d.status === "rejected" ? "destructive" : "secondary"}>
                {d.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {approving && (
        <ApproveDialog
          request={approving}
          onClose={() => setApproving(null)}
          onDone={load}
        />
      )}

      <ConfirmActionDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.company}?` : ""}
        description="The lead is marked rejected. No account is created."
        confirmLabel="Reject"
        destructive
        requireReason
        onConfirm={async (reason) => {
          if (!rejecting) return;
          await rejectDemoRequest(rejecting.id, reason);
          toast.success("Demo request rejected");
          setRejecting(null);
          await load();
        }}
      />
    </div>
  );
}

function ApproveDialog({
  request,
  onClose,
  onDone,
}: {
  request: DemoRequestSummary;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [plan, setPlan] = useState<OrganizationTier>("pro");
  const [tempPassword, setTempPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await approveDemoRequest(request.id, {
        plan,
        temp_password: tempPassword.trim() || undefined,
      });
      // Show the generated/relayed temp password ONCE (no email infra in this deployment).
      setResult({ email: res.admin_email, password: res.temporary_password });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !busy && !v && (result ? onClose() : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {request.company}</DialogTitle>
          <DialogDescription>Creates an active organization and an admin user for {request.work_email}.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">Organization created. Relay these credentials to the client — shown once:</p>
            <div className="rounded-md border border-border bg-secondary/50 p-3 text-sm">
              <p><span className="text-muted-foreground">Login:</span> {result.email}</p>
              <p className="break-all"><span className="text-muted-foreground">Temp password:</span> <span className="font-mono">{result.password}</span></p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label>Plan</Label>
              <div className="flex gap-2">
                {(["starter", "pro", "enterprise"] as OrganizationTier[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={
                      "flex-1 rounded-md border px-3 py-2 text-sm capitalize " +
                      (plan === p ? "border-crimson bg-crimson/10 text-crimson" : "border-border text-muted-foreground")
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Temp password (optional)</Label>
              <Input
                placeholder="Leave blank to auto-generate"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={run} disabled={busy}>{busy ? "Creating…" : "Create organization"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
