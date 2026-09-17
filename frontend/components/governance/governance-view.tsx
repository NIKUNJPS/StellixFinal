"use client";

import {
  type LucideIcon,
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  History,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Siren,
  Terminal,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KillSwitchReviewQueue } from "@/components/governance/kill-switch-review-queue";
import { MemberPicker } from "@/components/members/member-picker";
import { useCan, useCanAny } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadMe } from "@/lib/auth";
import {
  createComplianceExport,
  downloadComplianceExport,
  getApprovalQueue,
  getComplianceExportJob,
  getGovernanceAuditLog,
  getStrategyControls,
  killSwitch,
  listComplianceExports,
} from "@/lib/governance";
import {
  AUDIT_EVENT_TYPES,
  type ApprovalQueueItem,
  type AuditLogScope,
  type ComplianceExportFormat,
  type ComplianceExportJob,
  type GovernanceAuditLogEntry,
  type StrategyControlItem,
} from "@/lib/governance-types";
import { formatRole, listOrganizationMembers, type OrganizationMember } from "@/lib/members";
import { getPortfolioOverview } from "@/lib/portfolio";
import type { PortfolioOverview } from "@/lib/portfolio-types";
import { approveOrRejectStrategy } from "@/lib/strategy";
import { AUDIT_VIEW_PERMS, PERM } from "@/lib/rbac";
import { useAuthStore } from "@/store/auth-store";

/* ============================================================
   ACCESS — Batch 26: permission keys (app/rbac/catalog.py), enforced again server-side
   ============================================================ */

const AUDIT_PAGE_SIZE = 25;
const EXPORT_POLL_MS = 3000;
const REVIEW_WINDOW_DAYS = 14;

const SCOPE_NOTE: Record<AuditLogScope, string> = {
  organization: "Every recorded event in your organization.",
  risk_actions: "Risk, approval and kill switch events across your organization.",
  own_risk_actions: "Your own risk, approval and kill switch actions.",
};

/* ============================================================
   HELPERS
   ============================================================ */

function formatEventType(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}

function robustnessTone(score?: number | null) {
  if (score == null) return { text: "text-[#808495]", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" };
  if (score >= 0.8) return { text: "text-[#34D399]", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" };
  if (score >= 0.7) return { text: "text-[#38BDF8]", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.25)" };
  return { text: "text-[#F87171]", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)" };
}

const STATUS_BADGE: Record<StrategyControlItem["status"], string> = {
  active: "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]",
  candidate: "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FBBF24]",
  failed: "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]",
  draft: "border-white/[0.12] bg-white/[0.03] text-[#9A9DA8]",
  retired: "border-white/[0.08] bg-white/[0.02] text-[#808495]",
};

const cardClass =
  "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

function SectionEyebrow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
      <Icon className="h-3.5 w-3.5 text-[#8E88C7]" />
      {children}
    </div>
  );
}

function Alert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const error = tone === "error";
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-4 text-xs font-medium"
      style={{
        backgroundColor: error ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
        borderColor: error ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)",
        color: error ? "#F87171" : "#34D399",
      }}
      role={error ? "alert" : "status"}
    >
      {error ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
      <p>{children}</p>
    </div>
  );
}

/* ============================================================
   PORTFOLIO METRICS — real numbers from the Batch 20 portfolio service
   (previously hardcoded placeholder values)
   ============================================================ */

const ControlMetric = memo(function ControlMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "blue" | "mint" | "red";
}) {
  const colors = { blue: "#38BDF8", mint: "#34D399", red: "#F87171" }[tone];
  return (
    <div className="relative flex min-w-0 items-center gap-4 bg-[#0D0F14]/70 px-5 py-5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${colors}1F`, border: `1px solid ${colors}40` }}
      >
        <Icon className="h-4 w-4" style={{ color: colors }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#F5F5F7]">{value}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium text-[#9A9DA8]">{detail}</p>
      </div>
    </div>
  );
});

