"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { SITE_REGIMES, VALIDATION_METHODS } from "@/components/marketing/artifacts";
import { buttonClass } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

/**
 * Landing hero: a Bloomberg-style research terminal. A simulated feed streams
 * through market regimes; whenever it tips into Bear / High-Vol / Crisis a
 * failing sample strategy is caught and an append-only record is sealed into
 * the ledger. Visitors can type commands (REGM, FAIL, MEM, VAL, HELP, a
 * ticker, or a record id) or use the function keys. Everything is a clearly
 * labelled sample feed — no real market data or customer numbers.
 */

// Terminal palette — every text colour is ≥ 6:1 on the #0A0D14 panels.
const T = {
  amber: "#FFB224",
  text: "#E8EAF0",
  dim: "#98A1B5",
  green: "#3DDC84",
  red: "#FF6B5E",
  cyan: "#5CCFF5",
  violet: "#B3A8FF",
};

type RegimeKey = (typeof SITE_REGIMES)[number]["key"];
const REGIME = Object.fromEntries(SITE_REGIMES.map((r) => [r.key, r])) as Record<RegimeKey, (typeof SITE_REGIMES)[number]>;
const SHORT: Record<RegimeKey, string> = { bull: "BULL", bear: "BEAR", hvol: "HVOL", lvol: "LVOL", side: "SIDE", crisis: "CRSS" };
// Crisis's brand colour is too dark for a tag on black; lift it for the terminal.
const TAG_BG = (r: RegimeKey) => (r === "crisis" ? "#E0526F" : REGIME[r].color);

const DYNAMICS: Record<RegimeKey, { drift: number; vol: number }> = {
  bull: { drift: 0.3, vol: 0.55 },
  lvol: { drift: 0.1, vol: 0.28 },
  side: { drift: 0, vol: 0.45 },
  hvol: { drift: -0.08, vol: 1.35 },
  bear: { drift: -0.34, vol: 0.9 },
  crisis: { drift: -0.9, vol: 2.0 },
};

const NEXT: Record<RegimeKey, RegimeKey[]> = {
  bull: ["lvol", "side", "hvol", "bull"],
  lvol: ["bull", "side", "hvol"],
  side: ["bull", "bear", "lvol", "hvol"],
  hvol: ["bear", "crisis", "side", "bull"],
  bear: ["crisis", "side", "hvol", "bull"],
  crisis: ["bear", "hvol", "side"],
};

const FAILING: RegimeKey[] = ["bear", "hvol", "crisis"];
type FailKey = "crisis" | "hvol" | "bear";

type Rec = { strategy: string; trigger: string; dd: string; sharpe: string; shap: [string, number][]; siblings: number };

const RECORDS: Record<FailKey, Rec> = {
  crisis: {
    strategy: "RSI REVERSAL V3",
    trigger: "drawdown_breach",
    dd: "-18.4%",
    sharpe: "-1.12",
    shap: [["realized_vol_20", 0.41], ["rsi_14", 0.27], ["atr_14", 0.16], ["autocorr_5", 0.09], ["macd_hist", 0.07]],
    siblings: 3,
  },
  hvol: {
    strategy: "MOMENTUM 12-1",
    trigger: "regime_mismatch",
    dd: "-11.2%",
    sharpe: "-0.64",
    shap: [["atr_14", 0.38], ["realized_vol_20", 0.24], ["macd_hist", 0.19], ["bb_width_20", 0.11], ["rsi_14", 0.06]],
    siblings: 2,
  },
  bear: {
    strategy: "PAIRS XLE/XOP",
    trigger: "sharpe_decline",
    dd: "-7.9%",
    sharpe: "-0.41",
    shap: [["autocorr_5", 0.33], ["spread_z", 0.29], ["realized_vol_20", 0.17], ["volume_z", 0.12], ["rsi_14", 0.07]],
    siblings: 1,
  },
};

const MODELS = ["HMM", "PELT", "GMM", "GARCH"] as const;
const WATCH = [
  { sym: "SPY", px: 512.4 },
  { sym: "QQQ", px: 438.1 },
  { sym: "IWM", px: 201.7 },
  { sym: "TLT", px: 92.35 },
  { sym: "GLD", px: 214.9 },
  { sym: "BTC", px: 64210 },
  { sym: "XLE", px: 91.2 },
] as const;

const FUNCTIONS = [
  { key: "REGM", f: "F1", label: "Regime monitor" },
  { key: "FAIL", f: "F2", label: "Failure record" },
  { key: "MEM", f: "F3", label: "Memory lineage" },
  { key: "VAL", f: "F4", label: "Validation gate" },
  { key: "HELP", f: "F5", label: "Commands" },
] as const;
type Fn = (typeof FUNCTIONS)[number]["key"];

const POINTS = 110;
const TICK_MS = 160;
const MIN_RUN = 16;

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

