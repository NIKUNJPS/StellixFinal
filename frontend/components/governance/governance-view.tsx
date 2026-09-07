"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type LucideIcon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  History,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Siren,
  Terminal,
  UserCheck,
  X,
  Zap,
  Activity,
} from "lucide-react";

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
      text: "text-muted-foreground",
      bg: "bg-white/[0.03]",
      border: "border-white/10",
    };
  }

  if (score >= 0.8) {
    return {
      text: "text-[#8dd8b8]",
      bg: "bg-[#8dd8b8]/10",
      border: "border-[#8dd8b8]/20",
    };
  }

  if (score >= 0.7) {
    return {
      text: "text-[#74b9df]",
      bg: "bg-[#074068]/30",
      border: "border-[#074068]/50",
    };
  }

  return {
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
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
    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a9ba3]">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

/* ============================================================
   CONTROL STRIP
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
      icon: "text-[#74b9df]",
      dot: "bg-[#074068]",
    },
    mint: {
      icon: "text-[#8dd8b8]",
      dot: "bg-[#8dd8b8]",
    },
    red: {
      icon: "text-red-400",
      dot: "bg-red-500",
    },
    neutral: {
      icon: "text-[#9eabb1]",
      dot: "bg-[#6b7b83]",
    },
  };

  const current = tones[tone];

  return (
    <div className="relative flex min-w-0 items-center gap-3 px-5 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.035]">
        <Icon className={`h-4 w-4 ${current.icon}`} />
      </div>

      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[#7f9098]">
          {label}
        </p>

        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight text-[#e5ecee]">
            {value}
          </span>

          <span className="truncate text-[10px] text-[#718189]">
            {detail}
          </span>
        </div>
      </div>

      <span
        className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${current.dot}`}
      />
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
      className={`
        group relative overflow-hidden rounded-2xl
        border transition-all duration-300
        ${
          isKilling
            ? "border-red-500/40 bg-red-500/[0.035]"
            : "border-white/[0.07] bg-[#16232B] hover:border-[#074068]/60 hover:bg-[#192a33]"
        }
      `}
    >
      <div className="absolute left-0 top-0 h-full w-[2px] bg-[#074068]/0 transition-all duration-300 group-hover:bg-[#074068]" />

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={`
              flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
              border ${tone.border} ${tone.bg}
            `}
          >
            <Terminal className={`h-4 w-4 ${tone.text}`} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-sm font-semibold text-[#e3eaec]">
                {strategy.name}
              </h3>

              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-medium tracking-wide text-[#82929a]">
                ACTIVE
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#72838b]">
              <span>{strategy.version}</span>

              <span className="h-1 w-1 rounded-full bg-[#52626a]" />

              <span>
                robustness {score?.toFixed(3) ?? "—"}
              </span>

              <span className={tone.text}>
                {robustnessLabel(score)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {score != null && (
            <div className="hidden min-w-[120px] text-right sm:block">
              <p className="text-[9px] uppercase tracking-[0.14em] text-[#687980]">
                Robustness
              </p>

              <div className="mt-1.5 flex items-center justify-end gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#0e181e]">
                  <div
                    className={`h-full rounded-full ${
                      score >= 0.8
                        ? "bg-[#8dd8b8]"
                        : score >= 0.7
                          ? "bg-[#074068]"
                          : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(score * 100, 100)}%`,
                    }}
                  />
                </div>

                <span className={`text-xs font-semibold ${tone.text}`}>
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {canKill && !isKilling && (
            <Button
              size="sm"
              className="
                h-9 rounded-lg
                border border-red-500/20
                bg-red-500/10
                px-3
                text-xs font-semibold text-red-300
                shadow-none
                hover:bg-red-500/20
              "
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
        <div className="border-t border-red-500/20 bg-red-500/[0.025] p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-red-500/10 p-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>

            <div>
              <p className="text-sm font-medium text-red-300">
                Irreversible strategy termination
              </p>

              <p className="mt-1 max-w-3xl text-xs leading-5 text-[#7f9098]">
                This immediately retires the strategy and bypasses the normal
                lifecycle checks. Reactivation requires a brand-new draft,
                candidate, active run and fresh approval.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <Label
                htmlFor={`kill-reason-${strategy.id}`}
                className="text-xs text-[#83939a]"
              >
                Reason
              </Label>

              <Input
                id={`kill-reason-${strategy.id}`}
                value={killReason}
                onChange={(e) => setKillReason(e.target.value)}
                placeholder="e.g. anomalous drawdown detected in live trading"
                className="mt-1.5 h-10 border-red-500/20 bg-[#101a20]"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                size="sm"
                disabled={!killReason.trim()}
                onClick={() => confirmKill(strategy.id)}
                className="
                  h-10 rounded-lg
                  bg-red-600
                  px-4
                  font-semibold
                  text-white
                  hover:bg-red-600/90
                "
                data-testid={`confirm-kill-${strategy.id}`}
              >
                <ShieldOff className="mr-1.5 h-4 w-4" />
                Confirm kill
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setKillTarget(null)}
                className="h-10 rounded-lg border-white/10 bg-transparent"
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
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#16232B] p-4 transition-all duration-300 hover:border-[#074068]/60 hover:bg-[#192a33]">
      <div className="absolute right-0 top-0 h-full w-[2px] bg-[#074068] opacity-30" />

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#074068]/20">
          <FileCheck2 className="h-4 w-4 text-[#74b9df]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-[#e2e9eb]">
                {candidate.name}
              </p>

              <p className="mt-1 text-xs text-[#718189]">
                {candidate.creator}
              </p>
            </div>

            <span className="shrink-0 rounded-full border border-[#074068]/40 bg-[#074068]/15 px-2 py-1 text-[9px] font-medium tracking-wide text-[#74b9df]">
              REVIEW
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-[#687980]">
                Robustness
              </p>

              <p className="mt-1 text-lg font-semibold text-[#dce5e7]">
                {score?.toFixed(3) ?? "—"}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide(candidate.id, "approve")}
                className="
                  h-9 rounded-lg
                  bg-[#074068]
                  px-3
                  text-xs font-semibold
                  text-white
                  shadow-none
                  hover:bg-[#074068]/85
                "
                data-testid={`approve-${candidate.id}`}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Approve
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => decide(candidate.id, "reject")}
                className="
                  h-9 rounded-lg
                  border-white/10
                  bg-transparent
                  px-3
                  text-xs
                  hover:bg-white/[0.04]
                "
                data-testid={`reject-${candidate.id}`}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
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
    <div className="group relative flex gap-4">
      <div className="relative flex flex-col items-center">
        <div
          className={`
            z-10 flex h-8 w-8 items-center justify-center rounded-full border
            ${
              isDanger
                ? "border-red-500/25 bg-red-500/10 text-red-400"
                : isPositive
                  ? "border-[#8dd8b8]/20 bg-[#8dd8b8]/10 text-[#8dd8b8]"
                  : "border-[#074068]/30 bg-[#074068]/20 text-[#74b9df]"
            }
          `}
        >
          {isDanger ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : isPositive ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <History className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="mt-1 h-full w-px bg-white/[0.07]" />
      </div>

      <div className="min-w-0 flex-1 pb-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`
                rounded-full border px-2 py-0.5
                text-[10px] font-medium
                ${
                  isDanger
                    ? "border-red-500/20 bg-red-500/5 text-red-300"
                    : "border-white/10 bg-white/[0.02] text-[#87969d]"
                }
              `}
            >
              {formatEventType(row.event_type)}
            </span>

            <span className="font-mono text-[10px] text-[#687980]">
              {row.entity_type}:{row.entity_id.slice(0, 8)}
            </span>
          </div>

          <span className="text-[10px] text-[#687980]">
            {formatDate(row.created_at)}
          </span>
        </div>

        <p className="mt-2 text-xs leading-5 text-[#829198]">
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

  const [exportStart, setExportStart] =
    useState("2026-01-01");

  const [exportEnd, setExportEnd] =
    useState("2026-12-31");

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

      setMessage(
        "Kill switch activated — strategy retired.",
      );

      setKillTarget(null);
      setKillReason("");

      await loadViews();
      await loadAuditLog();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Kill switch failed",
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
        e instanceof Error
          ? e.message
          : `Failed to ${action}`,
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
        await getComplianceExportJob(
          enqueued.job_id,
        ),
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
     DERIVED METRICS
     ============================================================ */

  const averageRobustness = useMemo(() => {
    if (activeStrategies.length === 0) return 0;

    const valid = activeStrategies
      .map((s) => s.robustness_score)
      .filter(
        (value): value is number =>
          typeof value === "number",
      );

    if (valid.length === 0) return 0;

    return (
      valid.reduce((sum, value) => sum + value, 0) /
      valid.length
    );
  }, [activeStrategies]);

  const highRiskCount = useMemo(() => {
    return activeStrategies.filter(
      (s) =>
        typeof s.robustness_score === "number" &&
        s.robustness_score < 0.6,
    ).length;
  }, [activeStrategies]);

  /* ============================================================
     LOADING
     ============================================================ */

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#16232B] px-5 py-5">
          <RefreshCw className="h-4 w-4 animate-spin text-[#74b9df]" />

          <p className="text-sm text-[#829198]">
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
    <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-6">

        {/* HEADER */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8189]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#8dd8b8]" />
              Governance control room
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-[#e6edef]">
              Governance & Compliance
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7e9098]">
              Monitor strategy authority, approvals, irreversible controls,
              and the organization&apos;s research audit trail from one place.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[#8dd8b8]/15 bg-[#8dd8b8]/5 px-3.5 py-2">
              <span className="h-2 w-2 rounded-full bg-[#8dd8b8] shadow-[0_0_10px_rgba(141,216,184,0.7)]" />

              <span className="text-xs font-medium text-[#8dd8b8]">
                Governance active
              </span>
            </div>

            <div className="text-right">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#64757d]">
                Current role
              </p>

              <p className="mt-0.5 text-xs font-medium text-[#c3ced1]">
                {role || "unauthenticated"}
              </p>
            </div>
          </div>
        </div>

        {/* STATUS STRIP */}
        {canView && (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#16232B]">
            <div className="grid divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <ControlMetric
                label="Active strategies"
                value={activeStrategies.length}
                detail="currently authorized"
                icon={Zap}
                tone="blue"
              />

              <ControlMetric
                label="Pending approvals"
                value={queue.length}
                detail="awaiting decision"
                icon={Clock3}
                tone={queue.length > 0 ? "blue" : "mint"}
              />

              <ControlMetric
                label="Avg robustness"
                value={
                  activeStrategies.length
                    ? averageRobustness.toFixed(3)
                    : "—"
                }
                detail="active strategy mean"
                icon={Activity}
                tone="mint"
              />

              <ControlMetric
                label="Risk signals"
                value={highRiskCount}
                detail="below 0.60 robustness"
                icon={AlertTriangle}
                tone={highRiskCount > 0 ? "red" : "mint"}
              />
            </div>
          </div>
        )}

        {/* ERROR / SUCCESS */}
        {(error || message) && (
          <div
            className={`
              flex items-start gap-3 rounded-xl border px-4 py-3
              ${
                error
                  ? "border-red-500/25 bg-red-500/5"
                  : "border-[#8dd8b8]/20 bg-[#8dd8b8]/5"
              }
            `}
          >
            {error ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8dd8b8]" />
            )}

            <p
              className={`text-xs ${
                error
                  ? "text-red-300"
                  : "text-[#8dd8b8]"
              }`}
            >
              {error ?? message}
            </p>
          </div>
        )}

        {/* ACCESS RESTRICTED */}
        {!canView && (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-[#16232B] px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025]">
              <LockKeyhole className="h-6 w-6 text-[#65767e]" />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-[#dfe7e9]">
              Governance access restricted
            </h2>

            <p className="mt-2 max-w-md text-sm leading-6 text-[#7b8c94]">
              Your current role does not have access to the governance
              control room. Authorized roles include risk_manager, cio,
              compliance_officer and admin.
            </p>
          </div>
        )}

        {/* MAIN CONTROL ROOM */}
        {canView && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]">

            {/* ACTIVE STRATEGIES */}
            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#16232B]">
              <div className="border-b border-white/[0.06] px-5 py-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <SectionEyebrow icon={Siren}>
                      Live control
                    </SectionEyebrow>

                    <h2 className="text-xl font-semibold text-[#e2e9eb]">
                      Active strategies
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[#74858d]">
                      {canKill
                        ? "Irreversible kill controls for currently active strategies."
                        : "Read-only strategy governance for your role."}
                    </p>
                  </div>

                  <div className="hidden items-center gap-2 sm:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8dd8b8] shadow-[0_0_8px_rgba(141,216,184,0.6)]" />

                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#718189]">
                      {activeStrategies.length} live
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-4">
                {activeStrategies.length === 0 ? (
                  <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <ShieldCheck className="h-7 w-7 text-[#63747c]" />
                    </div>

                    <p className="mt-4 text-sm font-medium text-[#cbd5d8]">
                      No active strategies
                    </p>

                    <p className="mt-1 text-xs text-[#718189]">
                      The active strategy surface is currently clear.
                    </p>
                  </div>
                ) : (
                  <div
                    className="space-y-2"
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
            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#16232B]">
              <div className="border-b border-white/[0.06] px-5 py-5">
                <SectionEyebrow icon={UserCheck}>
                  Decision queue
                </SectionEyebrow>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-[#e2e9eb]">
                      Approval queue
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[#74858d]">
                      Candidates awaiting a governance decision.
                    </p>
                  </div>

                  <div
                    className="
                      flex h-11 min-w-11 items-center justify-center
                      rounded-2xl border border-[#074068]/40
                      bg-[#074068]/20 px-3
                      text-lg font-bold text-[#74b9df]
                    "
                  >
                    {queue.length}
                  </div>
                </div>
              </div>

              <div className="p-4">
                {queue.length === 0 ? (
                  <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#8dd8b8]/15 bg-[#8dd8b8]/5">
                      <Check className="h-6 w-6 text-[#8dd8b8]" />
                    </div>

                    <p className="mt-4 text-sm font-medium text-[#d2dcde]">
                      Queue is clear
                    </p>

                    <p className="mt-1 max-w-xs text-xs leading-5 text-[#718189]">
                      No candidates are currently waiting for approval.
                    </p>
                  </div>
                ) : (
                  <div
                    className="space-y-2"
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
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#16232B]">
            <div className="border-b border-white/[0.06] px-5 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <SectionEyebrow icon={History}>
                    Institutional record
                  </SectionEyebrow>

                  <h2 className="text-xl font-semibold text-[#e2e9eb]">
                    Governance audit trail
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-[#74858d]">
                    {auditTotal} total organization-wide events recorded.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={eventTypeFilter}
                    onChange={(e) =>
                      setEventTypeFilter(e.target.value)
                    }
                    className="
                      h-9 rounded-lg
                      border border-white/10
                      bg-[#101a20]
                      px-3
                      text-xs
                      text-[#c8d2d5]
                      outline-none
                      transition-colors
                      focus:border-[#074068]
                    "
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
                    className="
                      h-9 rounded-lg
                      border-white/10
                      bg-transparent
                      text-[#aebbc0]
                      hover:bg-white/[0.04]
                    "
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-5">
              {auditItems.length === 0 ? (
                <div className="py-14 text-center">
                  <History className="mx-auto h-7 w-7 text-[#596a72]" />

                  <p className="mt-3 text-sm font-medium text-[#cbd5d8]">
                    No audit events found
                  </p>

                  <p className="mt-1 text-xs text-[#718189]">
                    Try changing the event filter.
                  </p>
                </div>
              ) : (
                <div
                  className="max-h-[520px] overflow-y-auto pr-2"
                  data-testid="governance-audit-log-table"
                >
                  <div className="space-y-0">
                    {auditItems.map((row) => (
                      <AuditEvent
                        key={row.id}
                        row={row}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* COMPLIANCE EXPORT — COMMAND PANEL */}
        {canSeeCompliance && (
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#16232B]">
            <div className="grid lg:grid-cols-[1fr_320px]">

              <div className="p-6 sm:p-7">
                <SectionEyebrow icon={Download}>
                  Compliance archive
                </SectionEyebrow>

                <h2 className="text-xl font-semibold text-[#e2e9eb]">
                  Export governance record
                </h2>

                <p className="mt-1 max-w-xl text-sm leading-6 text-[#74858d]">
                  Generate an immutable report of governance activity for
                  a selected date range. Available as structured JSON or
                  a formatted PDF report.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label
                      htmlFor="export-start"
                      className="text-xs text-[#7d8e96]"
                    >
                      Start date
                    </Label>

                    <Input
                      id="export-start"
                      type="date"
                      className="mt-1.5 h-10 border-white/10 bg-[#101a20]"
                      value={exportStart}
                      onChange={(e) =>
                        setExportStart(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="export-end"
                      className="text-xs text-[#7d8e96]"
                    >
                      End date
                    </Label>

                    <Input
                      id="export-end"
                      type="date"
                      className="mt-1.5 h-10 border-white/10 bg-[#101a20]"
                      value={exportEnd}
                      onChange={(e) =>
                        setExportEnd(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="export-format"
                      className="text-xs text-[#7d8e96]"
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
                      className="
                        mt-1.5 h-10 w-full
                        rounded-lg
                        border border-white/10
                        bg-[#101a20]
                        px-3
                        text-xs
                        text-[#c8d2d5]
                        outline-none
                      "
                    >
                      <option value="json">
                        JSON
                      </option>

                      <option value="pdf">
                        PDF
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden border-t border-white/[0.06] bg-[#101a20] p-6 lg:border-l lg:border-t-0">
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#074068]/20 blur-3xl" />

                <div className="relative flex h-full flex-col justify-between">
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#074068]/30 bg-[#074068]/20">
                      <FileText className="h-5 w-5 text-[#74b9df]" />
                    </div>

                    <p className="mt-5 text-sm font-medium text-[#d5dfe1]">
                      Compliance package
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[#718189]">
                      Includes governance events and audit metadata.
                    </p>
                  </div>

                  <Button
                    onClick={submitExport}
                    className="
                      mt-8 h-10 rounded-lg
                      bg-[#074068]
                      px-4
                      font-semibold
                      text-white
                      shadow-none
                      hover:bg-[#074068]/85
                    "
                    data-testid="submit-export"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Generate export
                  </Button>
                </div>
              </div>
            </div>

            {exportJob && (
              <div className="border-t border-white/[0.06] bg-[#101a20] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-[#074068]/20 p-2">
                      <FileCheck2 className="h-4 w-4 text-[#74b9df]" />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-[#d5dfe1]">
                        Export job{" "}
                        <span className="font-mono text-xs text-[#718189]">
                          {exportJob.id.slice(0, 8)}
                        </span>
                      </p>

                      <p className="mt-1 text-xs text-[#718189]">
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
                      className="h-8 rounded-lg border-white/10"
                      data-testid="poll-export"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Refresh
                    </Button>

                    {exportJob.status === "completed" && (
                      <Button
                        size="sm"
                        onClick={downloadExport}
                        className="
                          h-8 rounded-lg
                          bg-[#074068]
                          hover:bg-[#074068]/85
                        "
                        data-testid="download-export"
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>

                {exportJob.error && (
                  <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                    <p className="text-xs text-red-300">
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
            <ShieldCheck className="h-4 w-4 text-[#8dd8b8]" />

            <span className="text-xs text-[#718189]">
              Governance controls are enforced by the backend role policy.
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#596a72]">
            <span>Stellix</span>
            <ChevronRight className="h-3 w-3" />
            <span>Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
}
