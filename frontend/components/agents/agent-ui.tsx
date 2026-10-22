"use client";

import dynamic from "next/dynamic";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

import type { AgentRating, AgentRunStatus, ScoreGroup, ScoreSummary } from "@/lib/agent-types";

/* -------------------------------------------------------------------------- */
/*                                   STYLES                                   */
/* -------------------------------------------------------------------------- */

export const GLASS =
  "rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";
export const LABEL = "font-mono text-[10px] uppercase tracking-[0.12em] text-[#666A76]";

const RATING_STYLE: Record<AgentRating, { color: string; bg: string; border: string }> = {
  Buy: { color: "#34D399", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)" },
  Overweight: { color: "#6EE7B7", bg: "rgba(110,231,183,0.08)", border: "rgba(110,231,183,0.26)" },
  Hold: { color: "#FBBF24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.28)" },
  Underweight: { color: "#FCA5A5", bg: "rgba(252,165,165,0.08)", border: "rgba(252,165,165,0.26)" },
  Sell: { color: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)" },
  REVIEW: { color: "#A5A8B5", bg: "rgba(165,168,181,0.08)", border: "rgba(165,168,181,0.25)" },
};

const REGIME_COLOR: Record<string, string> = {
  Bull: "#34D399",
  Bear: "#F87171",
  "High-Volatility": "#F59E0B",
  "Low-Volatility": "#38BDF8",
  Sideways: "#A5A8B5",
  Crisis: "#EF4444",
};

export function RatingBadge({ rating, size = "sm" }: { rating: AgentRating | null; size?: "sm" | "lg" }) {
  if (!rating) return <span className="font-mono text-xs text-[#666A76]">—</span>;
  const s = RATING_STYLE[rating] ?? RATING_STYLE.REVIEW;
  return (
    <span
      className={`inline-flex items-center rounded-lg border font-mono font-bold tracking-tight ${
        size === "lg" ? "px-3 py-1.5 text-xl" : "px-2 py-0.5 text-xs"
      }`}
      style={{ color: s.color, backgroundColor: s.bg, borderColor: s.border }}
      title={rating === "REVIEW" ? "No rating could be parsed from the decision — needs a human read" : undefined}
    >
      {rating}
    </span>
  );
}

export function RegimeBadge({ regime, confidence }: { regime: string | null; confidence?: number | null }) {
  if (!regime) return <span className="font-mono text-[11px] text-[#666A76]">no regime label</span>;
  const color = REGIME_COLOR[regime] ?? "#A5A8B5";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px]" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {regime}
      {confidence != null && <span className="text-[#808495]">· {confidence.toFixed(2)}</span>}
    </span>
  );
}

export function StatusPill({ status }: { status: AgentRunStatus }) {
  const map: Record<AgentRunStatus, string> = {
    queued: "text-[#A5A8B5] border-white/[0.1]",
    running: "text-[#8E88C7] border-[#8E88C7]/30",
    completed: "text-[#34D399] border-[#34D399]/30",
    failed: "text-[#F87171] border-[#F87171]/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${map[status]}`}>
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status}
    </span>
  );
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null) return "—";
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

export function alphaColor(x: number | null | undefined): string {
  if (x == null) return "#808495";
  return x > 0 ? "#34D399" : x < 0 ? "#F87171" : "#A5A8B5";
}

/* -------------------------------------------------------------------------- */
/*                              PIPELINE PROGRESS                             */
/* -------------------------------------------------------------------------- */

const TEAM: Record<string, string> = {
  "Market Analyst": "Analysts",
  "Sentiment Analyst": "Analysts",
  "News Analyst": "Analysts",
  "Fundamentals Analyst": "Analysts",
  "Bull Researcher": "Research debate",
  "Bear Researcher": "Research debate",
  "Research Manager": "Research debate",
  Trader: "Trader",
  "Aggressive Analyst": "Risk debate",
  "Conservative Analyst": "Risk debate",
  "Neutral Analyst": "Risk debate",
  "Portfolio Manager": "Decision",
};

