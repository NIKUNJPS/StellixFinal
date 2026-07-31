"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadMe } from "@/lib/auth";
import {
  createComplianceExport,
  downloadComplianceExport,
  getActiveStrategies,
  getApprovalQueue,
  getComplianceExportJob,
  getGovernanceAuditLog,
  killSwitch,
} from "@/lib/governance";
import type {
  ActiveStrategySummary,
  ApprovalQueueItem,
  ComplianceExportFormat,
  ComplianceExportJob,
  GovernanceAuditLogEntry,
} from "@/lib/governance-types";
import { approveOrRejectStrategy } from "@/lib/strategy";
import { useAuthStore } from "@/store/auth-store";

// Three role tiers, matching the backend exactly (see docs/schemas.md "Governance
// endpoints"): kill switch is narrower than the general governance views, and the
// audit trail / export are a separate compliance-oversight tier.
const KILL_SWITCH_ROLES = new Set(["risk_manager", "cio", "admin"]);
const VIEW_ROLES = new Set(["risk_manager", "cio", "compliance_officer", "admin"]);
const COMPLIANCE_ROLES = new Set(["admin", "compliance_officer"]);

const EVENT_TYPES = [
  "strategy_status_change",
  "strategy_approved",
  "strategy_rejected",
  "kill_switch_activated",
  "evolution_candidate_approved",
  "data_export",
  "user_role_changed",
  "login",
  "failed_login",
];