const PortfolioMetrics = memo(function PortfolioMetrics() {
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPortfolioOverview()
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : "Portfolio metrics unavailable"));
  }, []);

  if (error) return <Alert tone="error">Portfolio metrics unavailable: {error}</Alert>;

  const critical = overview?.risk_alerts.filter((a) => a.severity === "critical").length ?? 0;
  return (
    <div className={cardClass} data-testid="governance-portfolio-metrics">
      <div className="grid divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <ControlMetric
          label="Portfolio Sharpe"
          value={overview?.portfolio_sharpe != null ? overview.portfolio_sharpe.toFixed(2) : "—"}
          detail="equal-weighted, active strategies"
          icon={Activity}
          tone="blue"
        />
        <ControlMetric
          label="Max Drawdown"
          value={
            overview?.portfolio_max_drawdown != null ? formatPct(overview.portfolio_max_drawdown * 100) : "—"
          }
          detail="combined equity curve"
          icon={ArrowDownRight}
          tone="red"
        />
        <ControlMetric
          label="Active Strategies"
          value={overview ? String(overview.total_active_strategies) : "—"}
          detail="currently in the portfolio"
          icon={Zap}
          tone="mint"
        />
        <ControlMetric
          label="Risk Alerts"
          value={overview ? String(overview.risk_alerts.length) : "—"}
          detail={overview ? `${critical} critical` : "loading"}
          icon={AlertTriangle}
          tone="red"
        />
      </div>
    </div>
  );
});

/* ============================================================
   STRATEGY CONTROLS — kill switch on any strategy
   ============================================================ */

type ControlFilter = "live" | "active" | "retired";

