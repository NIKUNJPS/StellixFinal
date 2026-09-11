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
    <div className="relative mx-auto max-w-5xl space-y-6 text-[#F5F5F7]">
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
            Demo Requests
          </h1>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Inbound institutional leads from the platform site. Approving provisions a live organization & tenant admin.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <Inbox className="h-3.5 w-3.5 text-[#8E88C7]" />
            <span>Pending Inbound: {inbox?.pending.length ?? "—"}</span>
          </div>
        </div>
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

      {/* Pending Review Section */}
      <Card
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#F5F5F7]">
              <Inbox className="h-4 w-4 text-[#8E88C7]" />
              <span>Pending Review {inbox ? `(${inbox.pending.length})` : ""}</span>
            </CardTitle>
            {inbox && inbox.pending.length > 0 && (
              <Badge className="border border-[#8E88C7]/30 bg-[#8E88C7]/10 font-mono text-[10px] text-[#8E88C7] uppercase">
                Action Required
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {inbox?.pending.length === 0 && (
            <div className="py-8 text-center font-mono text-xs text-[#808495]">
              No demo leads awaiting review.
            </div>
          )}

          {inbox?.pending.map((d) => (
            <div
              key={d.id}
              className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-[#0F1115]/60 p-5 transition-all duration-200 hover:border-white/[0.14] hover:bg-[#14161B]/80 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-semibold text-[#F5F5F7]">{d.company}</span>
                  <Badge className="border border-white/[0.1] bg-white/[0.04] font-mono text-[10px] text-[#9A9DA8] capitalize">
                    {d.firm_type.replace("_", " ")}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#9A9DA8]">
                  <span className="flex items-center gap-1.5 text-[#F5F5F7]">
                    <User className="h-3 w-3 text-[#8E88C7]" /> {d.contact_name}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#808495]">
                    <Briefcase className="h-3 w-3 text-[#666A76]" /> {d.job_title}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#8E88C7]">
                    <Mail className="h-3 w-3" /> {d.work_email}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px] text-[#666A76]">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> Team: {d.team_size.replace("size_", "").replace("_", "–")}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {shortDate(d.created_at)}
                  </span>
                </div>

                <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#07080B]/60 p-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#808495]">
                    Institutional Use Case
                  </p>
                  <p className="text-xs leading-relaxed text-[#9A9DA8]">{d.use_case}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex shrink-0 gap-2 sm:self-start">
                <Button
                  size="sm"
                  onClick={() => setApproving(d)}
                  className="rounded-xl border border-[#8E88C7]/40 bg-[#8E88C7] font-mono text-xs font-semibold text-[#07080B] shadow-md transition-all hover:bg-[#8E88C7]/90 active:scale-95"
                >
                  Approve Lead
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejecting(d)}
                  className="rounded-xl border border-white/[0.08] bg-[#0D0F14]/70 font-mono text-xs text-[#9A9DA8] transition-all hover:border-[#F87171]/40 hover:bg-[#F87171]/10 hover:text-[#F87171] active:scale-95"
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reviewed Leads Section */}
      <Card
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
          <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
            Reviewed Pipeline {inbox ? `(${inbox.reviewed.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-6">
          {inbox?.reviewed.length === 0 && (
            <p className="py-4 text-center font-mono text-xs text-[#808495]">
              No past reviewed demo requests found.
            </p>
          )}
          {inbox?.reviewed.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-[#0F1115]/50 px-4 py-3 text-xs transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-3.5 w-3.5 text-[#8E88C7]" />
                <span className="font-medium text-[#F5F5F7]">{d.company}</span>
                <span className="font-mono text-[#808495]">({d.contact_name})</span>
              </div>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  d.status === "converted"
                    ? "border border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                    : d.status === "rejected"
                    ? "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                    : "border border-white/[0.1] bg-white/[0.04] text-[#9A9DA8]"
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
      <DialogContent
        className="border border-white/[0.08] bg-[#0D0F14]/95 text-[#F5F5F7] shadow-2xl backdrop-blur-2xl sm:max-w-md"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <DialogHeader className="border-b border-white/[0.06] pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#F5F5F7]">
            <KeyRound className="h-5 w-5 text-[#8E88C7]" />
            <span>Approve & Provision {request.company}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-[#9A9DA8]">
            Initializes an active tenant workspace and an administrator account for{" "}
            <span className="font-mono text-[#8E88C7]">{request.work_email}</span>.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 font-mono text-xs text-[#34D399]">
              <CheckCircle2 className="h-4 w-4" />
              <span>Workspace provisioned successfully.</span>
            </div>
            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#07080B]/80 p-4 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-[10px] uppercase tracking-wider text-[#808495]">Credentials (Relay Once)</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyCreds}
                  className="h-6 px-2 text-[10px] text-[#8E88C7] hover:bg-white/[0.05]"
                >
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </Button>
              </div>
              <p className="pt-1">
                <span className="text-[#808495]">Login:</span>{" "}
                <span className="font-semibold text-[#F5F5F7]">{result.email}</span>
              </p>
              <p className="break-all">
                <span className="text-[#808495]">Temp Password:</span>{" "}
                <span className="font-bold text-[#34D399]">{result.password}</span>
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button
                onClick={onClose}
                className="w-full rounded-xl border border-[#8E88C7]/40 bg-[#8E88C7] font-mono text-xs font-semibold text-[#07080B] hover:bg-[#8E88C7]/90 active:scale-95"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                Plan Allocation
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(["starter", "pro", "enterprise"] as OrganizationTier[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`rounded-xl border px-3 py-2 font-mono text-xs capitalize transition-all ${
                      plan === p
                        ? "border-[#8E88C7]/60 bg-[#8E88C7]/15 font-semibold text-[#8E88C7] shadow-sm"
                        : "border-white/[0.08] bg-[#07080B]/60 text-[#808495] hover:border-white/[0.14] hover:text-[#F5F5F7]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                Custom Temporary Password (Optional)
              </Label>
              <Input
                placeholder="Leave blank to auto-generate"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="rounded-xl border-white/[0.08] bg-[#07080B]/60 font-mono text-xs text-[#F5F5F7] placeholder:text-[#666A76] focus:border-[#8E88C7]/50 focus:ring-1 focus:ring-[#8E88C7]/50"
              />
            </div>

            {err && (
              <div
                className="flex items-center gap-2 rounded-xl border p-2 text-xs text-[#F87171]"
                style={{
                  backgroundColor: "rgba(248, 113, 113, 0.08)",
                  borderColor: "rgba(248, 113, 113, 0.25)",
                }}
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-white/[0.08] bg-[#0D0F14]/70 font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.05] hover:text-[#F5F5F7]"
              >
                Cancel
              </Button>
              <Button
                onClick={run}
                disabled={busy}
                className="rounded-xl border border-[#8E88C7]/40 bg-[#8E88C7] font-mono text-xs font-semibold text-[#07080B] hover:bg-[#8E88C7]/90 active:scale-95"
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