type Point = { v: number; r: RegimeKey; fail?: number };
type Sim = { rand: () => number; regime: RegimeKey; run: number; v: number; t: number };
type Seal = { n: number; key: FailKey; t: number };
type TapeEvent = { id: number; t: number; kind: "SEAL" | "RGME"; text: string; color: string };

function step(sim: Sim): { point: Point; switched: RegimeKey | null } {
  let switched: RegimeKey | null = null;
  sim.run += 1;
  sim.t += 1;
  if (sim.run > MIN_RUN && sim.rand() < 0.065) {
    const choices = NEXT[sim.regime];
    const next = choices[Math.floor(sim.rand() * choices.length)]!;
    if (next !== sim.regime) {
      sim.regime = next;
      sim.run = 0;
      switched = next;
    }
  }
  const d = DYNAMICS[sim.regime];
  // gentle pull back toward 100 keeps the sample feed on-screen indefinitely
  sim.v = Math.max(40, sim.v + d.drift + (100 - sim.v) * 0.015 + d.vol * gauss(sim.rand));
  return { point: { v: sim.v, r: sim.regime }, switched };
}

function initial() {
  const sim: Sim = { rand: mulberry32(7), regime: "bull", run: 0, v: 100, t: 0 };
  const points: Point[] = [];
  for (let i = 0; i < POINTS; i++) points.push(step(sim).point);
  return { sim, points };
}

/** Simulated session clock: 09:30 open + one second per tick (deterministic, SSR-safe). */
function clock(t: number) {
  const s = 9 * 3600 + 30 * 60 + t;
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, "0");
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const recId = (n: number) => `F-0${412 + n}`;

// ---------------------------------------------------------------------------
// Small terminal pieces
// ---------------------------------------------------------------------------

function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between gap-2 border-b border-[#1C2230] bg-[#F58A07] px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-black">
      <span className="truncate">{children}</span>
      {right && <span className="shrink-0 font-semibold">{right}</span>}
    </div>
  );
}

function RegimeTag({ r }: { r: RegimeKey }) {
  return (
    <span className="inline-flex items-center rounded-[3px] px-1.5 py-px text-[10px] font-bold text-black" style={{ backgroundColor: TAG_BG(r) }}>
      {SHORT[r]}
    </span>
  );
}