const StrategyControlRow = memo(function StrategyControlRow({
  strategy,
  canKill,
  onKill,
}: {
  strategy: StrategyControlItem;
  canKill: boolean;
  onKill: (strategy: StrategyControlItem, reason: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const tone = robustnessTone(strategy.robustness_score);
  const retired = strategy.status === "retired";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0F1117]/80 ${
        confirming ? "border-l-2 border-l-[#F87171]" : "border-l-2 border-l-[#8E88C7]"
      } ${retired ? "opacity-80" : ""}`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}
          >
            <Terminal className={`h-4 w-4 ${tone.text}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-sm font-semibold text-[#F5F5F7]">{strategy.name}</h3>
              <span className={`rounded-md border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${STATUS_BADGE[strategy.status]}`}>
                {strategy.status}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-[#9A9DA8]">
              {strategy.version} · robustness {strategy.robustness_score?.toFixed(3) ?? "—"}
              {retired && ` · retired ${formatDate(strategy.updated_at)} (kept visible for ${REVIEW_WINDOW_DAYS}+ days)`}
            </p>
          </div>
        </div>
        {canKill && !retired && !confirming && (
          <Button
            size="sm"
            className="h-9 rounded-xl border border-[#F87171]/30 bg-[#F87171]/10 px-3 font-mono text-xs font-medium text-[#F87171] shadow-none hover:bg-[#F87171]/20"
            onClick={() => {
              setConfirming(true);
              setReason("");
            }}
            data-testid={`kill-${strategy.id}`}
          >
            <Siren className="mr-1.5 h-3.5 w-3.5" /> Kill switch
          </Button>
        )}
      </div>

      {confirming && (
        <div className="border-t border-[#F87171]/20 bg-[#F87171]/[0.03] p-4">
          <p className="text-xs font-semibold text-[#F87171]">Immediate, irreversible retirement</p>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-[#9A9DA8]">
            The strategy is retired the moment you confirm. Kills by anyone other than a CIO are queued for CIO
            review within {REVIEW_WINDOW_DAYS} days. Reactivation requires a fresh draft → candidate → approval run.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor={`kill-reason-${strategy.id}`} className="font-mono text-[10px] uppercase text-[#808495]">
                Reason (required)
              </Label>
              <Input
                id={`kill-reason-${strategy.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. anomalous drawdown detected in live trading"
                className="mt-1.5 h-9 border-white/[0.08] bg-[#07080B] text-xs text-[#F5F5F7]"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                size="sm"
                disabled={!reason.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await onKill(strategy, reason.trim());
                  setBusy(false);
                  if (ok) setConfirming(false);
                }}
                className="h-9 rounded-xl bg-[#F87171] px-4 text-xs font-semibold text-black hover:bg-[#F87171]/90"
                data-testid={`confirm-kill-${strategy.id}`}
              >
                <ShieldOff className="mr-1.5 h-4 w-4" />
                {busy ? "Retiring…" : "Confirm kill"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(false)}
                className="h-9 rounded-xl border-white/[0.1] bg-transparent text-xs text-[#9A9DA8]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const StrategyControls = memo(function StrategyControls({
  canKill,
  refreshKey,
  onKilled,
}: {
  canKill: boolean;
  refreshKey: number;
  onKilled: (message: string) => void;
}) {
  const [items, setItems] = useState<StrategyControlItem[]>([]);
  const [filter, setFilter] = useState<ControlFilter>("live");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await getStrategyControls()).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load strategies");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onKill = useCallback(
    async (strategy: StrategyControlItem, reason: string) => {
      setError(null);
      try {
        await killSwitch(strategy.id, reason);
        onKilled(`Kill switch activated — '${strategy.name}' is retired.`);
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kill switch failed");
        return false;
      }
    },
    [load, onKilled],
  );

  const visible = useMemo(() => {
    if (filter === "active") return items.filter((s) => s.status === "active");
    if (filter === "retired") return items.filter((s) => s.status === "retired");
    return items.filter((s) => s.status !== "retired");
  }, [items, filter]);

  const counts = useMemo(
    () => ({
      live: items.filter((s) => s.status !== "retired").length,
      active: items.filter((s) => s.status === "active").length,
      retired: items.filter((s) => s.status === "retired").length,
    }),
    [items],
  );

  return (
    <section className={cardClass} data-testid="strategy-controls">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-5">
        <div>
          <SectionEyebrow icon={Siren}>Live control</SectionEyebrow>
          <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">Strategy controls</h2>
          <p className="mt-0.5 text-xs text-[#808495]">
            {canKill ? "The kill switch works on any strategy that is not already retired." : "Read-only view for your role."}
          </p>
        </div>
        <div className="flex rounded-lg border border-white/[0.08] p-0.5">
          {(
            [
              ["live", "Not retired"],
              ["active", "Active"],
              ["retired", `Retired (last ${REVIEW_WINDOW_DAYS}d)`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] ${
                filter === key ? "bg-white/[0.08] text-[#F5F5F7]" : "text-[#808495] hover:text-[#F5F5F7]"
              }`}
            >
              {label} <span className="text-[#666A76]">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto p-4" data-testid="active-strategies">
        {error && <Alert tone="error">{error}</Alert>}
        {visible.length === 0 ? (
          <p className="py-16 text-center text-xs text-[#808495]">No strategies in this view.</p>
        ) : (
          visible.map((strategy) => (
            <StrategyControlRow key={strategy.id} strategy={strategy} canKill={canKill} onKill={onKill} />
          ))
        )}
      </div>
    </section>
  );
});

/* ============================================================
   APPROVAL QUEUE — decisions carry a real, typed justification
   ============================================================ */

const ApprovalItem = memo(function ApprovalItem({
  candidate,
  decide,
}: {
  candidate: ApprovalQueueItem;
  decide: (id: string, action: "approve" | "reject", justification: string) => Promise<void>;
}) {
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function run(action: "approve" | "reject") {
    setBusy(action);
    try {
      await decide(candidate.id, action, justification.trim());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] border-l-2 border-l-[#38BDF8] bg-[#0F1117]/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-[#F5F5F7]">{candidate.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-[#9A9DA8]">
            {candidate.creator} · robustness {candidate.robustness_score?.toFixed(3) ?? "—"}
          </p>
        </div>
        <FileCheck2 className="h-4 w-4 shrink-0 text-[#38BDF8]" />
      </div>
      <Input
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        placeholder="Justification (recorded in the audit trail)"
        className="mt-3 h-9 border-white/[0.08] bg-[#07080B] text-xs text-[#F5F5F7]"
        aria-label={`Justification for ${candidate.name}`}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!justification.trim() || busy !== null}
          onClick={() => run("reject")}
          className="h-8 rounded-lg border-white/[0.1] bg-transparent px-3 font-mono text-xs text-[#9A9DA8]"
          data-testid={`reject-${candidate.id}`}
        >
          <X className="mr-1 h-3.5 w-3.5" /> {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        <Button
          size="sm"
          disabled={!justification.trim() || busy !== null}
          onClick={() => run("approve")}
          className="h-8 rounded-lg bg-[#38BDF8] px-3 font-mono text-xs font-semibold text-black hover:bg-[#38BDF8]/90"
          data-testid={`approve-${candidate.id}`}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
      </div>
    </div>
  );
});

const ApprovalQueue = memo(function ApprovalQueue({
  refreshKey,
  onDecided,
}: {
  refreshKey: number;
  onDecided: (message: string) => void;
}) {
  const [queue, setQueue] = useState<ApprovalQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue((await getApprovalQueue()).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approval queue");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const decide = useCallback(
    async (id: string, action: "approve" | "reject", justification: string) => {
      setError(null);
      try {
        await approveOrRejectStrategy(id, action, justification);
        onDecided(action === "approve" ? "Strategy approved and activated." : "Strategy rejected.");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed to ${action}`);
      }
    },
    [load, onDecided],
  );

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between border-b border-white/[0.06] p-5">
        <div>
          <SectionEyebrow icon={UserCheck}>Decision queue</SectionEyebrow>
          <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">Approval queue</h2>
          <p className="mt-0.5 text-xs text-[#808495]">Candidates with robustness ≥ 0.70 awaiting a decision.</p>
        </div>
        <div className="flex h-8 min-w-8 items-center justify-center rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-2 font-mono text-xs font-bold text-[#38BDF8]">
          {queue.length}
        </div>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto p-4" data-testid="approval-queue">
        {error && <Alert tone="error">{error}</Alert>}
        {queue.length === 0 ? (
          <p className="py-16 text-center text-xs text-[#808495]">Queue is clear — no candidates awaiting a decision.</p>
        ) : (
          queue.map((candidate) => <ApprovalItem key={candidate.id} candidate={candidate} decide={decide} />)
        )}
      </div>
    </section>
  );
});

/* ============================================================
   AUDIT TRAIL — every event type, with real names
   ============================================================ */

const AuditEvent = memo(function AuditEvent({ row }: { row: GovernanceAuditLogEntry }) {
  const danger = row.event_type === "kill_switch_activated" || row.event_type === "failed_login" || row.event_type === "strategy_deleted";
  const positive = row.event_type === "strategy_approved" || row.event_type === "evolution_candidate_approved" || row.event_type === "kill_switch_reviewed";
  const who = row.actor_name ?? row.actor_email ?? "System";

  return (
    <div className="relative flex gap-4" data-testid="audit-event">
      <div className="relative flex flex-col items-center">
        <div
          className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border ${
            danger
              ? "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
              : positive
                ? "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                : "border-[#8E88C7]/30 bg-[#8E88C7]/10 text-[#8E88C7]"
          }`}
        >
          {danger ? <AlertTriangle className="h-3 w-3" /> : positive ? <Check className="h-3 w-3" /> : <History className="h-3 w-3" />}
        </div>
        <div className="mt-1 h-full w-px bg-white/[0.06]" />
      </div>
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                danger ? "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]" : "border-white/[0.08] bg-white/[0.03] text-[#9A9DA8]"
              }`}
            >
              {formatEventType(row.event_type)}
            </span>
            <span className="text-xs font-semibold text-[#F5F5F7]">{who}</span>
            {row.actor_email && row.actor_name && <span className="font-mono text-[10px] text-[#808495]">{row.actor_email}</span>}
            {row.actor_role && (
              <span className="rounded border border-white/[0.08] px-1.5 font-mono text-[9px] uppercase text-[#9A9DA8]">
                {formatRole(row.actor_role)}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-[#808495]">{formatDate(row.created_at)}</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-[#C9CBD3]">{row.description ?? formatEventType(row.event_type)}</p>
        {row.justification && (
          <p className="mt-1 text-xs leading-5 text-[#9A9DA8]">
            <span className="font-mono text-[10px] uppercase text-[#666A76]">Reason · </span>
            {row.justification}
          </p>
        )}
        {row.actor_identity_source === "current_profile" && (
          <p className="mt-1 font-mono text-[10px] text-[#666A76]">
            Recorded before identity snapshots existed — name and role shown as they are today.
          </p>
        )}
      </div>
    </div>
  );
});

const AuditTrail = memo(function AuditTrail({ refreshKey }: { refreshKey: number }) {
  const canPickPeople = useCan(PERM.MEMBERS_VIEW);
  const [items, setItems] = useState<GovernanceAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<AuditLogScope>("organization");
  const [eventType, setEventType] = useState("");
  const [actorId, setActorId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce free-text search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!canPickPeople) return;
    listOrganizationMembers()
      .then((res) => setMembers(res.items))
      .catch(() => setMembers([]));
  }, [canPickPeople]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGovernanceAuditLog({
        event_type: eventType || undefined,
        actor_user_id: actorId ?? undefined,
        q: search || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: AUDIT_PAGE_SIZE,
        offset,
      });
      setItems(res.items);
      setTotal(res.total);
      setScope(res.scope);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [eventType, actorId, search, startDate, endDate, offset]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const page = Math.floor(offset / AUDIT_PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const selectClass = "h-9 rounded-xl border border-white/[0.08] bg-[#0F1117] px-3 font-mono text-xs text-[#F5F5F7] outline-none focus:border-[#8E88C7]";

  return (
    <section className={cardClass}>
      <div className="border-b border-white/[0.06] p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionEyebrow icon={History}>Institutional record</SectionEyebrow>
              <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">Governance audit trail</h2>
              <p className="mt-0.5 text-xs text-[#808495]">
                {SCOPE_NOTE[scope]} {total} matching event{total === 1 ? "" : "s"}.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              className="h-9 rounded-xl border-white/[0.08] bg-[#0F1117] font-mono text-xs text-[#9A9DA8]"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setOffset(0);
              }}
              className={selectClass}
              data-testid="filter-event-type"
              aria-label="Filter by event type"
            >
              <option value="">All event types</option>
              {AUDIT_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatEventType(type)}
                </option>
              ))}
            </select>
            {canPickPeople && (
              <MemberPicker
                members={members}
                value={actorId}
                onChange={(id) => {
                  setActorId(id);
                  setOffset(0);
                }}
                placeholder="Filter by person"
                testId="audit-actor-filter"
              />
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#808495]" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, strategy, reason"
                className="h-9 w-64 rounded-xl border-white/[0.08] bg-[#0F1117] pl-9 font-mono text-xs text-[#F5F5F7]"
                data-testid="audit-search"
              />
            </div>
            <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-[#808495]">
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setOffset(0);
                }}
                className={selectClass}
              />
            </label>
            <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-[#808495]">
              To
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setOffset(0);
                }}
                className={selectClass}
              />
            </label>
          </div>
        </div>
      </div>
      <div className="p-5">
        {error && <Alert tone="error">{error}</Alert>}
        {items.length === 0 && !loading ? (
          <div className="py-12 text-center">
            <History className="mx-auto h-6 w-6 text-[#808495]" />
            <p className="mt-2 text-xs font-semibold text-[#F5F5F7]">No audit events found</p>
            <p className="mt-0.5 text-[11px] text-[#808495]">Try widening the filters.</p>
          </div>
        ) : (
          <div className="max-h-[560px] overflow-y-auto pr-2" data-testid="governance-audit-log-table">
            {items.map((row) => (
              <AuditEvent key={row.id} row={row} />
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-3 font-mono text-[11px] text-[#808495]">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - AUDIT_PAGE_SIZE))}
              className="h-8 rounded-lg border-white/[0.08] bg-transparent text-[#9A9DA8]"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setOffset((o) => o + AUDIT_PAGE_SIZE)}
              className="h-8 rounded-lg border-white/[0.08] bg-transparent text-[#9A9DA8]"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
});

/* ============================================================
   COMPLIANCE EXPORT — honest queued state, auto-polls, survives reload
   ============================================================ */

const EXPORT_BADGE: Record<ComplianceExportJob["status"], "success" | "destructive" | "secondary"> = {
  completed: "success",
  failed: "destructive",
  pending: "secondary",
  running: "secondary",
};

const ExportJobRow = memo(function ExportJobRow({
  job,
  onDownload,
}: {
  job: ComplianceExportJob;
  onDownload: (job: ComplianceExportJob) => void;
}) {
  const waiting = job.status === "pending" || job.status === "running";
  const noWorker = job.status === "pending" && job.worker_online === false;
  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="export-job">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#F5F5F7]">
          {job.export_format.toUpperCase()} · {job.start_date} → {job.end_date}
          <span className="ml-2 font-mono text-[10px] text-[#808495]">{formatDate(job.created_at)}</span>
        </p>
        <p className={`mt-0.5 text-[11px] ${noWorker || job.status === "failed" ? "text-[#FBBF24]" : "text-[#9A9DA8]"}`}>
          {waiting && !noWorker && <RefreshCw className="mr-1 inline h-3 w-3 animate-spin" />}
          {job.status_message}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={EXPORT_BADGE[job.status]}>{job.status}</Badge>
        {job.status === "completed" && (
          <Button
            size="sm"
            onClick={() => onDownload(job)}
            className="h-8 rounded-lg bg-[#38BDF8] font-mono text-xs font-semibold text-black hover:bg-[#38BDF8]/90"
            data-testid="download-export"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download
          </Button>
        )}
      </div>
    </div>
  );
});

const ComplianceExport = memo(function ComplianceExport() {
  const [start, setStart] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState<ComplianceExportFormat>("pdf");
  const [jobs, setJobs] = useState<ComplianceExportJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(async () => {
    try {
      setJobs((await listComplianceExports()).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exports");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while something is actually in flight; stop the moment nothing is.
  useEffect(() => {
    const inFlight = jobs.some((j) => j.status === "pending" || j.status === "running");
    if (!inFlight) return;
    pollRef.current = setTimeout(() => void refresh(), EXPORT_POLL_MS);
    return () => clearTimeout(pollRef.current);
  }, [jobs, refresh]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const enqueued = await createComplianceExport({ start_date: start, end_date: end, export_format: format });
      const job = await getComplianceExportJob(enqueued.job_id);
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enqueue export");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const download = useCallback(async (job: ComplianceExportJob) => {
    try {
      await downloadComplianceExport(job.id, job.export_format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download export");
    }
  }, []);

  const inputClass = "mt-1.5 h-9 border-white/[0.08] bg-[#0F1117] font-mono text-xs text-[#F5F5F7]";
  return (
    <section className={cardClass}>
      <div className="grid lg:grid-cols-[1fr_320px]">
        <div className="p-6">
          <SectionEyebrow icon={Download}>Compliance archive</SectionEyebrow>
          <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">Export governance record</h2>
          <p className="mt-0.5 max-w-xl text-xs text-[#808495]">
            Generates the audit trail for a date range as JSON or PDF, with actor names and reasons.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="export-start" className="font-mono text-[10px] uppercase text-[#808495]">Start date</Label>
              <Input id="export-start" type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="export-end" className="font-mono text-[10px] uppercase text-[#808495]">End date</Label>
              <Input id="export-end" type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="export-format" className="font-mono text-[10px] uppercase text-[#808495]">Format</Label>
              <select
                id="export-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ComplianceExportFormat)}
                className="mt-1.5 h-9 w-full rounded-xl border border-white/[0.08] bg-[#0F1117] px-3 font-mono text-xs text-[#F5F5F7] outline-none"
              >
                <option value="pdf">PDF</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between border-t border-white/[0.06] bg-[#0F1117]/80 p-6 lg:border-l lg:border-t-0">
          <div>
            <FileText className="h-5 w-5 text-[#8E88C7]" />
            <p className="mt-3 text-xs font-semibold text-[#F5F5F7]">Processed in the background</p>
            <p className="mt-0.5 text-[11px] text-[#808495]">Status updates automatically while a job is queued or running.</p>
          </div>
          <Button
            onClick={submit}
            disabled={submitting}
            className="mt-6 h-9 rounded-xl bg-[#8E88C7] px-4 font-mono text-xs font-semibold text-black hover:bg-[#8E88C7]/90"
            data-testid="submit-export"
          >
            <Download className="mr-2 h-4 w-4" /> {submitting ? "Queuing…" : "Generate export"}
          </Button>
        </div>
      </div>
      {error && (
        <div className="px-4 pb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {jobs.map((job) => (
        <ExportJobRow key={job.id} job={job} onDownload={download} />
      ))}
    </section>
  );
});

/* ============================================================
   VIEW
   ============================================================ */

export function GovernanceView() {
  const roleLabel = useAuthStore((s) => s.effectiveRole?.name ?? formatRole(s.user?.role));
  const canView = useCan(PERM.GOVERNANCE_VIEW);
  const canKill = useCan(PERM.KILLSWITCH_TRIGGER);
  const canSeeCompliance = useCan(PERM.COMPLIANCE_EXPORT);
  const canSeeAudit = useCanAny(...AUDIT_VIEW_PERMS);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadMe().finally(() => setReady(true));
  }, []);

  // One action (kill / approve) refreshes the sections it affects.
  const onAction = useCallback((text: string) => {
    setMessage(text);
    setRefreshKey((k) => k + 1);
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 px-5 py-5">
          <RefreshCw className="h-4 w-4 animate-spin text-[#8E88C7]" />
          <p className="text-xs text-[#9A9DA8]">Loading governance controls…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">Control Room</p>
            <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight">Governance &amp; Compliance</h1>
            <p className="mt-1 text-xs text-[#9A9DA8]">
              Strategy authority, approvals, kill switch reviews and the institutional audit trail.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
            <span className="text-[10px] text-[#808495]">ROLE:</span>
            <span>{roleLabel || "unauthenticated"}</span>
          </div>
        </div>

        {message && <Alert tone="success">{message}</Alert>}

        {!canView && !canSeeAudit ? (
          <div className={`${cardClass} flex min-h-[420px] flex-col items-center justify-center p-6 text-center`}>
            <LockKeyhole className="h-5 w-5 text-[#808495]" />
            <h2 className="mt-4 text-base font-bold">Governance access restricted</h2>
            <p className="mt-1 max-w-md text-xs text-[#9A9DA8]">
              Authorized roles: Risk Manager, CIO, Compliance Officer and Admin.
            </p>
          </div>
        ) : (
          <>
            {canView && <PortfolioMetrics />}
            {canView && (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)]">
                <StrategyControls canKill={canKill} refreshKey={refreshKey} onKilled={onAction} />
                <ApprovalQueue refreshKey={refreshKey} onDecided={onAction} />
              </div>
            )}
            {canView && <KillSwitchReviewQueue key={`reviews-${refreshKey}`} />}
            {canSeeAudit && <AuditTrail refreshKey={refreshKey} />}
            {canSeeCompliance && <ComplianceExport />}
          </>
        )}

        <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4">
          <ShieldCheck className="h-4 w-4 text-[#34D399]" />
          <span className="text-xs text-[#808495]">Every control on this page is enforced by the backend role policy.</span>
        </div>
      </div>
    </div>
  );
}
