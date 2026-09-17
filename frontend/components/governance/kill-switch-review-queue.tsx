"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, RefreshCw, ShieldOff } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { acknowledgeKillSwitchReview, getKillSwitchReviews } from "@/lib/governance";
import type { KillSwitchReview, KillSwitchReviewListResponse, KillSwitchReviewState } from "@/lib/governance-types";
import { formatRole } from "@/lib/members";
import { useCan } from "@/hooks/use-permissions";
import { PERM } from "@/lib/rbac";

const STATE_STYLE: Record<KillSwitchReviewState, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "border-[#F87171]/40 bg-[#F87171]/15 text-[#F87171]" },
  pending: { label: "Awaiting CIO review", className: "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FBBF24]" },
  reviewed: { label: "Reviewed", className: "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]" },
  self_reviewed: { label: "CIO kill (self-reviewed)", className: "border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]" },
};

type Filter = "awaiting" | "all";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

function deadlineText(review: KillSwitchReview): string {
  const ms = new Date(review.review_deadline).getTime() - Date.now();
  const days = Math.floor(Math.abs(ms) / 86_400_000);
  const hours = Math.floor((Math.abs(ms) % 86_400_000) / 3_600_000);
  const span = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return ms >= 0 ? `${span} left to review` : `${span} past the deadline`;
}

function actorName(actor: { full_name: string | null; email: string | null; role: string | null } | null): string {
  if (!actor) return "Unknown user";
  const who = actor.full_name ?? actor.email ?? "Deleted user";
  return actor.role ? `${who} · ${formatRole(actor.role)}` : who;
}

