"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Real-artifact visuals for the public site. Each one mirrors a structure the
 * product actually ships (the six regimes, the append-only failure record, the
 * Research Memory map of 6 record types / 8 relationships, the JSON rule DSL, and
 * plain SQL against the source tables).
 * Numbers inside them are illustrative sample values and are labelled as such.
 */

// ---------------------------------------------------------------------------
// Regimes
// ---------------------------------------------------------------------------

export const SITE_REGIMES = [
  { key: "bull", label: "Bull", color: "#1E9E63" },
  { key: "bear", label: "Bear", color: "#D9483B" },
  { key: "hvol", label: "High-Vol", color: "#E59A1A" },
  { key: "lvol", label: "Low-Vol", color: "#2F86D6" },
  { key: "side", label: "Sideways", color: "#8B7FD6" },
  { key: "crisis", label: "Crisis", color: "#8F1D3A" },
] as const;

type RegimeKey = (typeof SITE_REGIMES)[number]["key"];

const REGIME_BY_KEY = Object.fromEntries(SITE_REGIMES.map((r) => [r.key, r])) as Record<
  RegimeKey,
  (typeof SITE_REGIMES)[number]
>;

export function RegimeChip({ regime, className }: { regime: RegimeKey; className?: string }) {
  const r = REGIME_BY_KEY[regime];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-2.5 py-0.5 text-[12px] font-semibold text-ink",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
      {r.label}
    </span>
  );
}

// A plausible sample sequence of regime runs (weights = relative duration).
const TAPE: [RegimeKey, number][] = [
  ["bull", 9], ["lvol", 6], ["bull", 5], ["side", 4], ["hvol", 3], ["bear", 4], ["crisis", 2],
  ["hvol", 3], ["bear", 3], ["side", 5], ["lvol", 4], ["bull", 8], ["hvol", 2], ["side", 3],
  ["bull", 6], ["lvol", 5], ["hvol", 3], ["bear", 5], ["crisis", 1], ["side", 4], ["bull", 7],
];

/** Continuously scrolling regime timeline — the site's signature motif. */
export function RegimeTape({ className, dark = false }: { className?: string; dark?: boolean }) {
  const row = (
    <div className="flex shrink-0 gap-[3px] pr-[3px]">
      {TAPE.map(([key, w], i) => (
        <div
          key={i}
          className="h-full rounded-[3px]"
          style={{ width: w * 22, backgroundColor: REGIME_BY_KEY[key].color }}
          title={REGIME_BY_KEY[key].label}
        />
      ))}
    </div>
  );
  return (
    <div
      className={cn(
        "relative h-3 overflow-hidden rounded-full",
        dark ? "bg-white/5" : "bg-paper-sunken",
        className,
      )}
      aria-hidden
    >
      <div className="flex h-full w-max animate-tape-scroll motion-reduce:animate-none">
        {row}
        {row}
      </div>
    </div>
  );
}