export default function GovernancePage() {
  const { user } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadMe().finally(() => setReady(true));
  }, []);

  const role = user?.role ?? "";
  const canView = VIEW_ROLES.has(role);
  const canKill = KILL_SWITCH_ROLES.has(role);
  const canSeeCompliance = COMPLIANCE_ROLES.has(role);

  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategySummary[]>([]);
  const [queue, setQueue] = useState<ApprovalQueueItem[]>([]);
  const [killTarget, setKillTarget] = useState<string | null>(null);
  const [killReason, setKillReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [auditItems, setAuditItems] = useState<GovernanceAuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  const [exportStart, setExportStart] = useState("2026-01-01");
  const [exportEnd, setExportEnd] = useState("2026-12-31");
  const [exportFormat, setExportFormat] = useState<ComplianceExportFormat>("json");
  const [exportJob, setExportJob] = useState<ComplianceExportJob | null>(null);

  const loadViews = useCallback(async () => {
    if (!canView) return;
    try {
      const [active, pending] = await Promise.all([getActiveStrategies(), getApprovalQueue()]);
      setActiveStrategies(active.items);
      setQueue(pending.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load governance views");
    }
  }, [canView]);

  const loadAuditLog = useCallback(async () => {
    if (!canSeeCompliance) return;
    try {
      const res = await getGovernanceAuditLog({ event_type: eventTypeFilter || undefined, limit: 50 });
      setAuditItems(res.items);
      setAuditTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    }
  }, [canSeeCompliance, eventTypeFilter]);

  useEffect(() => {
    if (ready) loadViews();
  }, [ready, loadViews]);

  useEffect(() => {
    if (ready) loadAuditLog();
  }, [ready, loadAuditLog]);

  async function confirmKill(strategyId: string) {
    setError(null);
    setMessage(null);
    try {
      await killSwitch(strategyId, killReason);
      setMessage("Kill switch activated — strategy retired.");
      setKillTarget(null);
      setKillReason("");
      await loadViews();
      await loadAuditLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kill switch failed");
    }
  }

  async function decide(strategyId: string, action: "approve" | "reject") {
    setError(null);
    setMessage(null);
    try {
      await approveOrRejectStrategy(strategyId, action, `${action}d from the Governance Panel`);
      await loadViews();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }

  async function submitExport() {
    setError(null);
    setMessage(null);
    try {
      const enqueued = await createComplianceExport({
        start_date: exportStart,
        end_date: exportEnd,
        export_format: exportFormat,
      });
      setMessage(enqueued.message);
      setExportJob(await getComplianceExportJob(enqueued.job_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enqueue export");
    }
  }

  async function pollExport() {
    if (!exportJob) return;
    try {
      setExportJob(await getComplianceExportJob(exportJob.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to poll export job");
    }
  }

  async function downloadExport() {
    if (!exportJob) return;
    try {
      await downloadComplianceExport(exportJob.id, exportJob.export_format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download export");
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Governance & Compliance</CardTitle>
            <CardDescription>
              Kill switch, approval queue, org-wide audit trail, and compliance export. Sections below
              are gated by your role ({role || "unauthenticated"}), matching the backend exactly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </CardContent>
        </Card>

        {!canView && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Your role has no governance views here. risk_manager, cio, compliance_officer, and admin
              can see active strategies and the approval queue; admin and compliance_officer additionally
              see the audit trail and compliance export below.
            </CardContent>
          </Card>
        )}

        {canView && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active strategies</CardTitle>
              <CardDescription>
                {canKill
                  ? "One-click kill switch — bypasses the state machine entirely, irreversible, requires a reason."
                  : "Read-only for your role; the kill switch is risk_manager/cio/admin only."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeStrategies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active strategies.</p>
              ) : (
                <div className="flex flex-col gap-3" data-testid="active-strategies">
                  {activeStrategies.map((s) => (
                    <div key={s.id} className="rounded-md border border-border p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.version} · robustness {s.robustness_score?.toFixed(3) ?? "—"}
                        </span>
                      </div>
                      {canKill && killTarget !== s.id && (
                        <Button
                          size="sm"
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            setKillTarget(s.id);
                            setKillReason("");
                          }}
                          data-testid={`kill-${s.id}`}
                        >
                          Kill switch
                        </Button>
                      )}
                      {canKill && killTarget === s.id && (
                        <div className="mt-2 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                          <p className="text-xs text-destructive">
                            Irreversible: this immediately retires the strategy, bypassing the normal
                            lifecycle checks. Reactivation requires a brand-new draft → candidate → active
                            run and fresh approval — there is no undo.
                          </p>
                          <Label htmlFor={`kill-reason-${s.id}`}>Reason (required)</Label>
                          <Input
                            id={`kill-reason-${s.id}`}
                            value={killReason}
                            onChange={(e) => setKillReason(e.target.value)}
                            placeholder="e.g. anomalous drawdown detected in live trading"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={!killReason.trim()}
                              onClick={() => confirmKill(s.id)}
                              data-testid={`confirm-kill-${s.id}`}
                            >
                              Confirm kill switch
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setKillTarget(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canView && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Approval queue</CardTitle>
              <CardDescription>
                Candidates with robustness ≥ 0.70 awaiting an approve/reject decision (reuses the same
                /strategies/{"{id}"}/approve endpoint as the Strategies page — no parallel mechanism).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing pending.</p>
              ) : (
                <div className="flex flex-col gap-3" data-testid="approval-queue">
                  {queue.map((c) => (
                    <div key={c.id} className="rounded-md border border-border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.creator} · robustness {c.robustness_score?.toFixed(3) ?? "—"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => decide(c.id, "approve")} data-testid={`approve-${c.id}`}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide(c.id, "reject")}
                          data-testid={`reject-${c.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canSeeCompliance && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Audit log</CardTitle>
              <CardDescription>{auditTotal} total events, org-wide (admin / compliance_officer only).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <select
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  data-testid="filter-event-type"
                >
                  <option value="">All event types</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={loadAuditLog}>
                  Refresh
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="governance-audit-log-table">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">Entity</th>
                      <th className="px-3 py-2">Justification</th>
                      <th className="px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditItems.map((row) => (
                      <tr key={row.id} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          <Badge variant="outline">{row.event_type}</Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.entity_type}:{row.entity_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.justification ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.created_at.slice(0, 19).replace("T", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {canSeeCompliance && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Compliance export</CardTitle>
              <CardDescription>Audit trail for a date range, as JSON or a formatted PDF report.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="export-start">Start date</Label>
                  <Input
                    id="export-start"
                    type="date"
                    className="h-9"
                    value={exportStart}
                    onChange={(e) => setExportStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="export-end">End date</Label>
                  <Input
                    id="export-end"
                    type="date"
                    className="h-9"
                    value={exportEnd}
                    onChange={(e) => setExportEnd(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="export-format">Format</Label>
                  <select
                    id="export-format"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as ComplianceExportFormat)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="json">JSON</option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>
                <Button size="sm" onClick={submitExport} data-testid="submit-export">
                  Generate export
                </Button>
              </div>

              {exportJob && (
                <div className="rounded-md border border-border p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span>
                      Job {exportJob.id.slice(0, 8)} · {exportJob.export_format.toUpperCase()} ·{" "}
                      {exportJob.start_date} to {exportJob.end_date}
                    </span>
                    <Badge
                      variant={
                        exportJob.status === "completed"
                          ? "success"
                          : exportJob.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {exportJob.status}
                    </Badge>
                  </div>
                  {exportJob.error && <p className="mb-2 text-xs text-destructive">{exportJob.error}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={pollExport} data-testid="poll-export">
                      Refresh status
                    </Button>
                    {exportJob.status === "completed" && (
                      <Button size="sm" onClick={downloadExport} data-testid="download-export">
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
