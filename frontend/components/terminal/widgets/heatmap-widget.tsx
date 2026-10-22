"use client";

import { useQuery } from "@tanstack/react-query";
import { hierarchy, treemap, treemapSquarify } from "d3";
import { useEffect, useMemo, useRef, useState } from "react";

import { ErrorState, Loading, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtPct, terminalApi, type HeatmapPayload } from "@/lib/terminal";

/** Diverging red–grey–green scale, clamped at ±3%. */
function tileColor(pct: number | null): string {
  if (pct == null) return "#1A1C23";
  const x = Math.max(-3, Math.min(3, pct)) / 3;
  if (x >= 0) return `rgba(52, 211, 153, ${0.18 + 0.62 * x})`;
  return `rgba(248, 113, 113, ${0.18 + 0.62 * -x})`;
}

interface Leaf {
  name: string;
  symbol?: string;
  sector?: string;
  change?: number | null;
  value?: number;
  children?: Leaf[];
}

export default function HeatmapWidget({ onSelect }: { onSelect: (s: string) => void }) {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "heatmap"], queryFn: terminalApi.heatmap, refetchInterval: 60_000 });
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const data: HeatmapPayload | undefined = q.data;
    if (!data || size.w < 10 || size.h < 10) return null;
    const root: Leaf = {
      name: "market",
      children: data.sectors.map((s) => ({
        name: s.sector,
        children: s.tiles
          .filter((t) => t.size && t.size > 0)
          .map((t) => ({ name: t.name, symbol: t.symbol, sector: s.sector, change: t.change_pct, value: t.size ?? 0 })),
      })),
    };
    const h = hierarchy<Leaf>(root)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<Leaf>().tile(treemapSquarify).size([size.w, size.h]).paddingTop(14).paddingInner(1).paddingOuter(1)(h);
  }, [q.data, size]);

  return (
    <div className="flex h-full flex-col">
      <div ref={box} className="relative min-h-0 flex-1">
        {q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data ? (
          <Loading />
        ) : (
          layout && (
            <svg width={size.w} height={size.h} role="img" aria-label="Sector heatmap">
              {layout.children?.map((sector) => (
                <g key={sector.data.name}>
                  <text x={sector.x0 + 3} y={sector.y0 + 10} className="fill-[#9A9DA8] font-mono" fontSize={9}>
                    {sector.data.name.toUpperCase()}
                  </text>
                  {sector.leaves().map((leaf) => {
                    const w = leaf.x1 - leaf.x0;
                    const hgt = leaf.y1 - leaf.y0;
                    return (
                      <g key={leaf.data.symbol} onClick={() => leaf.data.symbol && onSelect(leaf.data.symbol)} className="cursor-pointer">
                        <title>{`${leaf.data.symbol} · ${leaf.data.name} · ${fmtPct(leaf.data.change ?? null)}`}</title>
                        <rect x={leaf.x0} y={leaf.y0} width={w} height={hgt} fill={tileColor(leaf.data.change ?? null)} rx={2} />
                        {w > 34 && hgt > 22 && (
                          <>
                            <text x={leaf.x0 + w / 2} y={leaf.y0 + hgt / 2 - 1} textAnchor="middle" className="fill-[#F5F5F7] font-mono font-semibold" fontSize={Math.min(14, Math.max(9, w / 6))}>
                              {leaf.data.symbol}
                            </text>
                            <text x={leaf.x0 + w / 2} y={leaf.y0 + hgt / 2 + 11} textAnchor="middle" className="fill-[#E5E7EB] font-mono" fontSize={9}>
                              {fmtPct(leaf.data.change ?? null)}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
          )
        )}
      </div>
      {q.data && (
        <footer className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
          {q.data.size_note}. Colour: % change today (±3% scale). {q.data.universe_note} {q.data.data_delay_note}.
        </footer>
      )}
    </div>
  );
}