export function RegimeLegend({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-5 gap-y-2", className)}>
      {SITE_REGIMES.map((r) => (
        <li
          key={r.key}
          className={cn("flex items-center gap-2 text-[13px] font-medium", dark ? "text-white/80" : "text-ink-2")}
        >
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
          {r.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Failure record (hero visual)
// ---------------------------------------------------------------------------

const SHAP = [
  { feature: "realized_vol_20", value: 0.41 },
  { feature: "rsi_14", value: 0.27 },
  { feature: "atr_14", value: 0.16 },
  { feature: "autocorr_5", value: 0.09 },
  { feature: "macd_hist", value: 0.07 },
];

const SHAP_MAX = Math.max(...SHAP.map((s) => s.value));

export function FailureRecordCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-line bg-paper-raised shadow-[0_40px_80px_-40px_rgba(14,18,32,0.35),0_1px_2px_rgba(14,18,32,0.06)]",
        className,
      )}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-line bg-paper-sunken/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-white">
            <Lock className="h-3 w-3" />
          </span>
          <span className="font-code text-[12px] font-medium text-ink">failure_record · F-0412</span>
        </div>
        <span className="rounded-md border border-line bg-paper-raised px-2 py-0.5 font-code text-[10px] font-medium uppercase tracking-wider text-ink-3">
          append-only
        </span>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-code text-[11px] uppercase tracking-wider text-ink-3">Strategy</p>
            <p className="mt-1 text-[17px] font-semibold text-ink">RSI Reversal · v3</p>
          </div>
          <div className="text-right">
            <p className="font-code text-[11px] uppercase tracking-wider text-ink-3">Broke in</p>
            <RegimeChip regime="crisis" className="mt-1" />
          </div>
        </div>

        <dl className="grid grid-cols-[1.5fr_1fr_1fr] gap-2">
          {[
            ["Trigger", "drawdown_breach", "text-loss"],
            ["Max DD", "−18.4%", "text-loss"],
            ["Sharpe @ fail", "−1.12", "text-ink"],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-xl border border-line bg-paper px-3 py-2.5">
              <dt className="text-[11px] font-medium text-ink-3">{k}</dt>
              <dd className={cn("mt-0.5 truncate font-code text-[12.5px] font-semibold", c)}>{v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-ink">SHAP attribution · top 5 features</p>
            <p className="font-code text-[11px] text-ink-3">|φ|</p>
          </div>
          <ul className="mt-3 space-y-2">
            {SHAP.map((s, i) => (
              <li key={s.feature} className="grid grid-cols-[112px_1fr_36px] items-center gap-3">
                <span className="truncate font-code text-[11.5px] text-ink-2">{s.feature}</span>
                <span className="h-2 overflow-hidden rounded-full bg-paper-sunken">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(s.value / SHAP_MAX) * 100}%`,
                      backgroundColor: i === 0 ? "#C2362B" : "#4B3FD1",
                      opacity: i === 0 ? 1 : 1 - i * 0.14,
                    }}
                  />
                </span>
                <span className="text-right font-code text-[11.5px] font-medium text-ink">{s.value.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink px-3.5 py-3 font-code text-[11.5px] text-white/90">
          <span className="text-brand-bright">(:Strategy)</span>
          <span className="text-white/60">—[</span>
          <span className="text-signal">FAILED_IN</span>
          <span className="text-white/60">]→</span>
          <span className="text-brand-bright">(:Regime {"{Crisis}"})</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-regime performance table
// ---------------------------------------------------------------------------

const PER_REGIME: { regime: RegimeKey; sharpe: number; trades: number }[] = [
  { regime: "bull", sharpe: 2.61, trades: 184 },
  { regime: "lvol", sharpe: 1.94, trades: 121 },
  { regime: "side", sharpe: 0.48, trades: 96 },
  { regime: "hvol", sharpe: -0.37, trades: 58 },
  { regime: "bear", sharpe: -0.82, trades: 41 },
  { regime: "crisis", sharpe: -1.12, trades: 12 },
];

export function PerRegimeTable({ className }: { className?: string }) {
  const max = 2.61;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-paper-raised", className)}>
      <div className="flex items-end justify-between border-b border-line px-5 py-4">
        <div>
          <p className="text-[12px] font-medium text-ink-3">Blended Sharpe</p>
          <p className="font-code text-2xl font-semibold text-ink">1.84</p>
        </div>
        <span className="rounded-md bg-loss-tint px-2 py-1 font-code text-[11px] font-semibold text-loss">
          regime-fragile
        </span>
      </div>
      <ul className="divide-y divide-line">
        {PER_REGIME.map((row) => {
          const positive = row.sharpe >= 0;
          return (
            <li key={row.regime} className="grid grid-cols-[104px_1fr_52px] items-center gap-3 px-5 py-2.5">
              <RegimeChip regime={row.regime} className="w-fit border-transparent bg-transparent px-0" />
              <div className="relative h-2 rounded-full bg-paper-sunken">
                <span
                  className={cn("absolute top-0 h-full rounded-full", positive ? "left-1/2 bg-gain" : "right-1/2 bg-loss")}
                  style={{ width: `${(Math.abs(row.sharpe) / max) * 50}%` }}
                />
                <span className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-line-strong" />
              </div>
              <span className={cn("text-right font-code text-[12.5px] font-semibold", positive ? "text-gain" : "text-loss")}>
                {row.sharpe > 0 ? "+" : ""}
                {row.sharpe.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line bg-paper-sunken/60 px-5 py-2.5 text-[11.5px] text-ink-3">
        Sample backtest · Sharpe partitioned by regime
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation gate (5 weighted methods)
// ---------------------------------------------------------------------------

export const VALIDATION_METHODS = [
  { name: "Walk-Forward", weight: 30, score: 0.81 },
  { name: "Regime Cross-Validation", weight: 30, score: 0.74 },
  { name: "Monte-Carlo", weight: 20, score: 0.69 },
  { name: "Persistence", weight: 10, score: 0.77 },
  { name: "Stress Test", weight: 10, score: 0.58 },
];

export function ValidationGate({ dark = false, className }: { dark?: boolean; className?: string }) {
  const composite = VALIDATION_METHODS.reduce((acc, m) => acc + (m.weight / 100) * m.score, 0);
  return (
    <div className={cn("space-y-4", className)}>
      {VALIDATION_METHODS.map((m) => (
        <div key={m.name}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className={cn("font-medium", dark ? "text-white/90" : "text-ink")}>
              {m.name} <span className={cn("font-code text-[11px]", dark ? "text-white/55" : "text-ink-3")}>· {m.weight}%</span>
            </span>
            <span className={cn("font-code font-semibold", dark ? "text-white" : "text-ink")}>{m.score.toFixed(2)}</span>
          </div>
          <div className={cn("relative mt-1.5 h-2 rounded-full", dark ? "bg-white/10" : "bg-paper-sunken")}>
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", dark ? "bg-brand-bright" : "bg-brand")}
              style={{ width: `${m.score * 100}%` }}
            />
            <span className="absolute -top-1 h-4 w-0.5 rounded bg-signal" style={{ left: "70%" }} />
          </div>
        </div>
      ))}
      <div
        className={cn(
          "mt-2 flex items-center justify-between rounded-xl px-4 py-3",
          dark ? "bg-white/[0.06]" : "border border-line bg-paper-raised",
        )}
      >
        <span className={cn("text-[13px] font-semibold", dark ? "text-white" : "text-ink")}>Composite robustness</span>
        <span className="flex items-center gap-2.5">
          <span className={cn("font-code text-lg font-semibold", dark ? "text-white" : "text-ink")}>{composite.toFixed(2)}</span>
          <span className="rounded-md bg-signal px-2 py-0.5 font-code text-[11px] font-semibold text-ink">≥ 0.70 → promotable</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code panel with tiny token highlighter (JSON, SQL, HTTP)
// ---------------------------------------------------------------------------

export type CodeLanguage = "json" | "sql" | "http";

function highlight(line: string, language: CodeLanguage): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern =
    language === "sql"
      ? /(--.*$)|('[^']*')|(:[a-z_]+)|(\b(?:WITH RECURSIVE|SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|UNION ALL|JOIN|ON|AND|AS|DESC|REVOKE|UPDATE|DELETE|TABLE|PUBLIC|count)\b)|(\b[a-z]\.(?=[a-z_]))|(\b\d+(?:\.\d+)?\b)/g
      : language === "http"
        ? /(#.*$)|("[^"]*")|(\b(?:GET|POST|PUT|PATCH|DELETE)\b)|(\/[\w/{}.-]+)|(\b\d+\b)/g
        : /("[^"]*"(?=\s*:))|("[^"]*")|(\b-?\d+(?:\.\d+)?\b)|(\btrue|false|null\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const text = m[0];
    let cls = "text-white";
    if (language === "sql") {
      cls = m[1] ? "text-white/50 italic" : m[2] ? "text-[#9BE3B8]" : m[3] ? "text-signal" : m[4] ? "text-brand-bright font-semibold" : m[5] ? "text-[#7CC4FF]" : "text-[#FFB38A]";
    } else if (language === "http") {
      cls = m[1] ? "text-white/50 italic" : m[2] ? "text-[#9BE3B8]" : m[3] ? "text-brand-bright font-semibold" : m[4] ? "text-[#7CC4FF]" : "text-[#FFB38A]";
    } else {
      cls = m[1] ? "text-[#7CC4FF]" : m[2] ? "text-[#9BE3B8]" : "text-[#FFB38A]";
    }
    out.push(
      <span key={i++} className={cls}>
        {text}
      </span>,
    );
    last = m.index + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodePanel({
  code,
  language,
  filename,
  className,
}: {
  code: string;
  language: CodeLanguage;
  filename: string;
  className?: string;
}) {
  const lines = code.split("\n");
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-white/10 bg-ink-panel shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <span className="font-code text-[11.5px] text-white/60">{filename}</span>
        <span className="font-code text-[10px] uppercase tracking-wider text-white/45">{language}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-code text-[12.5px] leading-[1.75] text-white">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            <span className="mr-4 inline-block w-5 shrink-0 select-none text-right text-white/30">{i + 1}</span>
            <span className="whitespace-pre">{highlight(l, language)}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

export const DSL_SAMPLE = `{
  "operator": "AND",
  "conditions": [
    { "indicator": "rsi_14", "comparator": "<", "value": 30 },
    { "indicator": "close", "comparator": "crosses_above",
      "value_ref": "sma_50" }
  ]
}`;

/** Recurring failure modes, asked straight of the source table. */
export const RECURRING_SQL = `-- recurring failure modes: the same regime + trigger, again and again
SELECT regime_at_failure, trigger_condition, count(*) AS occurrences
FROM failures
WHERE organization_id = :organization_id
GROUP BY regime_at_failure, trigger_condition
HAVING count(*) >= 3
ORDER BY occurrences DESC;`;

/** Evolutionary lineage: walk parent_strategy_id back to the founding idea. */
export const LINEAGE_SQL = `-- lineage: every ancestor of one strategy, nearest first
WITH RECURSIVE lineage AS (
  SELECT id, name, parent_strategy_id, 0 AS depth
  FROM strategies
  WHERE id = :strategy_id AND organization_id = :organization_id
  UNION ALL
  SELECT s.id, s.name, s.parent_strategy_id, l.depth + 1
  FROM strategies s JOIN lineage l ON s.id = l.parent_strategy_id
  WHERE s.organization_id = :organization_id
)
SELECT name, depth FROM lineage ORDER BY depth;`;

// ---------------------------------------------------------------------------
// Research Memory map (6 record types, 8 relationships) — interactive
// ---------------------------------------------------------------------------

const NODES = {
  Strategy: { x: 300, y: 170, color: "#4B3FD1" },
  Regime: { x: 520, y: 70, color: "#1E9E63" },
  Performance: { x: 520, y: 280, color: "#2F86D6" },
  Failure: { x: 300, y: 370, color: "#C2362B" },
  ResearchNote: { x: 80, y: 80, color: "#E59A1A" },
  Researcher: { x: 80, y: 290, color: "#5E6679" },
} as const;

type NodeName = keyof typeof NODES;

export const SCHEMA_EDGES: { edge: string; from: NodeName; to: NodeName; meaning: string; bend?: number }[] = [
  { edge: "VALID_IN", from: "Strategy", to: "Regime", meaning: "Strategy has positive Sharpe in this regime", bend: -40 },
  { edge: "FAILED_IN", from: "Strategy", to: "Regime", meaning: "Strategy failed in this regime", bend: 40 },
  { edge: "MUTATED_FROM", from: "Strategy", to: "Strategy", meaning: "Genetic-algorithm offspring of a parent" },
  { edge: "ADAPTED_FROM", from: "Strategy", to: "Strategy", meaning: "Human- or LLM-derived from a parent" },
  { edge: "INSPIRED_BY", from: "Strategy", to: "ResearchNote", meaning: "Strategy originated from a research note" },
  { edge: "EVALUATED_BY", from: "Strategy", to: "Performance", meaning: "Regime-partitioned performance snapshot" },
  { edge: "CAUSED_BY", from: "Failure", to: "Performance", meaning: "The performance state at the moment of failure" },
  { edge: "AUTHORED_BY", from: "ResearchNote", to: "Researcher", meaning: "Who wrote the note" },
];

function edgePath(from: NodeName, to: NodeName, bend = 0, index = 0) {
  const a = NODES[from];
  const b = NODES[to];
  if (from === to) {
    const r = index === 2 ? 52 : 74;
    return `M ${a.x - 22} ${a.y - 26} C ${a.x - r} ${a.y - r - 40}, ${a.x + r} ${a.y - r - 40}, ${a.x + 22} ${a.y - 26}`;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

export function MemoryMap({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const activeEdge = active === null ? null : SCHEMA_EDGES[active];
  const isLit = (n: NodeName) => !activeEdge || activeEdge.from === n || activeEdge.to === n;

  return (
    <div className={cn("grid gap-6", !compact && "lg:grid-cols-[1.25fr_1fr] lg:items-center", className)}>
      <div className="rounded-2xl border border-line bg-paper-raised p-3">
        <svg viewBox="0 0 600 440" className="h-auto w-full" role="img" aria-label="Research Memory map: six record types connected by eight relationship types">
          <defs>
            <marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8A90A2" />
            </marker>
            <marker id="mm-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#4B3FD1" />
            </marker>
          </defs>
          {SCHEMA_EDGES.map((e, i) => {
            const on = active === i;
            const dim = active !== null && !on;
            return (
              <path
                key={e.edge}
                d={edgePath(e.from, e.to, e.bend, i)}
                fill="none"
                stroke={on ? "#4B3FD1" : "#B9BCC8"}
                strokeWidth={on ? 2.5 : 1.5}
                strokeDasharray={e.edge === "FAILED_IN" ? "5 4" : undefined}
                opacity={dim ? 0.25 : 1}
                markerEnd={`url(#${on ? "mm-arrow-on" : "mm-arrow"})`}
                className="transition-all duration-200"
              />
            );
          })}
          {(Object.keys(NODES) as NodeName[]).map((n) => {
            const node = NODES[n];
            const lit = isLit(n);
            const w = n.length * 8.6 + 34;
            return (
              <g key={n} opacity={lit ? 1 : 0.3} className="transition-opacity duration-200">
                <rect x={node.x - w / 2} y={node.y - 19} width={w} height={38} rx={19} fill="#FFFFFF" stroke={node.color} strokeWidth={1.6} />
                <circle cx={node.x - w / 2 + 17} cy={node.y} r={5} fill={node.color} />
                <text x={node.x + 6} y={node.y + 5} textAnchor="middle" fontSize="14" fontWeight="600" fill="#0E1220" fontFamily="var(--font-jetbrains), monospace">
                  {n}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ul className={cn(compact ? "flex flex-wrap gap-1.5" : "grid gap-1.5")} onMouseLeave={() => setActive(null)}>
        {SCHEMA_EDGES.map((e, i) => (
          <li key={e.edge}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              title={compact ? `${e.from} → ${e.to}: ${e.meaning}` : undefined}
              className={cn(
                "rounded-xl border text-left transition-colors",
                compact ? "px-3 py-1.5" : "w-full px-4 py-2.5",
                active === i
                  ? "border-brand/40 bg-brand-tint"
                  : compact
                    ? "border-line bg-paper-raised hover:border-brand/30"
                    : "border-transparent hover:border-line hover:bg-paper-raised",
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("font-code text-[12.5px] font-semibold", e.edge === "FAILED_IN" ? "text-loss" : "text-brand")}>
                  {e.edge}
                </span>
                {!compact && (
                  <span className="font-code text-[11px] text-ink-3">
                    {e.from} → {e.to}
                  </span>
                )}
              </span>
              {!compact && <span className="mt-0.5 block text-[13px] text-ink-2">{e.meaning}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger (list of immutable failure entries)
// ---------------------------------------------------------------------------

const LEDGER: { id: string; strategy: string; regime: RegimeKey; trigger: string; when: string }[] = [
  { id: "F-0412", strategy: "RSI Reversal v3", regime: "crisis", trigger: "drawdown_breach", when: "2026-03-09" },
  { id: "F-0398", strategy: "Momentum 12-1", regime: "hvol", trigger: "regime_mismatch", when: "2026-02-21" },
  { id: "F-0371", strategy: "Pairs · XLE/XOP", regime: "bear", trigger: "sharpe_decline", when: "2026-01-30" },
  { id: "F-0355", strategy: "Vol Carry v2", regime: "crisis", trigger: "drawdown_breach", when: "2025-12-12" },
];

export function FailureLedger({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-paper-raised", className)}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="font-code text-[12px] font-semibold text-ink">failures</span>
        <span className="flex items-center gap-1.5 font-code text-[11px] text-ink-3">
          <Lock className="h-3 w-3" /> REVOKE UPDATE, DELETE
        </span>
      </div>
      <ul className="divide-y divide-line">
        {LEDGER.map((row) => (
          <li key={row.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-5 py-3">
            <span className="font-code text-[12px] font-medium text-ink-3">{row.id}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-ink">{row.strategy}</span>
              <span className="block font-code text-[11.5px] text-loss">{row.trigger}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <RegimeChip regime={row.regime} />
              <span className="font-code text-[11px] text-ink-3">{row.when}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-paper-sunken/60 px-5 py-2.5 text-[11.5px] text-ink-3">Sample entries · every row is permanent</p>
    </div>
  );
}
