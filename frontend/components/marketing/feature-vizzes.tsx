import { REGIMES } from "@/lib/marketing/content";

/**
 * Lightweight, dependency-free mini-visualizations for the Features page
 * (Batch 15). Each renders a real product artifact (a regime timeline, a
 * per-regime metric split, the five-method validation composite, a failure
 * record, a GA fitness curve, an LLM audit row) rather than a decorative icon.
 * All SVG/DOM — no chart library in the bundle.
 */

// Deterministic pseudo-random regime pattern (stable across renders/SSR).
const REGIME_PATTERN = [0, 0, 3, 3, 4, 5, 1, 1, 3, 0, 0, 0, 2, 2, 5, 4, 1, 3, 3, 0, 0, 2, 4, 0];

// Cold Precision: the timeline reads as intensity of one blue, not six hues.
const REGIME_BLUES = ["#B8D1FF", "#003399", "#7FA8FF", "#DCE7FF", "#4D8AFF", "#0066FF"];

export function RegimeTimelineMini() {
  const seg = 100 / REGIME_PATTERN.length;
  return (
    <div>
      <svg viewBox="0 0 100 14" className="w-full" preserveAspectRatio="none" role="img" aria-label="Regime timeline">
        {REGIME_PATTERN.map((r, i) => (
          <rect key={i} x={i * seg} y={0} width={seg + 0.4} height={14} fill={REGIME_BLUES[r]} />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {REGIMES.map((r, i) => (
          <span key={r.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: REGIME_BLUES[i] }} /> {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const REGIME_SHARPE: { regime: string; sharpe: number }[] = [
  { regime: "Bull", sharpe: 1.94 },
  { regime: "Sideways", sharpe: 0.71 },
  { regime: "High-Volatility", sharpe: 0.33 },
  { regime: "Bear", sharpe: -0.28 },
  { regime: "Crisis", sharpe: -1.12 },
];

export function RegimeMetricTable() {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-2 font-medium">Regime</th>
          <th className="py-2 text-right font-medium">Sharpe</th>
        </tr>
      </thead>
      <tbody>
        {REGIME_SHARPE.map((row) => (
          <tr key={row.regime} className="border-b border-border/50">
            <td className="py-2">{row.regime}</td>
            <td className={`py-2 text-right font-mono ${row.sharpe < 0 ? "text-destructive" : "text-emerald-700"}`}>
              {row.sharpe.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const VALIDATION_METHODS: { name: string; weight: number; score: number }[] = [
  { name: "Walk-Forward", weight: 30, score: 0.78 },
  { name: "Regime CV", weight: 30, score: 0.66 },
  { name: "Monte-Carlo", weight: 20, score: 0.81 },
  { name: "Persistence", weight: 10, score: 0.72 },
  { name: "Stress Test", weight: 10, score: 0.59 },
];

export function ValidationComposite() {
  const composite =
    VALIDATION_METHODS.reduce((acc, m) => acc + m.score * m.weight, 0) /
    VALIDATION_METHODS.reduce((acc, m) => acc + m.weight, 0);
  return (
    <div>
      <div className="space-y-2.5">
        {VALIDATION_METHODS.map((m) => (
          <div key={m.name}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {m.name} <span className="text-foreground/50">· {m.weight}%</span>
              </span>
              <span className="font-mono">{m.score.toFixed(2)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E8F0FF]">
              <div className="h-full rounded-full bg-accent" style={{ width: `${m.score * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
        <span className="text-sm">Composite robustness</span>
        <span className="font-mono text-lg font-semibold text-accent">{composite.toFixed(2)}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Above 0.70 → eligible for promotion to active.</p>
    </div>
  );
}

const SHAP_TOP: { feature: string; value: number }[] = [
  { feature: "realized_vol_20", value: 0.41 },
  { feature: "rsi_14", value: -0.27 },
  { feature: "atr_14", value: 0.19 },
];

export function FailureRecordMini() {
  const max = Math.max(...SHAP_TOP.map((s) => Math.abs(s.value)));
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-destructive/20 px-2 py-0.5 font-medium text-destructive">FAILED_IN Crisis</span>
        <span className="rounded-md bg-[#E8F0FF] px-2 py-0.5 font-mono text-muted-foreground">drawdown_breach</span>
        <span className="text-muted-foreground">append-only · immutable</span>
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Top SHAP attribution</p>
      <div className="mt-2 space-y-2">
        {SHAP_TOP.map((s) => (
          <div key={s.feature} className="flex items-center gap-2">
            <span className="w-28 shrink-0 font-mono text-xs">{s.feature}</span>
            <div className="relative h-2 flex-1 rounded-full bg-[#E8F0FF]">
              <div
                className={`absolute top-0 h-full rounded-full ${s.value < 0 ? "bg-[#7FA8FF]" : "bg-[#0066FF]"}`}
                style={{ width: `${(Math.abs(s.value) / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-xs text-muted-foreground">{s.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FITNESS = [0.31, 0.42, 0.48, 0.55, 0.58, 0.63, 0.66, 0.68, 0.69, 0.695];

export function FitnessChartMini() {
  const w = 260;
  const h = 90;
  const max = Math.max(...FITNESS);
  const min = Math.min(...FITNESS);
  const pts = FITNESS.map((f, i) => {
    const x = (i / (FITNESS.length - 1)) * w;
    const y = h - ((f - min) / (max - min || 1)) * (h - 12) - 6;
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Best fitness over generations">
        <polyline points={pts.join(" ")} fill="none" stroke="#0066FF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {FITNESS.map((f, i) => {
          const x = (i / (FITNESS.length - 1)) * w;
          const y = h - ((f - min) / (max - min || 1)) * (h - 12) - 6;
          return <circle key={i} cx={x} cy={y} r={2.4} fill="#0066FF" />;
        })}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">Best fitness across 10 generations — adaptive-sigma convergence.</p>
    </div>
  );
}

export function LlmAuditRowMini() {
  return (
    <div className="rounded-lg border border-border bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <code className="font-mono text-xs text-accent">explain_failure</code>
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          numeric claims validated ✓
        </span>
      </div>
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Response (structured)</p>
      <p className="mt-1 leading-relaxed text-muted-foreground">
        “The strategy failed in the Crisis regime as realized volatility spiked; its max_drawdown of{" "}
        <span className="font-mono text-foreground">-0.34</span> breached the configured tolerance.”
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Every number is cross-checked against the real record before this response is shown.
      </p>
    </div>
  );
}
