"use client";

import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  REGIME_COLORS,
  REGIME_ORDER,
  type RegimeLabel,
  type RegimePoint,
} from "@/lib/regime-types";
import { cn } from "@/lib/utils";

interface Segment {
  label: RegimeLabel;
  start: Date;
  end: Date;
  avgConfidence: number;
  count: number;
}

export interface TimelineMarker {
  timestamp: string;
  color: string;
  label: string;
}

interface RegimeTimelineProps {
  points: RegimePoint[];
  /** Height of the colored band in px (excludes the axis). */
  bandHeight?: number;
  className?: string;
  showLegend?: boolean;
  /** Optional event markers (e.g. failures) drawn as vertical lines over the bands. */
  markers?: TimelineMarker[];
}

const AXIS_HEIGHT = 22;
const fmt = d3.timeFormat("%Y-%m-%d");

/**
 * Reusable regime timeline: horizontal colored bands, one per contiguous regime run,
 * hoverable to reveal label + confidence + date range. Built generically so it can be
 * embedded on the Dashboard, Regime Monitor, and Failure Intelligence pages.
 */
export function RegimeTimeline({
  points,
  bandHeight = 56,
  className,
  showLegend = true,
  markers = [],
}: RegimeTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ seg: Segment; x: number } | null>(null);

  // Responsive width.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    setWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { segments, xScale } = useMemo(() => {
    const sorted = [...points].sort(
      (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
    );
    if (sorted.length === 0) {
      return { segments: [] as Segment[], xScale: null as d3.ScaleTime<number, number> | null };
    }

    const dates = sorted.map((p) => new Date(p.timestamp));
    const lastDate = dates[dates.length - 1] as Date;
    // Median spacing, used to extend the final band so it has non-zero width.
    const diffs: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      diffs.push(+(dates[i] as Date) - +(dates[i - 1] as Date));
    }
    diffs.sort((a, b) => a - b);
    const step = diffs.length ? (diffs[Math.floor(diffs.length / 2)] as number) : 86_400_000;

    const segs: Segment[] = [];
    let runStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const boundary =
        i === sorted.length ||
        (sorted[i] as RegimePoint).regime_label !== (sorted[runStart] as RegimePoint).regime_label;
      if (boundary) {
        const run = sorted.slice(runStart, i);
        const first = run[0] as RegimePoint;
        const start = new Date(first.timestamp);
        const end =
          i < sorted.length
            ? new Date((sorted[i] as RegimePoint).timestamp)
            : new Date(+lastDate + step);
        segs.push({
          label: first.regime_label,
          start,
          end,
          avgConfidence: run.reduce((s, p) => s + p.confidence_score, 0) / run.length,
          count: run.length,
        });
        runStart = i;
      }
    }

    const scale = d3
      .scaleTime()
      .domain([(segs[0] as Segment).start, (segs[segs.length - 1] as Segment).end])
      .range([0, Math.max(width, 1)]);
    return { segments: segs, xScale: scale };
  }, [points, width]);

  // Draw the bottom axis with D3.
  useEffect(() => {
    if (!axisRef.current || !xScale) return;
    d3.select(axisRef.current)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat((d) => fmt(d as Date)) as never)
      .call((g) => g.select(".domain").attr("stroke", "hsl(var(--border))"))
      .selectAll("text")
      .attr("fill", "hsl(var(--muted-foreground))")
      .style("font-size", "10px");
  }, [xScale, width]);

  if (segments.length === 0 || !xScale) {
    return <p className="text-sm text-muted-foreground">No regime data to display.</p>;
  }

  const presentLabels = REGIME_ORDER.filter((l) => segments.some((s) => s.label === l));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div ref={containerRef} className="relative w-full">
        <svg width={width} height={bandHeight + AXIS_HEIGHT} role="img" aria-label="Regime timeline">
          {segments.map((seg, i) => {
            const x = xScale(seg.start);
            const w = Math.max(xScale(seg.end) - x, 0.5);
            return (
              <rect
                key={i}
                x={x}
                y={0}
                width={w}
                height={bandHeight}
                fill={REGIME_COLORS[seg.label]}
                opacity={0.55 + 0.45 * seg.avgConfidence}
                onMouseMove={(e) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  setHover({ seg, x: e.clientX - (rect?.left ?? 0) });
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {markers.map((m, i) => {
            const mx = xScale(new Date(m.timestamp));
            if (mx < 0 || mx > width) return null;
            return (
              <g key={`marker-${i}`}>
                <line x1={mx} y1={0} x2={mx} y2={bandHeight} stroke={m.color} strokeWidth={1.5} strokeDasharray="3 2" />
                <polygon points={`${mx - 4},0 ${mx + 4},0 ${mx},6`} fill={m.color}>
                  <title>{`${m.label} · ${fmt(new Date(m.timestamp))}`}</title>
                </polygon>
              </g>
            );
          })}
          <g ref={axisRef} transform={`translate(0,${bandHeight})`} />
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md"
            style={{ left: Math.min(hover.x + 8, width - 180), top: 4 }}
          >
            <div className="flex items-center gap-2 font-medium">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: REGIME_COLORS[hover.seg.label] }}
              />
              {hover.seg.label}
            </div>
            <div className="mt-1 text-muted-foreground">
              {fmt(hover.seg.start)} → {fmt(hover.seg.end)}
            </div>
            <div className="text-muted-foreground">
              confidence {(hover.seg.avgConfidence * 100).toFixed(0)}% · {hover.seg.count} bars
            </div>
          </div>
        )}
      </div>

      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {presentLabels.map((label) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: REGIME_COLORS[label] }}
              />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
