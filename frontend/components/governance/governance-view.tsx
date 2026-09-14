"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type LucideIcon, AlertTriangle, Check, ChevronRight, CircleAlert, Download, FileCheck2, FileText, History, LockKeyhole, RefreshCw, ShieldCheck, ShieldOff, Siren, Terminal, UserCheck, X, Zap, Activity, ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/* ============================================================
   ROLE CONFIGURATION
   ============================================================ */

const KILL_SWITCH_ROLES = new Set([
  "risk_manager",
  "cio",
  "admin",
]);

const VIEW_ROLES = new Set([
  "risk_manager",
  "cio",
  "compliance_officer",
  "admin",
]);

const COMPLIANCE_ROLES = new Set([
  "admin",
  "compliance_officer",
]);

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

/* ============================================================
   HELPERS
   ============================================================ */

function formatEventType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function robustnessLabel(score?: number | null) {
  if (score == null) return "—";

  if (score >= 0.8) return "Strong";
  if (score >= 0.7) return "Validated";
  if (score >= 0.6) return "Moderate";

  return "Weak";
}

function robustnessTone(score?: number | null) {
  if (score == null) {
    return {
      text: "text-[#808495]",
      bg: "rgba(255, 255, 255, 0.03)",
      border: "rgba(255, 255, 255, 0.08)",
    };
  }

  if (score >= 0.8) {
    return {
      text: "text-[#34D399]",
      bg: "rgba(52, 211, 153, 0.12)",
      border: "rgba(52, 211, 153, 0.25)",
    };
  }

  if (score >= 0.7) {
    return {
      text: "text-[#38BDF8]",
      bg: "rgba(56, 189, 248, 0.12)",
      border: "rgba(56, 189, 248, 0.25)",
    };
  }

  return {
    text: "text-[#F87171]",
    bg: "rgba(248, 113, 113, 0.12)",
    border: "rgba(248, 113, 113, 0.25)",
  };
}

/* ============================================================
   SMALL UI COMPONENTS
   ============================================================ */

function SectionEyebrow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
      <Icon className="h-3.5 w-3.5 text-[#8E88C7]" />
      {children}
    </div>
  );
}

/* ============================================================
   PORTFOLIO METRIC CARD (STATIC CONTROL-ROOM VARIANT)
   ============================================================ */

function ControlMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: "blue" | "mint" | "red" | "neutral";
}) {
  const tones = {
    blue: {
      icon: "text-[#38BDF8]",
      bg: "rgba(56, 189, 248, 0.12)",
      border: "rgba(56, 189, 248, 0.25)",
      bar: "bg-[#38BDF8]",
    },
    mint: {
      icon: "text-[#34D399]",
      bg: "rgba(52, 211, 153, 0.12)",
      border: "rgba(52, 211, 153, 0.25)",
      bar: "bg-[#34D399]",
    },
    red: {
      icon: "text-[#F87171]",
      bg: "rgba(248, 113, 113, 0.12)",
      border: "rgba(248, 113, 113, 0.25)",
      bar: "bg-[#F87171]",
    },
    neutral: {
      icon: "text-[#8E88C7]",
      bg: "rgba(142, 136, 199, 0.12)",
      border: "rgba(142, 136, 199, 0.25)",
      bar: "bg-[#8E88C7]",
    },
  };

  const current = tones[tone];

  return (
    <div className="relative flex min-w-0 items-center gap-4 bg-[#0D0F14]/70 px-5 py-5 backdrop-blur-xl">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: current.bg,
          border: `1px solid ${current.border}`,
        }}
      >
        <Icon className={`h-4 w-4 ${current.icon}`} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
          {label}
        </p>

        <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#F5F5F7]">
          {value}
        </p>

        <p className="mt-0.5 truncate text-[11px] font-medium text-[#9A9DA8]">
          {detail}
        </p>
      </div>

      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${current.bar}`} />
    </div>
  );
}

/* ============================================================
   ACTIVE STRATEGY ROW
   ============================================================ */

function StrategyRow({
  strategy,
  canKill,
  killTarget,
  killReason,
  setKillTarget,
  setKillReason,
  confirmKill,
}: {
  strategy: ActiveStrategySummary;
  canKill: boolean;
  killTarget: string | null;
  killReason: string;
  setKillTarget: (id: string | null) => void;
  setKillReason: (value: string) => void;
  confirmKill: (id: string) => void;
}) {
  const score = strategy.robustness_score ?? null;
  const tone = robustnessTone(score);
  const isKilling = killTarget === strategy.id;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0F1117]/80 ${
        isKilling ? "border-l-2 border-l-[#F87171]" : "border-l-2 border-l-[#8E88C7]"
      }`}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: tone.bg,
              border: `1px solid ${tone.border}`,
            }}
          >
            <Terminal className={`h-4 w-4 ${tone.text}`} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-sm font-semibold text-[#F5F5F7]">
                {strategy.name}
              </h3>

              <span className="rounded-md border border-white/[0.12] bg-white/[0.03] px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-[#808495]">
                ACTIVE
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9A9DA8]">
              <span className="font-mono text-[11px]">{strategy.version}</span>

              <span className="h-1 w-1 rounded-full bg-white/20" />

              <span>
                robustness {score?.toFixed(3) ?? "—"}
              </span>

              <span className={`font-medium ${tone.text}`}>
                {robustnessLabel(score)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {score != null && (
            <div className="hidden min-w-[120px] text-right sm:block">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
                Robustness
              </p>

              <div className="mt-1.5 flex items-center justify-end gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-black/40">
                  <div
                    className={`h-full rounded-full ${
                      score >= 0.8
                        ? "bg-[#34D399]"
                        : score >= 0.7
                          ? "bg-[#38BDF8]"
                          : "bg-[#F87171]"
                    }`}
                    style={{
                      width: `${Math.min(score * 100, 100)}%`,
                    }}
                  />
                </div>

                <span className={`font-mono text-xs font-semibold ${tone.text}`}>
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {canKill && !isKilling && (
            <Button
              size="sm"
              className="h-9 rounded-xl border border-[#F87171]/30 bg-[#F87171]/10 px-3 font-mono text-xs font-medium text-[#F87171] shadow-none hover:bg-[#F87171]/20"
              onClick={() => {
                setKillTarget(strategy.id);
                setKillReason("");
              }}
              data-testid={`kill-${strategy.id}`}
            >
              <Siren className="mr-1.5 h-3.5 w-3.5" />
              Kill switch
            </Button>
          )}
        </div>
      </div>

      {canKill && isKilling && (
        <div className="border-t border-[#F87171]/20 bg-[#F87171]/[0.03] p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-[#F87171]/10 p-1.5">
              <AlertTriangle className="h-4 w-4 text-[#F87171]" />
            </div>

            <div>
              <p className="text-xs font-semibold text-[#F87171]">
                Irreversible strategy termination
              </p>

              <p className="mt-0.5 max-w-3xl text-xs leading-5 text-[#9A9DA8]">
                This immediately retires the strategy and bypasses normal
                lifecycle checks. Reactivation requires a brand-new draft,
                candidate, active run, and fresh approval.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <Label
                htmlFor={`kill-reason-${strategy.id}`}
                className="font-mono text-[10px] uppercase text-[#808495]"
              >
                Reason
              </Label>

              <Input
                id={`kill-reason-${strategy.id}`}
                value={killReason}
                onChange={(e) => setKillReason(e.target.value)}
                placeholder="e.g. anomalous drawdown detected in live trading"
                className="mt-1.5 h-9 border-white/[0.08] bg-[#07080B] text-xs text-[#F5F5F7] focus:border-[#F87171]/40"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                size="sm"
                disabled={!killReason.trim()}
                onClick={() => confirmKill(strategy.id)}
                className="h-9 rounded-xl bg-[#F87171] px-4 text-xs font-semibold text-black hover:bg-[#F87171]/90"
                data-testid={`confirm-kill-${strategy.id}`}
              >
                <ShieldOff className="mr-1.5 h-4 w-4" />
                Confirm kill
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setKillTarget(null)}
                className="h-9 rounded-xl border-white/[0.1] bg-transparent text-xs text-[#9A9DA8] hover:bg-white/[0.04] hover:text-[#F5F5F7]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   APPROVAL QUEUE ITEM
   ============================================================ */

function ApprovalItem({
  candidate,
  decide,
}: {
  candidate: ApprovalQueueItem;
  decide: (strategyId: string, action: "approve" | "reject") => void;
}) {
  const score = candidate.robustness_score ?? null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.08] border-l-2 border-l-[#38BDF8] bg-[#0F1117]/80 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/10">
          <FileCheck2 className="h-4 w-4 text-[#38BDF8]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-[#F5F5F7]">
                {candidate.name}
              </p>

              <p className="mt-0.5 text-xs text-[#9A9DA8]">
                {candidate.creator}
              </p>
            </div>

            <span className="shrink-0 rounded-md border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-[#38BDF8]">
              REVIEW
            </span>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#808495]">
                Robustness
              </p>

              <p className="mt-0.5 font-mono text-base font-bold text-[#F5F5F7]">
                {score?.toFixed(3) ?? "—"}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide(candidate.id, "approve")}
                className="h-8 rounded-lg bg-[#38BDF8] px-3 font-mono text-xs font-semibold text-black hover:bg-[#38BDF8]/90"
                data-testid={`approve-${candidate.id}`}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => decide(candidate.id, "reject")}
                className="h-8 rounded-lg border-white/[0.1] bg-transparent px-3 font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.04] hover:text-[#F5F5F7]"
                data-testid={`reject-${candidate.id}`}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AUDIT EVENT
   ============================================================ */

function AuditEvent({
  row,
}: {
  row: GovernanceAuditLogEntry;
}) {
  const isDanger =
    row.event_type === "kill_switch_activated" ||
    row.event_type === "failed_login";

  const isPositive =
    row.event_type === "strategy_approved" ||
    row.event_type === "evolution_candidate_approved";

  return (
    <div className="relative flex gap-4">
      <div className="relative flex flex-col items-center">
        <div
          className={`
            z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs
            ${
              isDanger
                ? "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                : isPositive
                  ? "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                  : "border-[#8E88C7]/30 bg-[#8E88C7]/10 text-[#8E88C7]"
            }
          `}
        >
          {isDanger ? (
            <AlertTriangle className="h-3 w-3" />
          ) : isPositive ? (
            <Check className="h-3 w-3" />
          ) : (
            <History className="h-3 w-3" />
          )}
        </div>

        <div className="mt-1 h-full w-px bg-white/[0.06]" />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                isDanger
                  ? "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                  : "border-white/[0.08] bg-white/[0.03] text-[#9A9DA8]"
              }`}
            >
              {formatEventType(row.event_type)}
            </span>

            <span className="font-mono text-[10px] text-[#808495]">
              {row.entity_type}:{row.entity_id.slice(0, 8)}
            </span>
          </div>

          <span className="font-mono text-[10px] text-[#808495]">
            {formatDate(row.created_at)}
          </span>
        </div>

        <p className="mt-1.5 text-xs leading-5 text-[#9A9DA8]">
          {row.justification ?? "No justification recorded."}
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   VIEW COMPONENT
   ============================================================ */

export function GovernanceView() {
  const { user } = useAuthStore();

  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadMe().finally(() => setReady(true));
  }, []);

  const role = user?.role ?? "";

  const canView = VIEW_ROLES.has(role);
  const canKill = KILL_SWITCH_ROLES.has(role);
  const canSeeCompliance = COMPLIANCE_ROLES.has(role);

  const [activeStrategies, setActiveStrategies] = useState<
    ActiveStrategySummary[]
  >([]);

  const [queue, setQueue] = useState<ApprovalQueueItem[]>([]);
  const [killTarget, setKillTarget] = useState<string | null>(null);
  const [killReason, setKillReason] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [auditItems, setAuditItems] = useState<
    GovernanceAuditLogEntry[]
  >([]);

  const [auditTotal, setAuditTotal] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  const [exportStart, setExportStart] = useState("2026-01-01");
  const [exportEnd, setExportEnd] = useState("2026-12-31");

  const [exportFormat, setExportFormat] =
    useState<ComplianceExportFormat>("json");

  const [exportJob, setExportJob] =
    useState<ComplianceExportJob | null>(null);

  /* ============================================================
     DATA LOADING
     ============================================================ */

  const loadViews = useCallback(async () => {
    if (!canView) return;

    try {
      setError(null);

      const [active, pending] = await Promise.all([
        getActiveStrategies(),
        getApprovalQueue(),
      ]);

      setActiveStrategies(active.items);
      setQueue(pending.items);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load governance views",
      );
    }
  }, [canView]);

  const loadAuditLog = useCallback(async () => {
    if (!canSeeCompliance) return;

    try {
      const res = await getGovernanceAuditLog({
        event_type: eventTypeFilter || undefined,
        limit: 50,
      });

      setAuditItems(res.items);
      setAuditTotal(res.total);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load audit log",
      );
    }
  }, [canSeeCompliance, eventTypeFilter]);

  useEffect(() => {
    if (ready) {
      loadViews();
    }
  }, [ready, loadViews]);

  useEffect(() => {
    if (ready) {
      loadAuditLog();
    }
  }, [ready, loadAuditLog]);

  /* ============================================================
     ACTIONS
     ============================================================ */

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
      setError(
        e instanceof Error ? e.message : "Kill switch failed",
      );
    }
  }

  async function decide(
    strategyId: string,
    action: "approve" | "reject",
  ) {
    setError(null);
    setMessage(null);

    try {
      await approveOrRejectStrategy(
        strategyId,
        action,
        `${action}d from the Governance Panel`,
      );

      setMessage(
        action === "approve"
          ? "Strategy approved successfully."
          : "Strategy rejected.",
      );

      await loadViews();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Failed to ${action}`,
      );
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

      setExportJob(
        await getComplianceExportJob(enqueued.job_id),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to enqueue export",
      );
    }
  }

  async function pollExport() {
    if (!exportJob) return;

    try {
      setExportJob(
        await getComplianceExportJob(exportJob.id),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to poll export job",
      );
    }
  }

  async function downloadExport() {
    if (!exportJob) return;

    try {
      await downloadComplianceExport(
        exportJob.id,
        exportJob.export_format,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to download export",
      );
    }
  }

  /* ============================================================
     LOADING
     ============================================================ */

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 px-5 py-5 backdrop-blur-xl">
          <RefreshCw className="h-4 w-4 animate-spin text-[#8E88C7]" />
          <p className="text-xs text-[#9A9DA8]">
            Loading governance controls…
          </p>
        </div>
      </div>
    );
  }

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      {/* BACKGROUND ATMOSPHERICS */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl space-y-6">

        {/* HEADER */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34D399] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#34D399]" />
              </span>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
                Quantix Intelligence • Control Room
              </p>
            </div>

            <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
              Governance & Compliance
            </h1>

            <p className="mt-1 text-xs text-[#9A9DA8]">
              Monitor strategy authority, approvals, irreversible kill switches,
              and institutional audit trails.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
              style={{
                boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
              <span className="text-[10px] text-[#808495]">ROLE:</span>
              <span>{role || "unauthenticated"}</span>
            </div>
          </div>
        </div>

        {/* PORTFOLIO STATUS CARDS (STATIC LAYOUT) */}
        {canView && (
          <div
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <div className="grid divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <ControlMetric
                label="Portfolio Sharpe"
                value="0.37"
                detail="risk-adjusted return"
                icon={Activity}
                tone="blue"
              />

              <ControlMetric
                label="Max Drawdown"
                value="-21.7%"
                detail="maximum portfolio decline"
                icon={ArrowDownRight}
                tone="red"
              />

              <ControlMetric
                label="Active Strategies"
                value="4"
                detail="currently in portfolio"
                icon={Zap}
                tone="mint"
              />

              <ControlMetric
                label="Risk Alerts"
                value="4"
                detail="requires attention"
                icon={AlertTriangle}
                tone="red"
              />
            </div>
          </div>
        )}

        {/* ERROR / SUCCESS ALERTS */}
        {(error || message) && (
          <div
            className="flex items-start gap-3 rounded-2xl border p-4 text-xs font-medium shadow-lg backdrop-blur-md"
            style={{
              backgroundColor: error
                ? "rgba(248, 113, 113, 0.08)"
                : "rgba(52, 211, 153, 0.08)",
              borderColor: error
                ? "rgba(248, 113, 113, 0.25)"
                : "rgba(52, 211, 153, 0.25)",
              color: error ? "#F87171" : "#34D399",
            }}
          >
            {error ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            )}

            <p>{error ?? message}</p>
          </div>
        )}

        {/* ACCESS RESTRICTED STATE */}
        {!canView && (
          <div
            className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-6 text-center backdrop-blur-xl"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.1] bg-[#0F1117]">
              <LockKeyhole className="h-5 w-5 text-[#808495]" />
            </div>

            <h2 className="mt-4 text-base font-bold text-[#F5F5F7]">
              Governance access restricted
            </h2>

            <p className="mt-1 max-w-md text-xs text-[#9A9DA8]">
              Your current role does not have access to the governance
              control room. Authorized roles include risk_manager, cio,
              compliance_officer, and admin.
            </p>
          </div>
        )}

        {/* MAIN CONTROL ROOM */}
        {canView && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]">

            {/* ACTIVE STRATEGIES */}
            <section
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] p-5">
                <div>
                  <SectionEyebrow icon={Siren}>
                    Live control
                  </SectionEyebrow>

                  <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Active strategies
                  </h2>

                  <p className="mt-0.5 text-xs text-[#808495]">
                    {canKill
                      ? "Irreversible kill controls for currently active strategies."
                      : "Read-only strategy governance for your role."}
                  </p>
                </div>

                <div className="hidden items-center gap-2 sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                  <span className="font-mono text-[10px] uppercase text-[#808495]">
                    {activeStrategies.length} live
                  </span>
                </div>
              </div>

              <div className="p-4">
                {activeStrategies.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0F1117] p-3.5">
                      <ShieldCheck className="h-6 w-6 text-[#808495]" />
                    </div>

                    <p className="mt-3 text-xs font-semibold text-[#F5F5F7]">
                      No active strategies
                    </p>

                    <p className="mt-0.5 text-[11px] text-[#808495]">
                      The active strategy surface is currently clear.
                    </p>
                  </div>
                ) : (
                  <div
                    className="space-y-3"
                    data-testid="active-strategies"
                  >
                    {activeStrategies.map((strategy) => (
                      <StrategyRow
                        key={strategy.id}
                        strategy={strategy}
                        canKill={canKill}
                        killTarget={killTarget}
                        killReason={killReason}
                        setKillTarget={setKillTarget}
                        setKillReason={setKillReason}
                        confirmKill={confirmKill}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* APPROVAL QUEUE */}
            <section
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] p-5">
                <div>
                  <SectionEyebrow icon={UserCheck}>
                    Decision queue
                  </SectionEyebrow>

                  <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Approval queue
                  </h2>

                  <p className="mt-0.5 text-xs text-[#808495]">
                    Candidates awaiting governance decision.
                  </p>
                </div>

                <div className="flex h-8 min-w-8 items-center justify-center rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 font-mono text-xs font-bold text-[#38BDF8]">
                  {queue.length}
                </div>
              </div>

              <div className="p-4">
                {queue.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#34D399]/30 bg-[#34D399]/10">
                      <Check className="h-5 w-5 text-[#34D399]" />
                    </div>

                    <p className="mt-3 text-xs font-semibold text-[#F5F5F7]">
                      Queue is clear
                    </p>

                    <p className="mt-0.5 max-w-xs text-[11px] text-[#808495]">
                      No candidates are currently waiting for approval.
                    </p>
                  </div>
                ) : (
                  <div
                    className="space-y-3"
                    data-testid="approval-queue"
                  >
                    {queue.map((candidate) => (
                      <ApprovalItem
                        key={candidate.id}
                        candidate={candidate}
                        decide={decide}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* AUDIT TRAIL */}
        {canSeeCompliance && (
          <section
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <div className="border-b border-white/[0.06] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <SectionEyebrow icon={History}>
                    Institutional record
                  </SectionEyebrow>

                  <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Governance audit trail
                  </h2>

                  <p className="mt-0.5 text-xs text-[#808495]">
                    {auditTotal} total organization-wide events recorded.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={eventTypeFilter}
                    onChange={(e) =>
                      setEventTypeFilter(e.target.value)
                    }
                    className="h-9 rounded-xl border border-white/[0.08] bg-[#0F1117] px-3 font-mono text-xs text-[#F5F5F7] outline-none focus:border-[#8E88C7]"
                    data-testid="filter-event-type"
                  >
                    <option value="">
                      All event types
                    </option>

                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {formatEventType(type)}
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadAuditLog}
                    className="h-9 rounded-xl border-white/[0.08] bg-[#0F1117] font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.04] hover:text-[#F5F5F7]"
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-5">
              {auditItems.length === 0 ? (
                <div className="py-12 text-center">
                  <History className="mx-auto h-6 w-6 text-[#808495]" />

                  <p className="mt-2 text-xs font-semibold text-[#F5F5F7]">
                    No audit events found
                  </p>

                  <p className="mt-0.5 text-[11px] text-[#808495]">
                    Try changing the event filter.
                  </p>
                </div>
              ) : (
                <div
                  className="max-h-[480px] overflow-y-auto pr-2"
                  data-testid="governance-audit-log-table"
                >
                  <div className="space-y-0">
                    {auditItems.map((row) => (
                      <AuditEvent key={row.id} row={row} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* COMPLIANCE EXPORT */}
        {canSeeCompliance && (
          <section
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <div className="grid lg:grid-cols-[1fr_320px]">
              <div className="p-6">
                <SectionEyebrow icon={Download}>
                  Compliance archive
                </SectionEyebrow>

                <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  Export governance record
                </h2>

                <p className="mt-0.5 max-w-xl text-xs text-[#808495]">
                  Generate an immutable report of governance activity for a selected date range in JSON or PDF formats.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label
                      htmlFor="export-start"
                      className="font-mono text-[10px] uppercase text-[#808495]"
                    >
                      Start date
                    </Label>

                    <Input
                      id="export-start"
                      type="date"
                      className="mt-1.5 h-9 border-white/[0.08] bg-[#0F1117] font-mono text-xs text-[#F5F5F7]"
                      value={exportStart}
                      onChange={(e) =>
                        setExportStart(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="export-end"
                      className="font-mono text-[10px] uppercase text-[#808495]"
                    >
                      End date
                    </Label>

                    <Input
                      id="export-end"
                      type="date"
                      className="mt-1.5 h-9 border-white/[0.08] bg-[#0F1117] font-mono text-xs text-[#F5F5F7]"
                      value={exportEnd}
                      onChange={(e) =>
                        setExportEnd(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="export-format"
                      className="font-mono text-[10px] uppercase text-[#808495]"
                    >
                      Format
                    </Label>

                    <select
                      id="export-format"
                      value={exportFormat}
                      onChange={(e) =>
                        setExportFormat(
                          e.target.value as ComplianceExportFormat,
                        )
                      }
                      className="mt-1.5 h-9 w-full rounded-xl border border-white/[0.08] bg-[#0F1117] px-3 font-mono text-xs text-[#F5F5F7] outline-none"
                    >
                      <option value="json">JSON</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="relative border-t border-white/[0.06] bg-[#0F1117]/80 p-6 lg:border-l lg:border-t-0">
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/10">
                      <FileText className="h-5 w-5 text-[#8E88C7]" />
                    </div>

                    <p className="mt-4 text-xs font-semibold text-[#F5F5F7]">
                      Compliance package
                    </p>

                    <p className="mt-0.5 text-[11px] text-[#808495]">
                      Includes governance events and audit metadata.
                    </p>
                  </div>

                  <Button
                    onClick={submitExport}
                    className="mt-6 h-9 rounded-xl bg-[#8E88C7] px-4 font-mono text-xs font-semibold text-black hover:bg-[#8E88C7]/90"
                    data-testid="submit-export"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Generate export
                  </Button>
                </div>
              </div>
            </div>

            {exportJob && (
              <div className="border-t border-white/[0.06] bg-[#0F1117] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-[#38BDF8]/20 bg-[#38BDF8]/10 p-2">
                      <FileCheck2 className="h-4 w-4 text-[#38BDF8]" />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-[#F5F5F7]">
                        Export job{" "}
                        <span className="font-mono text-[11px] text-[#808495]">
                          {exportJob.id.slice(0, 8)}
                        </span>
                      </p>

                      <p className="mt-0.5 font-mono text-[11px] text-[#808495]">
                        {exportJob.export_format.toUpperCase()} ·{" "}
                        {exportJob.start_date} →{" "}
                        {exportJob.end_date}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={pollExport}
                      className="h-8 rounded-lg border-white/[0.08] bg-[#0F1117] font-mono text-xs text-[#9A9DA8]"
                      data-testid="poll-export"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Refresh
                    </Button>

                    {exportJob.status === "completed" && (
                      <Button
                        size="sm"
                        onClick={downloadExport}
                        className="h-8 rounded-lg bg-[#38BDF8] font-mono text-xs font-semibold text-black hover:bg-[#38BDF8]/90"
                        data-testid="download-export"
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>

                {exportJob.error && (
                  <div className="mt-3 rounded-lg border border-[#F87171]/20 bg-[#F87171]/5 px-3 py-2">
                    <p className="text-xs text-[#F87171]">
                      {exportJob.error}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* FOOTER */}
        <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#34D399]" />
            <span className="text-xs text-[#808495]">
              Governance controls are enforced by the backend role policy.
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#808495]">
            <span>Quantix</span>
            <ChevronRight className="h-3 w-3" />
            <span>Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
}