export function PipelineProgress({
  expected,
  done,
  status,
}: {
  expected: string[];
  done: string[];
  status: AgentRunStatus;
}) {
  const doneSet = new Set(done);
  const current = status === "running" ? expected.find((s) => !doneSet.has(s)) : undefined;
  const teams = Array.from(new Set(expected.map((s) => TEAM[s] ?? "Other")));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {teams.map((team) => (
        <div key={team} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className={LABEL}>{team}</p>
          <ul className="mt-2 space-y-1.5">
            {expected
              .filter((s) => (TEAM[s] ?? "Other") === team)
              .map((stage) => {
                const isDone = doneSet.has(stage);
                const isCurrent = stage === current;
                const failedHere = status === "failed" && !isDone && stage === expected.find((s) => !doneSet.has(s));
                return (
                  <li key={stage} className="flex items-center gap-2 text-xs">
                    {isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#34D399]" />
                    ) : failedHere ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-[#F87171]" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#8E88C7]" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-[#3A3D48]" />
                    )}
                    <span className={isDone ? "text-[#D4D5DB]" : isCurrent ? "text-[#F5F5F7]" : "text-[#666A76]"}>
                      {stage}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  MARKDOWN                                  */
/* -------------------------------------------------------------------------- */

const MarkdownPreview = dynamic(() => import("@uiw/react-md-editor").then((m) => m.default.Markdown), {
  ssr: false,
  loading: () => <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />,
});

export function Markdown({ source, empty = "Not produced in this run." }: { source?: string | null; empty?: string }) {
  if (!source || !source.trim()) return <p className="text-xs italic text-[#666A76]">{empty}</p>;
  return (
    <div data-color-mode="dark" className="agent-markdown text-sm">
      <MarkdownPreview source={source} style={{ background: "transparent", color: "#D4D5DB", fontSize: 13 }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         REGIME x RATING SCORE TABLE                         */
/* -------------------------------------------------------------------------- */

const RATING_ORDER = ["Buy", "Overweight", "Hold", "Underweight", "Sell", "REVIEW"];

function Cell({ group }: { group?: ScoreGroup }) {
  if (!group || group.n === 0) return <td className="px-3 py-2 text-center font-mono text-[11px] text-[#3A3D48]">·</td>;
  return (
    <td className="px-3 py-2 text-center">
      <p className="font-mono text-xs font-semibold" style={{ color: alphaColor(group.mean_alpha) }}>
        {pct(group.mean_alpha)}
      </p>
      <p className="font-mono text-[10px] text-[#808495]">
        n={group.n}
        {group.hit_rate != null && ` · hit ${(group.hit_rate * 100).toFixed(0)}%`}
      </p>
    </td>
  );
}

/** Mean realised alpha per (regime, rating); hit rate counts directional calls only. */
export function RegimeRatingTable({ summary }: { summary: ScoreSummary }) {
  const rows = summary.by_regime_rating ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[#9A9DA8]">
        No settled calls yet. A call is scored once its holding window has traded (nightly, or &ldquo;Settle now&rdquo;).
      </p>
    );
  }
  const regimes = Array.from(new Set(rows.map((r) => r.regime ?? "Unlabelled")));
  const ratings = RATING_ORDER.filter((r) => rows.some((x) => x.rating === r));
  const find = (regime: string, rating: string) => rows.find((r) => r.regime === regime && r.rating === rating);
  const byRegime = new Map((summary.by_regime ?? []).map((g) => [g.regime, g]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={`${LABEL} px-3 py-2 text-left`}>Regime</th>
            {ratings.map((r) => (
              <th key={r} className={`${LABEL} px-3 py-2 text-center`}>
                {r}
              </th>
            ))}
            <th className={`${LABEL} px-3 py-2 text-center`}>All calls</th>
          </tr>
        </thead>
        <tbody>
          {regimes.map((regime) => (
            <tr key={regime} className="border-t border-white/[0.04]">
              <td className="px-3 py-2">
                <RegimeBadge regime={regime === "Unlabelled" ? null : regime} />
              </td>
              {ratings.map((rating) => (
                <Cell key={rating} group={find(regime, rating)} />
              ))}
              <Cell group={byRegime.get(regime)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
