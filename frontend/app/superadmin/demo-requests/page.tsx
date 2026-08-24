"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Building2,
  Mail,
  User,
  Briefcase,
  Users,
  Calendar,
  ShieldAlert,
  KeyRound,
  Copy,
} from "lucide-react";
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
    <div className="mx-auto max-w-5xl space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-[#E4EEF0]/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Demo Requests
          </h1>
          <p className="mt-1 text-sm text-[#E4EEF0]/70">
            Inbound institutional leads from the platform site. Approving provisions a live organization & tenant admin.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div className="flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/50 px-3 py-1.5 font-mono text-xs text-[#E4EEF0]/80">
            <Inbox className="h-3.5 w-3.5 text-[#FF5B04]" />
            <span>Pending Inbound: {inbox?.pending.length ?? "—"}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pending Review Section */}
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-4 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <Inbox className="h-4 w-4 text-[#FF5B04]" />
              <span>Pending Review {inbox ? `(${inbox.pending.length})` : ""}</span>
            </CardTitle>
            {inbox && inbox.pending.length > 0 && (
              <Badge className="border-[#FF5B04]/40 bg-[#FF5B04]/10 font-mono text-[10px] text-[#FF5B04] uppercase">
                Action Required
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {inbox?.pending.length === 0 && (
            <div className="py-8 text-center font-mono text-sm text-[#E4EEF0]/50">
              No demo leads awaiting review.
            </div>
          )}

          {inbox?.pending.map((d) => (
            <div
              key={d.id}
              className="flex flex-col gap-4 rounded-xl border border-[#E4EEF0]/10 bg-[#16232B]/60 p-5 transition-all duration-200 hover:border-[#FF5B04]/30 hover:bg-[#16232B]/90 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-white text-base">{d.company}</span>
                  <Badge className="border-[#F4D47C]/30 bg-[#F4D47C]/10 font-mono text-[10px] text-[#F4D47C] capitalize">
                    {d.firm_type.replace("_", " ")}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#E4EEF0]/70">
                  <span className="flex items-center gap-1.5 text-white">
                    <User className="h-3 w-3 text-[#FF5B04]" /> {d.contact_name}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#E4EEF0]/60">
                    <Briefcase className="h-3 w-3 text-[#E4EEF0]/40" /> {d.job_title}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#F4D47C]">
                    <Mail className="h-3 w-3" /> {d.work_email}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px] text-[#E4EEF0]/50">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> Team: {d.team_size.replace("size_", "").replace("_", "–")}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {shortDate(d.created_at)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg border border-[#E4EEF0]/5 bg-[#042F34]/50 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#E4EEF0]/40 mb-1">
                    Institutional Use Case
                  </p>
                  <p className="text-xs text-[#E4EEF0]/80 leading-relaxed">{d.use_case}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex shrink-0 gap-2 sm:self-start">
                <Button
                  size="sm"
                  onClick={() => setApproving(d)}
                  className="border border-[#F4D47C]/40 bg-[#F4D47C] font-mono text-xs font-semibold text-[#042F34] hover:bg-[#F4D47C]/90 shadow-md"
                >
                  Approve Lead
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejecting(d)}
                  className="border border-[#E4EEF0]/10 bg-[#042F34]/50 font-mono text-xs text-[#E4EEF0]/70 hover:border-[#FF5B04]/50 hover:bg-[#FF5B04]/10 hover:text-[#FF5B04]"
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reviewed Leads Section */}
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-4 px-6">
          <CardTitle className="text-base font-semibold text-white">
            Reviewed Pipeline {inbox ? `(${inbox.reviewed.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-6">
          {inbox?.reviewed.length === 0 && (
            <p className="py-4 text-center font-mono text-xs text-[#E4EEF0]/50">
              No past reviewed demo requests found.
            </p>
          )}
          {inbox?.reviewed.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-[#E4EEF0]/5 bg-[#16232B]/40 px-4 py-3 text-xs transition-colors hover:bg-[#16232B]/70"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-3.5 w-3.5 text-[#F4D47C]" />
                <span className="font-medium text-white">{d.company}</span>
                <span className="font-mono text-[#E4EEF0]/60">({d.contact_name})</span>
              </div>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  d.status === "converted"
                    ? "border-[#F4D47C]/30 bg-[#F4D47C]/10 text-[#F4D47C]"
                    : d.status === "rejected"
                    ? "border-[#FF5B04]/30 bg-[#FF5B04]/10 text-[#FF5B04]"
                    : "border-[#E4EEF0]/20 bg-[#042F34] text-[#E4EEF0]/80"
                }`}
              >
                {d.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Provisioning Modal */}
      {approving && (
        <ApproveDialog
          request={approving}
          onClose={() => setApproving(null)}
          onDone={load}
        />
      )}

      {/* Rejection Confirmation */}
      <ConfirmActionDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.company}?` : ""}
        description="The lead will be marked rejected and archived. No organization credentials will be generated."
        confirmLabel="Reject Lead"
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
      setResult({ email: res.admin_email, password: res.temporary_password });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const copyCreds = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Login: ${result.email}\nTemp Password: ${result.password}`);
    toast.success("Credentials copied to clipboard");
  };

  return (
    <Dialog open onOpenChange={(v) => !busy && !v && onClose()}>
      <DialogContent className="border border-[#E4EEF0]/10 bg-[#042F34] text-white shadow-2xl backdrop-blur-xl sm:max-w-md">
        <DialogHeader className="border-b border-[#E4EEF0]/10 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
            <KeyRound className="h-5 w-5 text-[#F4D47C]" />
            <span>Approve & Provision {request.company}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-[#E4EEF0]/70">
            Initializes an active tenant workspace and an administrator account for{" "}
            <span className="text-[#F4D47C] font-mono">{request.work_email}</span>.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-xs text-[#F4D47C] font-mono">
              <CheckCircle2 className="h-4 w-4" />
              <span>Workspace provisioned successfully.</span>
            </div>
            <div className="space-y-2 rounded-lg border border-[#E4EEF0]/10 bg-[#16232B] p-4 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E4EEF0]/5">
                <span className="text-[#E4EEF0]/50 uppercase tracking-wider text-[10px]">Credentials (Relay Once)</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyCreds}
                  className="h-6 px-2 text-[10px] text-[#F4D47C] hover:bg-[#042F34]"
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <p className="pt-1">
                <span className="text-[#E4EEF0]/50">Login:</span>{" "}
                <span className="text-white font-semibold">{result.email}</span>
              </p>
              <p className="break-all">
                <span className="text-[#E4EEF0]/50">Temp Password:</span>{" "}
                <span className="text-[#F4D47C] font-bold">{result.password}</span>
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button
                onClick={onClose}
                className="w-full border border-[#F4D47C]/40 bg-[#F4D47C] font-mono text-xs font-semibold text-[#042F34] hover:bg-[#F4D47C]/90"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/70">
                Plan Allocation
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(["starter", "pro", "enterprise"] as OrganizationTier[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`rounded-lg border px-3 py-2 font-mono text-xs capitalize transition-all ${
                      plan === p
                        ? "border-[#FF5B04] bg-[#FF5B04]/15 text-[#FF5B04] font-semibold shadow-sm"
                        : "border-[#E4EEF0]/10 bg-[#16232B]/60 text-[#E4EEF0]/60 hover:bg-[#16232B] hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/70">
                Custom Temporary Password (Optional)
              </Label>
              <Input
                placeholder="Leave blank to auto-generate"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="border-[#E4EEF0]/10 bg-[#16232B] font-mono text-xs text-white placeholder:text-[#E4EEF0]/30 focus:border-[#FF5B04]/50 focus:ring-1 focus:ring-[#FF5B04]/50"
              />
            </div>

            {err && (
              <div className="flex items-center gap-2 rounded-md border border-[#FF5B04]/40 bg-[#FF5B04]/10 p-2 text-xs text-[#FF5B04]">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={busy}
                className="border-[#E4EEF0]/10 bg-[#16232B]/60 font-mono text-xs text-[#E4EEF0]/70 hover:bg-[#16232B] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={run}
                disabled={busy}
                className="border border-[#F4D47C]/40 bg-[#F4D47C] font-mono text-xs font-semibold text-[#042F34] hover:bg-[#F4D47C]/90"
              >
                {busy ? "Provisioning..." : "Provision Organization"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}