function WatchRow({ sym, px, chg }: { sym: string; px: number; chg: number }) {
  const prev = useRef(px);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (px === prev.current) return;
    setFlash(px > prev.current ? "up" : "down");
    prev.current = px;
    const id = window.setTimeout(() => setFlash(null), 380);
    return () => window.clearTimeout(id);
  }, [px]);
  const up = chg >= 0;
  return (
    <span
      className={cn(
        "grid grid-cols-[30px_1fr_50px] items-center gap-1.5 px-2 py-[5px] text-[11px] transition-colors duration-300 md:grid-cols-[40px_1fr_58px] md:gap-2 md:px-2.5 md:text-[12px]",
        flash === "up" && "bg-[#3DDC84]/20",
        flash === "down" && "bg-[#FF6B5E]/20",
      )}
    >
      <span className="font-bold" style={{ color: T.amber }}>{sym}</span>
      <span className="text-right tabular-nums" style={{ color: T.text }}>
        {px >= 1000 ? px.toLocaleString("en-US", { maximumFractionDigits: 0 }) : px.toFixed(2)}
      </span>
      <span className="text-right tabular-nums" style={{ color: up ? T.green : T.red }}>
        {up ? "+" : ""}
        {chg.toFixed(2)}%
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main panels
// ---------------------------------------------------------------------------

function ChartPanel({ points, symbol, onOpen, activeSeal }: { points: Point[]; symbol: string; onOpen: (n: number) => void; activeSeal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    const pad = (hi - lo) * 0.15 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [points]);

  const W = 600;
  const H = 220;
  const dx = W / (points.length - 1);
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * dx).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  const bands: { from: number; to: number; r: RegimeKey }[] = [];
  points.forEach((p, i) => {
    const last = bands[bands.length - 1];
    if (last && last.r === p.r) last.to = i;
    else bands.push({ from: i, to: i, r: p.r });
  });

  const lastP = points[points.length - 1]!;
  const first = points[0]!;
  const chg = ((lastP.v - first.v) / first.v) * 100;
  const hp = hover !== null ? points[hover] : undefined;
  const ticks = [max - (max - min) * 0.1, (max + min) / 2, min + (max - min) * 0.1];
  const pct = (i: number) => (i / (points.length - 1)) * 100;

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const idx = Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, idx)));
  }

  return (
    <div className="flex h-[calc(100%-28px)] flex-col">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 pt-2.5">
        <span className="text-[15px] font-bold" style={{ color: T.amber }}>{symbol} US</span>
        <span className="text-[15px] font-bold tabular-nums" style={{ color: T.text }}>{lastP.v.toFixed(2)}</span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: chg >= 0 ? T.green : T.red }}>
          {chg >= 0 ? "▲ +" : "▼ "}
          {chg.toFixed(2)}%
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: T.dim }}>
          REGIME <RegimeTag r={lastP.r} />
        </span>
      </div>

      <div className="relative mx-3 mt-2 flex min-h-[200px] flex-1 gap-1">
        <div
          ref={boxRef}
          className="relative flex-1 cursor-crosshair"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Sample price chart for ${symbol}, current regime ${REGIME[lastP.r].label}`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="bt-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={T.amber} stopOpacity="0.28" />
                <stop offset="1" stopColor={T.amber} stopOpacity="0" />
              </linearGradient>
            </defs>
            {bands.map((b) => (
              <rect key={`${b.from}-${b.r}`} x={Math.max(0, b.from * dx - dx / 2)} width={(b.to - b.from + 1) * dx} y={0} height={H} fill={REGIME[b.r].color} opacity={0.15} />
            ))}
            {ticks.map((tv) => (
              <line key={tv} x1={0} x2={W} y1={y(tv)} y2={y(tv)} stroke="#2A3142" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill="url(#bt-area)" />
            <path d={line} fill="none" stroke={T.amber} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {hover !== null && <line x1={hover * dx} x2={hover * dx} y1={0} y2={H} stroke="#FFFFFF" strokeOpacity={0.45} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          </svg>

          {points.map((p, i) =>
            p.fail !== undefined ? (
              <button
                key={`f-${p.fail}`}
                type="button"
                onClick={() => onOpen(p.fail!)}
                className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 p-1"
                style={{ left: `${pct(i)}%`, top: `${(y(p.v) / H) * 100}%` }}
                aria-label={`Open failure record ${recId(p.fail)}`}
              >
                <span
                  className={cn("block h-2.5 w-2.5 rotate-45 border border-white transition-transform group-hover:scale-150", activeSeal === p.fail && "scale-125")}
                  style={{ backgroundColor: T.red, boxShadow: activeSeal === p.fail ? `0 0 10px ${T.red}` : undefined }}
                />
              </button>
            ) : null,
          )}

          <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: "100%", top: `${(y(lastP.v) / H) * 100}%` }}>
            <span className="absolute -inset-1.5 animate-ping rounded-full bg-[#FFB224]/50 motion-reduce:hidden" />
            <span className="relative block h-2 w-2 rounded-full bg-[#FFB224]" />
          </span>

          {hp && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap border border-[#2A3142] bg-black px-2 py-1 text-[10.5px]"
              style={{ left: `${Math.min(85, Math.max(15, pct(hover)))}%`, color: T.text }}
            >
              <RegimeTag r={hp.r} /> <span className="ml-1 tabular-nums">{hp.v.toFixed(2)}</span>{" "}
              <span style={{ color: T.dim }}>{hover}s ago</span>
            </div>
          )}
        </div>

        {/* y-axis */}
        <div className="pointer-events-none relative w-[40px] shrink-0">
          {ticks.map((tv) => (
            <span key={tv} className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums" style={{ top: `${(y(tv) / H) * 100}%`, color: T.dim }}>
              {tv.toFixed(1)}
            </span>
          ))}
          <span
            className="absolute right-0 -translate-y-1/2 rounded-[2px] px-1 text-[10px] font-bold tabular-nums text-black"
            style={{ top: `${(y(lastP.v) / H) * 100}%`, backgroundColor: T.amber }}
          >
            {lastP.v.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="mb-2.5 ml-3 mr-[56px] mt-2 flex h-1.5 overflow-hidden">
        {bands.map((b) => (
          <span key={`s-${b.from}-${b.r}`} style={{ flexGrow: b.to - b.from + 1, backgroundColor: REGIME[b.r].color }} />
        ))}
      </div>
    </div>
  );
}

function FailPanel({ seal }: { seal: Seal }) {
  const rec = RECORDS[seal.key];
  const max = rec.shap[0]![1];
  return (
    <div key={seal.n} className="animate-rise-in space-y-3.5 px-3 py-3 motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold" style={{ color: T.amber }}>{recId(seal.n)}</span>
        <span className="text-[13px] font-bold" style={{ color: T.text }}>{rec.strategy}</span>
        <span className="ml-auto rounded-[3px] border border-[#2A3142] px-1.5 text-[10px]" style={{ color: T.dim }}>APPEND-ONLY · SEALED {clock(seal.t)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-[10px]" style={{ color: T.dim }}>BROKE IN</dt>
          <dd className="mt-0.5"><RegimeTag r={seal.key} /></dd>
        </div>
        <div>
          <dt className="text-[10px]" style={{ color: T.dim }}>TRIGGER</dt>
          <dd className="mt-0.5 font-bold" style={{ color: T.red }}>{rec.trigger}</dd>
        </div>
        <div>
          <dt className="text-[10px]" style={{ color: T.dim }}>MAX DD</dt>
          <dd className="mt-0.5 font-bold tabular-nums" style={{ color: T.red }}>{rec.dd}</dd>
        </div>
        <div>
          <dt className="text-[10px]" style={{ color: T.dim }}>SHARPE @ FAIL</dt>
          <dd className="mt-0.5 font-bold tabular-nums" style={{ color: T.text }}>{rec.sharpe}</dd>
        </div>
      </dl>
      <div>
        <p className="text-[10px]" style={{ color: T.dim }}>SHAP ATTRIBUTION · TOP 5 |φ|</p>
        <ul className="mt-1.5 space-y-1.5">
          {rec.shap.map(([f, v], i) => (
            <li key={f} className="grid grid-cols-[120px_1fr_34px] items-center gap-2 text-[11.5px]">
              <span className="truncate" style={{ color: T.text }}>{f}</span>
              <span className="h-2 bg-[#161B26]">
                <span
                  className="block h-full origin-left animate-grow-x motion-reduce:animate-none"
                  style={{ width: `${(v / max) * 100}%`, animationDelay: `${70 * i}ms`, backgroundColor: i === 0 ? T.red : T.cyan, opacity: i === 0 ? 1 : 1 - i * 0.12 }}
                />
              </span>
              <span className="text-right tabular-nums" style={{ color: T.text }}>{v.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11.5px]" style={{ color: T.dim }}>
        <span style={{ color: T.violet }}>(:Strategy)</span>-[<span style={{ color: T.amber }}>FAILED_IN</span>]→
        <span style={{ color: T.violet }}>(:Regime {`{${REGIME[seal.key].label}}`})</span> · linked to {rec.siblings} sibling failures
      </p>
    </div>
  );
}

function MemoryPanel({ seal, seals }: { seal: Seal; seals: Seal[] }) {
  const rec = RECORDS[seal.key];
  const siblings = seals.filter((s) => s.key === seal.key && s.n !== seal.n).slice(-3);
  const rows: [string, string, string][] = [
    [`(:Strategy {${rec.strategy}})`, "FAILED_IN", `(:Regime {${REGIME[seal.key].label}})`],
    [`(:Failure {${recId(seal.n)}})`, "CAUSED_BY", "(:Performance {at_failure})"],
    [`(:Strategy {${rec.strategy}})`, "INSPIRED_BY", "(:ResearchNote {RN-118})"],
    ["(:ResearchNote {RN-118})", "AUTHORED_BY", "(:Researcher {sample})"],
    [`(:Strategy {${rec.strategy} V4})`, "MUTATED_FROM", `(:Strategy {${rec.strategy}})`],
  ];
  return (
    <div key={seal.n} className="animate-rise-in space-y-2 px-3 py-3 text-[11.5px] motion-reduce:animate-none">
      <p className="truncate text-[10.5px]" style={{ color: T.dim }}>
        RESEARCH MEMORY · DERIVED FROM POSTGRESQL · organization_id = <span style={{ color: T.amber }}>:organization_id</span>
      </p>
      {rows.map(([a, e, b]) => (
        <p key={a + e} className="truncate">
          <span style={{ color: T.violet }}>{a}</span>
          <span style={{ color: T.dim }}>-[</span>
          <span style={{ color: e === "FAILED_IN" ? T.red : T.amber }}>{e}</span>
          <span style={{ color: T.dim }}>]→</span>
          <span style={{ color: T.cyan }}>{b}</span>
        </p>
      ))}
      <p className="pt-1.5" style={{ color: T.dim }}>
        SIBLING FAILURES IN {SHORT[seal.key]}:{" "}
        {siblings.length ? (
          siblings.map((s) => (
            <span key={s.n} className="mr-2 font-bold" style={{ color: T.amber }}>
              {recId(s.n)}
            </span>
          ))
        ) : (
          <span style={{ color: T.text }}>none yet this session</span>
        )}
      </p>
    </div>
  );
}

function ValPanel() {
  const composite = VALIDATION_METHODS.reduce((a, m) => a + (m.weight / 100) * m.score, 0);
  return (
    <div className="space-y-2.5 px-3 py-3 text-[11.5px]">
      {VALIDATION_METHODS.map((m) => (
        <div key={m.name} className="grid grid-cols-[170px_1fr_36px] items-center gap-2">
          <span className="truncate uppercase" style={{ color: T.text }}>
            {m.name} <span style={{ color: T.dim }}>{m.weight}%</span>
          </span>
          <span className="relative h-2 bg-[#161B26]">
            <span className="absolute inset-y-0 left-0 origin-left animate-grow-x" style={{ width: `${m.score * 100}%`, backgroundColor: m.score >= 0.7 ? T.green : T.amber }} />
            <span className="absolute -top-1 h-4 w-px bg-white/70" style={{ left: "70%" }} />
          </span>
          <span className="text-right tabular-nums" style={{ color: T.text }}>{m.score.toFixed(2)}</span>
        </div>
      ))}
      <p className="pt-1" style={{ color: T.dim }}>
        COMPOSITE <span className="font-bold" style={{ color: T.text }}>{composite.toFixed(2)}</span> · GATE ≥ 0.70 ·{" "}
        <span className="font-bold" style={{ color: composite >= 0.7 ? T.green : T.amber }}>{composite >= 0.7 ? "PROMOTABLE" : "CANDIDATE"}</span>
      </p>
    </div>
  );
}

function HelpPanel({ run }: { run: (c: string) => void }) {
  const rows: [string, string][] = [
    ["REGM", "Regime monitor with the live chart"],
    ["FAIL", "Open the latest sealed failure record"],
    ["MEM", "Research Memory lineage of the selected failure"],
    ["VAL", "Five-method validation gate"],
    ["QQQ", "Any watchlist ticker switches the chart"],
    ["F-0412", "Open a specific record by id"],
  ];
  return (
    <div className="space-y-1 px-3 py-3 text-[11.5px]">
      {rows.map(([c, d]) => (
        <button key={c} type="button" onClick={() => run(c)} className="flex w-full items-center gap-4 px-1 py-1 text-left hover:bg-[#141A26]">
          <span className="w-[80px] shrink-0 font-bold" style={{ color: T.amber }}>{c}</span>
          <span style={{ color: T.text }}>{d}</span>
        </button>
      ))}
      <p className="px-1 pt-2" style={{ color: T.dim }}>Type a command and press &lt;GO&gt; (Enter), click one above, or use F1–F5.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

function Terminal({ reduced }: { reduced: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const simRef = useRef<Sim | null>(null);
  const [points, setPoints] = useState<Point[]>(() => {
    const init = initial();
    simRef.current = init.sim;
    return init.points;
  });
  const [t, setT] = useState(POINTS);
  const [seals, setSeals] = useState<Seal[]>([{ n: 0, key: "crisis", t: 12 }]);
  const [events, setEvents] = useState<TapeEvent[]>([
    { id: 0, t: 12, kind: "SEAL", text: `${recId(0)} ${RECORDS.crisis.strategy} · drawdown_breach · CRSS`, color: T.red },
  ]);
  const [activeSeal, setActiveSeal] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [fn, setFn] = useState<Fn>("REGM");
  const [symbol, setSymbol] = useState("SPY");
  const [cmd, setCmd] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [watch, setWatch] = useState<{ sym: string; base: number; cur: number }[]>(() =>
    WATCH.map((w) => ({ sym: w.sym, base: w.px, cur: w.px })),
  );
  const [inView, setInView] = useState(true);

  const sealCount = useRef(0);
  const eventId = useRef(1);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

  const regime = points[points.length - 1]!.r;
  // three models agree, one dissents in a rotating seat — confidence 0.75
  const votes = MODELS.map((_, i) => (i === Math.floor(t / 37) % 4 ? NEXT[regime][0]! : regime));

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !inView) return;
    const wrand = mulberry32(99);
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (document.hidden || !sim) return;
      const { point, switched } = step(sim);
      const now = sim.t;
      if (switched) {
        const regimeEv: TapeEvent = { id: eventId.current++, t: now, kind: "RGME", text: `REGIME → ${SHORT[switched]} · ensemble 3/4`, color: T.cyan };
        let sealEv: TapeEvent | null = null;
        if ((FAILING as string[]).includes(switched)) {
          const n = ++sealCount.current;
          const key = switched as FailKey;
          point.fail = n;
          setSeals((prev) => [...prev.slice(-14), { n, key, t: now }]);
          if (!pinnedRef.current) setActiveSeal(n);
          sealEv = { id: eventId.current++, t: now, kind: "SEAL", text: `${recId(n)} ${RECORDS[key].strategy} · ${RECORDS[key].trigger} · ${SHORT[key]}`, color: T.red };
        }
        setEvents((prev) => [...(sealEv ? [sealEv] : []), regimeEv, ...prev].slice(0, 16));
      }
      if (now % 3 === 0) {
        const d = DYNAMICS[sim.regime];
        setWatch((prev) =>
          prev.map((w) => {
            if (wrand() < 0.45) return w;
            const move = (d.drift * 0.02 + d.vol * 0.06 * gauss(wrand)) / 100;
            return { ...w, cur: Math.max(w.base * 0.8, w.cur * (1 + move)) };
          }),
        );
      }
      setT(now);
      setPoints((s) => [...s.slice(1), point]);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced, inView]);

  const seal = seals.find((s) => s.n === activeSeal) ?? seals[seals.length - 1]!;

  const open = useCallback((n: number) => {
    setActiveSeal(n);
    setPinned(true);
    setFn("FAIL");
  }, []);

  function run(raw: string) {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    const fnHit = FUNCTIONS.find((f) => f.key === c || f.f === c);
    const rec = /^F-?0?(\d{3})$/.exec(c);
    const sym = WATCH.find((w) => w.sym === c);
    if (fnHit) {
      setFn(fnHit.key);
      if (fnHit.key === "FAIL" && !pinned) setActiveSeal(seals[seals.length - 1]!.n);
      setMsg({ text: `${fnHit.key} <GO> · ${fnHit.label.toUpperCase()}`, ok: true });
    } else if (rec) {
      const n = Number(rec[1]) - 412;
      if (seals.some((s) => s.n === n)) {
        open(n);
        setMsg({ text: `${recId(n)} <GO> · RECORD OPENED`, ok: true });
      } else setMsg({ text: `${c} NOT IN THIS SESSION · SEE FAILURE LEDGER`, ok: false });
    } else if (sym) {
      setSymbol(sym.sym);
      setFn("REGM");
      setMsg({ text: `${sym.sym} US <EQUITY> REGM <GO>`, ok: true });
    } else {
      setMsg({ text: `UNKNOWN COMMAND "${c}" · TYPE HELP`, ok: false });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(cmd);
    setCmd("");
  }

  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(null), 3200);
    return () => window.clearTimeout(id);
  }, [msg]);

  // F1–F5 shortcuts while focus is inside the terminal
  function onKeyDown(e: React.KeyboardEvent) {
    const m = /^F([1-5])$/.exec(e.key);
    if (!m) return;
    e.preventDefault();
    run(FUNCTIONS[Number(m[1]) - 1]!.key);
  }

  const sealed = seals[seals.length - 1]!.n + 1;
  const fnMeta = FUNCTIONS.find((f) => f.key === fn)!;

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input")) return;
        inputRef.current?.focus({ preventScroll: true });
      }}
      className="relative overflow-hidden rounded-xl border border-[#1C2230] bg-[#05070B] font-code text-[12px] text-[#E8EAF0] shadow-[0_50px_120px_-40px_rgba(14,18,32,0.75),0_0_0_1px_rgba(255,178,36,0.06)]"
    >
      {/* CRT scanlines */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-30 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.018)_0px,rgba(255,255,255,0.018)_1px,transparent_1px,transparent_3px)]" />

      {/* command line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#1C2230] bg-[#0A0D14] px-3 py-2">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <span className="font-bold tracking-[0.14em]" style={{ color: T.amber }}>STELLIX</span>
        <form onSubmit={onSubmit} className="order-last flex min-w-0 basis-full items-center gap-2 border border-[#2A3142] bg-black px-2 py-1 focus-within:border-[#FFB224] sm:order-none sm:basis-auto sm:flex-1">
          <span style={{ color: T.amber }}>&gt;</span>
          <label htmlFor="stx-cmd" className="sr-only">Terminal command</label>
          <input
            id="stx-cmd"
            ref={inputRef}
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="Type HELP, FAIL, MEM, QQQ, F-0412…"
            autoComplete="off"
            spellCheck={false}
            className="w-full min-w-0 bg-transparent uppercase text-[#E8EAF0] caret-[#FFB224] outline-none placeholder:normal-case placeholder:text-[#98A1B5]"
          />
          <button type="submit" className="shrink-0 rounded-[2px] bg-[#3DDC84] px-1.5 py-px text-[10.5px] font-bold text-black hover:brightness-110">
            &lt;GO&gt;
          </button>
        </form>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold sm:ml-0" style={{ color: T.green }}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3DDC84] opacity-70 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3DDC84]" />
          </span>
          LIVE
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: T.text }}>SIM {clock(t)}</span>
      </div>

      {/* function keys */}
      <div className="flex gap-px overflow-x-auto border-b border-[#1C2230] bg-[#1C2230] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Terminal functions">
        {FUNCTIONS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={fn === f.key}
            onClick={() => run(f.key)}
            className={cn("flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors", fn === f.key ? "bg-[#FFB224] text-black" : "bg-[#0A0D14] text-[#E8EAF0] hover:bg-[#141A26]")}
          >
            <span className={fn === f.key ? "text-black/65" : "text-[#98A1B5]"}>{f.f}</span>
            {f.key}
            <span className={cn("hidden font-medium lg:inline", fn === f.key ? "text-black/75" : "text-[#98A1B5]")}>{f.label}</span>
          </button>
        ))}
        <div className="flex-1 bg-[#0A0D14]" />
      </div>

      {/* message line */}
      <div className="flex h-7 items-center overflow-hidden border-b border-[#1C2230] bg-black px-3 text-[11px]">
        {msg ? (
          <span key={msg.text} className="animate-rise-in truncate" style={{ color: msg.ok ? T.green : T.red }}>
            {msg.text}
          </span>
        ) : pinned ? (
          <span className="truncate" style={{ color: T.dim }}>
            VIEWING {recId(seal.n)} ·{" "}
            <button
              type="button"
              className="font-bold underline underline-offset-2"
              style={{ color: T.amber }}
              onClick={() => {
                setPinned(false);
                setActiveSeal(seals[seals.length - 1]!.n);
              }}
            >
              RESUME LIVE
            </button>
          </span>
        ) : (
          <span className="truncate" style={{ color: T.dim }}>
            Click the terminal and type a command · hover the chart · click a ◆ or a ledger row to open its record
          </span>
        )}
      </div>

      {/* panels */}
      <div className="grid gap-px bg-[#1C2230] md:grid-cols-[210px_1fr] lg:grid-cols-[210px_1fr_270px]">
        <section className="bg-[#0A0D14]" aria-label="Watchlist">
          <PanelTitle right="LAST · CHG">Monitor</PanelTitle>
          <div className="grid grid-cols-2 md:block">
            {watch.map((w) => (
              <button
                key={w.sym}
                type="button"
                onClick={() => run(w.sym)}
                className={cn("block w-full text-left hover:bg-[#141A26]", symbol === w.sym && "bg-[#141A26] shadow-[inset_2px_0_0_#FFB224]")}
              >
                <WatchRow sym={w.sym} px={w.cur} chg={((w.cur - w.base) / w.base) * 100} />
              </button>
            ))}
          </div>
          <div className="border-t border-[#1C2230] px-2.5 py-2.5">
            <p className="text-[10px]" style={{ color: T.dim }}>ENSEMBLE VOTE</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {MODELS.map((m, i) => (
                <span key={m} className="flex items-center justify-between bg-[#141A26] px-1.5 py-1 text-[10.5px]">
                  <span style={{ color: T.dim }}>{m}</span>
                  <RegimeTag r={votes[i]!} />
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px]" style={{ color: T.dim }}>
              CONF <span className="font-bold" style={{ color: T.text }}>0.75</span> · LABEL <RegimeTag r={regime} />
            </p>
          </div>
        </section>

        <section className="min-h-[340px] bg-[#0A0D14]" aria-live="polite" aria-label="Main panel">
          <PanelTitle right={fn === "REGM" ? `${symbol} · 1 TICK = 1S` : fn === "FAIL" || fn === "MEM" ? recId(seal.n) : undefined}>{fnMeta.label}</PanelTitle>
          {fn === "REGM" && <ChartPanel points={points} symbol={symbol} onOpen={open} activeSeal={seal.n} />}
          {fn === "FAIL" && <FailPanel seal={seal} />}
          {fn === "MEM" && <MemoryPanel seal={seal} seals={seals} />}
          {fn === "VAL" && <ValPanel />}
          {fn === "HELP" && <HelpPanel run={run} />}
        </section>

        <section className="bg-[#0A0D14] md:col-span-2 lg:col-span-1" aria-label="Failure ledger">
          <PanelTitle right={`${sealed} SEALED`}>Failure ledger</PanelTitle>
          <ul className="max-h-[312px] divide-y divide-[#1C2230] overflow-hidden">
            {[...seals]
              .reverse()
              .slice(0, 8)
              .map((s) => (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => open(s.n)}
                    className={cn("w-full animate-rise-in px-2.5 py-1.5 text-left hover:bg-[#141A26] motion-reduce:animate-none", s.n === seal.n && "bg-[#141A26] shadow-[inset_2px_0_0_#FF6B5E]")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold" style={{ color: T.amber }}>{recId(s.n)}</span>
                      <span className="text-[10.5px] tabular-nums" style={{ color: T.dim }}>{clock(s.t)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate" style={{ color: T.text }}>{RECORDS[s.key].strategy}</span>
                      <RegimeTag r={s.key} />
                    </span>
                    <span className="block truncate text-[10.5px]" style={{ color: T.red }}>{RECORDS[s.key].trigger}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      </div>

      {/* event tape */}
      <div className="flex items-center gap-3 overflow-hidden border-t border-[#1C2230] bg-black py-1.5 pl-3 text-[11px]">
        <span className="shrink-0 rounded-[2px] bg-[#FF6B5E] px-1.5 font-bold text-black">EVENTS</span>
        <div className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(90deg,black_92%,transparent)]">
          <div className="inline-flex gap-8">
            {events.slice(0, 8).map((e) => (
              <span key={e.id} className="animate-rise-in motion-reduce:animate-none">
                <span className="tabular-nums" style={{ color: T.dim }}>{clock(e.t)}</span>{" "}
                <span className="font-bold" style={{ color: e.color }}>{e.kind}</span> <span style={{ color: T.text }}>{e.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* status bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#1C2230] bg-[#0A0D14] px-3 py-1.5 text-[10.5px]" style={{ color: T.dim }}>
        <span>SAMPLE FEED · NOT MARKET DATA</span>
        <span className="hidden md:inline">6 REGIMES · 4 MODELS · APPEND-ONLY LEDGER · TENANT-SCOPED</span>
        <span>
          <span className="font-bold" style={{ color: T.amber }}>HELP</span> &lt;GO&gt; FOR COMMANDS
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const HEADLINE = ["Research", "that", "remembers"];

function rise(reduced: boolean, delay: number) {
  if (reduced) return {};
  return {
    initial: { opacity: 0, y: 30, filter: "blur(10px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const },
  };
}

export function LiveHero() {
  const reduced = !!useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 20 });

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpot({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  }

  return (
    <section ref={sectionRef} onPointerMove={reduced ? undefined : onPointerMove} className="grain relative isolate overflow-hidden">
      {/* colour grade */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#F4F2FF_0%,#F8F7F4_45%,#F1EFEA_100%)]" />
      <div aria-hidden className="pointer-events-none absolute -right-[10%] -top-[12%] -z-10 h-[620px] w-[820px] animate-aurora rounded-full bg-[radial-gradient(closest-side,#CFC7FF,transparent)] opacity-90 blur-[40px] motion-reduce:animate-none" />
      <div aria-hidden className="pointer-events-none absolute -left-[12%] top-[30%] -z-10 h-[520px] w-[720px] animate-aurora-slow rounded-full bg-[radial-gradient(closest-side,#FFE2BF,transparent)] opacity-90 blur-[40px] motion-reduce:animate-none" />
      <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,black_25%,transparent_75%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: `radial-gradient(560px circle at ${spot.x}% ${spot.y}%, rgba(75,63,209,0.10), transparent 65%)` }} />

      <div className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16 lg:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div {...rise(reduced, 0)}>
            <Link
              href="/features#failure-intelligence"
              className="group inline-flex items-center gap-2.5 rounded-full border border-line bg-paper-raised/80 py-1 pl-1 pr-3.5 text-[13px] font-medium text-ink-2 shadow-[0_1px_2px_rgba(14,18,32,0.05)] backdrop-blur transition-colors hover:border-brand/30"
            >
              <span className="rounded-full bg-ink px-2.5 py-0.5 font-code text-[11px] text-white">New</span>
              The research terminal, with SHAP failure autopsies
              <ArrowUpRight className="h-3.5 w-3.5 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          <h1 className="mt-8 font-editorial text-[clamp(2.6rem,6vw,5.25rem)] font-bold leading-[1.0] tracking-[-0.05em] text-ink">
            <span className="sr-only">Research that remembers why it failed.</span>
            <span aria-hidden>
              {HEADLINE.map((w, i) => (
                <motion.span key={w} className="mr-[0.22em] inline-block" {...rise(reduced, 0.08 + i * 0.07)}>
                  {w}
                </motion.span>
              ))}
              <br />
              <motion.span className="relative mr-[0.22em] inline-block" {...rise(reduced, 0.32)}>
                <span className="animate-gradient-x bg-[linear-gradient(100deg,#4B3FD1,#7A46E0,#C2362B,#7A46E0,#4B3FD1)] bg-[length:250%_100%] bg-clip-text text-transparent motion-reduce:animate-none">
                  why
                </span>
                <svg className="absolute -bottom-[0.1em] left-0 h-[0.3em] w-full overflow-visible" viewBox="0 0 120 20" preserveAspectRatio="none" aria-hidden>
                  <defs>
                    <linearGradient id="why-ul" x1="0" x2="1">
                      <stop offset="0" stopColor="#4B3FD1" />
                      <stop offset="1" stopColor="#F4B740" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d="M2 14 C 25 4, 45 4, 62 11 S 100 18, 118 6"
                    fill="none"
                    stroke="url(#why-ul)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    initial={reduced ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, delay: 0.95, ease: "easeInOut" }}
                  />
                </svg>
              </motion.span>
              {["it", "failed."].map((w, i) => (
                <motion.span key={w} className="mr-[0.22em] inline-block" {...rise(reduced, 0.4 + i * 0.07)}>
                  {w}
                </motion.span>
              ))}
            </span>
          </h1>

          <motion.p {...rise(reduced, 0.55)} className="mx-auto mt-7 max-w-2xl text-pretty text-[17px] leading-[1.7] text-ink-2 sm:text-lg">
            A research terminal that writes a permanent autopsy for every strategy that breaks — the regime it broke in, the trigger
            that caught it, the features that drove it — and links it into a research memory your whole desk can query.
          </motion.p>

          <motion.div {...rise(reduced, 0.65)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/contact" className={cn(buttonClass("primary", "lg"), "relative overflow-hidden")}>
              <span aria-hidden className="absolute inset-0 -translate-x-full animate-sheen bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden" />
              <span className="relative">Request a demo</span>
              <ArrowRight className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/register" className={buttonClass("secondary", "lg")}>
              Create a workspace
            </Link>
          </motion.div>
        </div>

        {/* CSS (not framer) entrance: runs on the compositor, so the terminal can never sit invisible */}
        <div className="relative mt-14 animate-rise-in [animation-delay:350ms] [animation-duration:900ms] sm:mt-16 motion-reduce:animate-none">
          <div aria-hidden className="absolute -inset-6 -z-10 rounded-[28px] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(255,178,36,0.22),rgba(75,63,209,0.18)_55%,transparent_80%)] blur-2xl" />
          <Terminal reduced={reduced} />
        </div>

        <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-6 text-center sm:grid-cols-4">
          {[
            ["6", "market regimes"],
            ["4", "ensemble models"],
            ["5", "validation methods"],
            ["0", "rewritable failures"],
          ].map(([v, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd>
                <span className="block font-editorial text-[34px] font-bold leading-none tracking-[-0.04em] text-ink">{v}</span>
                <span className="mt-1.5 block text-[13px] text-ink-3">{l}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
