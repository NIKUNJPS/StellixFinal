"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

import { getSectorHeatmap } from "@/lib/market-research";
import type { HeatmapResponse, HeatmapSector } from "@/lib/market-research-types";

const UP = "#34D399";
const DOWN = "#F87171";
const FLAT = "#3A3D46";

function colorFor(changePct: number | null): string {
  if (changePct === null) return FLAT;
  const clamped = Math.max(-4, Math.min(4, changePct)); // saturate at +/-4%
  const t = Math.abs(clamped) / 4;
  const base = changePct >= 0 ? UP : DOWN;
  // Blend toward the panel background at low magnitude so near-zero moves read as muted.
  const alpha = Math.round(40 + t * 180)
    .toString(16)
    .padStart(2, "0");
  return `${base}${alpha}`;
}

/** recharts spreads each Treemap node's own data fields directly onto the props
 * passed to `content` (TreemapNode is `{x,y,width,height,...} & T`), so the
 * flattened HeatmapSector fields (sector, avg_change_pct, ...) arrive as props
 * here directly — no need to index into a parent/children structure. */
function TileContent(
  props: { x?: number; y?: number; width?: number; height?: number } & Partial<HeatmapSector>,
) {
  const { x = 0, y = 0, width = 0, height = 0, sector, avg_change_pct = null } = props;
  if (!sector || width < 2 || height < 2) return null;
  const fill = colorFor(avg_change_pct);
  const showLabel = width > 70 && height > 36;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#07080B" strokeWidth={2} rx={6} />
      {showLabel && (
        <foreignObject x={x + 6} y={y + 6} width={width - 12} height={height - 12}>
          <div className="flex h-full flex-col justify-between overflow-hidden">
            <span className="truncate text-[11px] font-semibold text-white/90">{sector}</span>
            <span className="font-mono text-[13px] font-bold text-white">
              {avg_change_pct !== null ? `${avg_change_pct >= 0 ? "+" : ""}${avg_change_pct.toFixed(2)}%` : "n/a"}
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export function SectorHeatmap() {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSectorHeatmap()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load heatmap"));
    return () => {
      active = false;
    };
  }, []);

  if (error && !data) {
    return <p className="rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>;
  }
  if (!data) {
    return <div className="h-[320px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />;
  }

  const treemapData = data.sectors
    .filter((s) => s.total_dollar_volume !== null)
    .map((s) => ({ name: s.sector, size: s.total_dollar_volume as number, ...s }));

  return (
    <div>
      <p className="mb-2 text-[11px] text-[#666A76]">
        {data.universe_note} · tile size = today&apos;s dollar volume traded, color = dollar-volume-weighted average %
        change (not market capitalization).
      </p>
      {treemapData.length === 0 ? (
        <p className="py-10 text-center text-xs text-[#666A76]">No sector data available yet.</p>
      ) : (
        <div
          role="img"
          aria-label={`Sector heatmap across ${treemapData.length} sectors, sized by dollar volume, colored by percent change`}
        >
          <ResponsiveContainer width="100%" height={320}>
            <Treemap
              data={treemapData}
              dataKey="size"
              nameKey="name"
              stroke="#07080B"
              content={<TileContent />}
              isAnimationActive={false}
            >
              <Tooltip
                content={({ payload }) => {
                  const sector = payload?.[0]?.payload as HeatmapSector | undefined;
                  if (!sector) return null;
                  return (
                    <div className="rounded-lg border border-white/[0.08] bg-[#0D0F14] px-3 py-2 text-xs">
                      <p className="font-semibold text-[#F5F5F7]">{sector.sector}</p>
                      <p className="text-[#9A9DA8]">
                        {sector.available_count}/{sector.symbol_count} priced ·{" "}
                        {sector.avg_change_pct !== null ? `${sector.avg_change_pct.toFixed(2)}%` : "n/a"}
                      </p>
                    </div>
                  );
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