const ReviewCard = memo(function ReviewCard({
  review,
  canAcknowledge,
  onAcknowledge,
}: {
  review: KillSwitchReview;
  canAcknowledge: boolean;
  onAcknowledge: (id: string, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const style = STATE_STYLE[review.review_state];
  const awaiting = review.review_state === "pending" || review.review_state === "overdue";

  return (
    <article
      className={`rounded-xl border bg-[#0F1117]/80 p-4 ${
        review.review_state === "overdue" ? "border-[#F87171]/40 shadow-[0_0_24px_-8px_rgba(248,113,113,0.5)]" : "border-white/[0.08]"
      }`}
      data-testid={`kill-review-${review.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldOff className="h-4 w-4 text-[#F87171]" />
            <h3 className="break-words text-sm font-semibold text-[#F5F5F7]">{review.strategy_name}</h3>
            <span className="font-mono text-[10px] text-[#808495]">
              {review.status_before_kill} → {review.strategy_status}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Killed by <span className="text-[#F5F5F7]">{actorName(review.triggered_by)}</span> on {formatDate(review.triggered_at)}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${style.className}`}>
          {style.label}
        </span>
      </div>

      <p className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs leading-5 text-[#C9CBD3]">
        <span className="font-mono text-[10px] uppercase text-[#808495]">Reason · </span>
        {review.reason}
      </p>

      {awaiting ? (
        <div className="mt-3 flex flex-col gap-2">
          <p
            className={`flex items-center gap-1.5 font-mono text-[11px] ${
              review.review_state === "overdue" ? "text-[#F87171]" : "text-[#FBBF24]"
            }`}
          >
            {review.review_state === "overdue" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            {deadlineText(review)} (deadline {formatDate(review.review_deadline)})
          </p>
          {canAcknowledge && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Review note — e.g. confirmed with risk, kill was warranted"
                className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-[#07080B] px-3 text-xs text-[#F5F5F7] outline-none focus:border-[#8E88C7]/60"
                aria-label={`Review note for ${review.strategy_name}`}
              />
              <Button
                size="sm"
                disabled={!note.trim() || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onAcknowledge(review.id, note.trim());
                  } finally {
                    setSaving(false);
                  }
                }}
                className="h-9 rounded-lg bg-[#34D399] px-3 font-mono text-xs font-semibold text-black hover:bg-[#34D399]/90"
                data-testid={`acknowledge-${review.id}`}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Recording…" : "Mark reviewed"}
              </Button>
            </div>
          )}
          <p className="text-[10px] text-[#666A76]">Acknowledging records the review only — the strategy stays retired.</p>
        </div>
      ) : (
        review.reviewed_by && (
          <p className="mt-3 text-xs text-[#9A9DA8]">
            Reviewed by <span className="text-[#F5F5F7]">{actorName(review.reviewed_by)}</span> on {formatDate(review.reviewed_at)}
            {review.review_note && !review.is_self_reviewed && <> — “{review.review_note}”</>}
          </p>
        )
      )}
    </article>
  );
});

/**
 * Batch 25: every kill switch activation and its CIO review state. CIOs acknowledge
 * pending kills here; risk managers see the history of their own kills. Overdue
 * reviews stay visible (and red) until a CIO acts — nothing expires silently.
 */
export function KillSwitchReviewQueue({ variant = "section" }: { variant?: "section" | "page" }) {
  const canAcknowledge = useCan(PERM.KILLSWITCH_REVIEW);
  const seesEveryKill = useCan(PERM.KILLSWITCH_HISTORY_ALL);
  const [filter, setFilter] = useState<Filter>(canAcknowledge ? "awaiting" : "all");
  const [data, setData] = useState<KillSwitchReviewListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Permissions load asynchronously; once we know the viewer can review, open on their queue.
  useEffect(() => {
    if (canAcknowledge) setFilter("awaiting");
  }, [canAcknowledge]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getKillSwitchReviews({ review_state: filter }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kill switch reviews");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = useCallback(
    async (id: string, note: string) => {
      setError(null);
      try {
        await acknowledgeKillSwitchReview(id, note);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record the review");
      }
    },
    [load],
  );

  const heading = useMemo(
    () => (seesEveryKill ? "Kill switch reviews" : "My kill switch history"),
    [seesEveryKill],
  );

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 backdrop-blur-xl"
      data-testid="kill-switch-review-queue"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-5">
        <div>
          <p className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
            <ClipboardCheck className="h-3.5 w-3.5 text-[#8E88C7]" /> Dual approval
          </p>
          {variant === "page" ? (
            <h1 className="text-3xl font-extrabold tracking-tight text-[#F5F5F7]">{heading}</h1>
          ) : (
            <h2 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">{heading}</h2>
          )}
          <p className="mt-0.5 text-xs text-[#808495]">
            Kills take effect instantly. Any kill not made by a CIO needs CIO review within 14 days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && data.overdue_count > 0 && (
            <span className="rounded-lg border border-[#F87171]/40 bg-[#F87171]/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#F87171]">
              {data.overdue_count} overdue
            </span>
          )}
          {data && (
            <span className="rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-2.5 py-1 font-mono text-[11px] text-[#FBBF24]">
              {data.awaiting_review_count} awaiting
            </span>
          )}
          <div className="flex rounded-lg border border-white/[0.08] p-0.5">
            {(["awaiting", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] ${
                  filter === f ? "bg-white/[0.08] text-[#F5F5F7]" : "text-[#808495] hover:text-[#F5F5F7]"
                }`}
              >
                {f === "awaiting" ? "Awaiting review" : "All kills"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={load} className="h-8 rounded-lg border-white/[0.08] bg-transparent text-[#9A9DA8]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {error && <p className="rounded-lg border border-[#F87171]/25 bg-[#F87171]/[0.08] p-3 text-xs text-[#F87171]">{error}</p>}
        {!loading && data?.items.length === 0 && (
          <p className="py-10 text-center text-xs text-[#808495]">
            {filter === "awaiting" ? "No kill switch activations are waiting for review." : "No kill switch activations yet."}
          </p>
        )}
        {data?.items.map((review) => (
          <ReviewCard key={review.id} review={review} canAcknowledge={canAcknowledge} onAcknowledge={acknowledge} />
        ))}
      </div>
    </section>
  );
}
