"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The animated four-layer architecture diagram (Batch 15) — the product's hero
 * visual, deliberately NOT a stock gradient blob. Pure SVG so the layers and the
 * pulsing blue data-flow connectors always stay aligned as one scaling unit
 * (Cold Precision: electric-blue lines, deep-blue chips, white bands).
 *
 * - variant="hero": decorative, connectors flow continuously.
 * - variant="interactive": hover (and optional filter buttons) highlight a layer
 *   and dim the rest — reused on Product Overview and Architecture.
 */

type Layer = { id: string; title: string; chips: string[] };

const LAYERS: Layer[] = [
  { id: "data", title: "Data & Feature Engineering", chips: ["OHLCV Ingestion", "15+ Indicators", "Temporal Isolation"] },
  {
    id: "intelligence",
    title: "Intelligence Layer",
    chips: ["Regime Detection", "Backtesting", "Validation", "Failure Intel", "Evolution", "LLM Assistant"],
  },
  { id: "memory", title: "Memory Layer", chips: ["PostgreSQL + TimescaleDB", "Neo4j Graph"] },
  { id: "application", title: "Application Layer", chips: ["FastAPI API", "Next.js Dashboard"] },
];

const W = 760;
const PAD = 24;
const BAND_W = W - PAD * 2;
const BANDS = [
  { y: 24, h: 84 },
  { y: 156, h: 152 },
  { y: 356, h: 84 },
  { y: 488, h: 84 },
];
const H = 596;

function chipRows(chips: string[]): string[][] {
  if (chips.length <= 3) return [chips];
  const mid = Math.ceil(chips.length / 2);
  return [chips.slice(0, mid), chips.slice(mid)];
}

export function ArchitectureDiagram({
  variant = "hero",
  showFilters = false,
  className,
}: {
  variant?: "hero" | "interactive";
  showFilters?: boolean;
  className?: string;
}) {
  const interactive = variant === "interactive";
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = interactive ? (hovered ?? pinned) : null;

  return (
    <div className={cn("w-full", className)}>
      {showFilters && (
        <div className="mb-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setPinned(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              pinned === null
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            All layers
          </button>
          {LAYERS.map((layer, i) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setPinned(i)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                pinned === i
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {layer.title}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="flow-active w-full"
        role="img"
        aria-label="Stellix Labs four-layer architecture: Data, Intelligence, Memory, and Application layers connected by data flow."
      >
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F0F5FF" />
          </linearGradient>
        </defs>

        {/* connectors between adjacent bands */}
        {BANDS.slice(0, -1).map((band, i) => {
          const topY = band.y + band.h;
          const bottomY = BANDS[i + 1]!.y;
          const cx = W / 2;
          return (
            <g key={`conn-${i}`} opacity={active === null || active === i || active === i + 1 ? 1 : 0.25}>
              {[-70, 0, 70].map((dx) => (
                <line
                  key={dx}
                  className="flow-line"
                  x1={cx + dx}
                  y1={topY}
                  x2={cx + dx}
                  y2={bottomY}
                  stroke="#0066FF"
                  strokeWidth={1.5}
                  strokeDasharray="4 8"
                  strokeLinecap="round"
                  opacity={0.55}
                />
              ))}
            </g>
          );
        })}

        {/* layer bands */}
        {LAYERS.map((layer, i) => {
          const band = BANDS[i]!;
          const isActive = active === i;
          const dim = active !== null && !isActive;
          const rows = chipRows(layer.chips);
          const chipTop = band.y + 42;
          const rowH = 30;
          const innerPad = 18;
          return (
            <g
              key={layer.id}
              opacity={dim ? 0.35 : 1}
              style={{ transition: "opacity 0.25s ease" }}
              onMouseEnter={interactive ? () => setHovered(i) : undefined}
              onMouseLeave={interactive ? () => setHovered(null) : undefined}
              className={interactive ? "cursor-pointer" : undefined}
            >
              <rect
                x={PAD}
                y={band.y}
                width={BAND_W}
                height={band.h}
                rx={14}
                fill="url(#bandFill)"
                stroke={isActive ? "#0066FF" : "#E2E8F0"}
                strokeWidth={isActive ? 2 : 1}
              />
              <rect x={PAD} y={band.y} width={4} height={band.h} rx={2} fill="#0066FF" opacity={0.9} />
              <text x={PAD + 20} y={band.y + 26} fill="#0A0F1E" fontSize={15} fontWeight={600}>
                {layer.title}
              </text>

              {rows.map((row, ri) => {
                const n = row.length;
                const totalGap = 10 * (n - 1);
                const chipW = (BAND_W - innerPad * 2 - totalGap) / n;
                return row.map((chip, ci) => {
                  const x = PAD + innerPad + ci * (chipW + 10);
                  const y = chipTop + ri * rowH;
                  return (
                    <g key={`${chip}-${ci}`}>
                      <rect x={x} y={y} width={chipW} height={24} rx={6} fill="#003399" stroke="#003399" />
                      <circle
                        className="animate-pulse-node"
                        cx={x + 12}
                        cy={y + 12}
                        r={2.6}
                        fill="#9BC0FF"
                        style={{ animationDelay: `${(i + ci) * 0.25}s` }}
                      />
                      <text x={x + 22} y={y + 16} fill="#DCE7FF" fontSize={11}>
                        {chip}
                      </text>
                    </g>
                  );
                });
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
