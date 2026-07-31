"use client";

import { useState } from "react";

import { GRAPH_EDGES } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

/**
 * Interactive Neo4j knowledge-graph schema (Batch 15) — the real 6 nodes / 8
 * edges from Batch 7, rendered as a hoverable diagram (hover a node to light up
 * its incident edges and neighbors). This is a differentiating technical asset,
 * shown rather than hidden.
 */

type NodePos = { id: string; x: number; y: number };

const NODES: NodePos[] = [
  { id: "Strategy", x: 190, y: 230 },
  { id: "Regime", x: 470, y: 96 },
  { id: "Performance", x: 500, y: 262 },
  { id: "Failure", x: 360, y: 410 },
  { id: "ResearchNote", x: 150, y: 400 },
  { id: "Researcher", x: 62, y: 250 },
];

const NODE_W = 128;
const NODE_H = 40;

function nodePos(id: string): NodePos {
  return NODES.find((n) => n.id === id)!;
}

// Assign a "bow" to parallel edges (same node pair) so they don't overlap.
function bowedPath(fromId: string, toId: string, bow: number): { d: string; mid: { x: number; y: number } } {
  const a = nodePos(fromId);
  const b = nodePos(toId);
  if (fromId === toId) {
    // self-loop at the top of the node
    const d = `M ${a.x - 24} ${a.y - NODE_H / 2} C ${a.x - 60} ${a.y - 96}, ${a.x + 60} ${a.y - 96}, ${a.x + 24} ${a.y - NODE_H / 2}`;
    return { d, mid: { x: a.x, y: a.y - 78 } };
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (bow === 0) return { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, mid: { x: mx, y: my } };
  // perpendicular offset for the control point
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * bow;
  const oy = (dx / len) * bow;
  const cx = mx + ox;
  const cy = my + oy;
  return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, mid: { x: cx, y: cy } };
}

// Pre-compute bows for parallel edges.
const PAIR_COUNT: Record<string, number> = {};
const EDGES = GRAPH_EDGES.map((e) => {
  const key = `${e.from}->${e.to}`;
  const idx = PAIR_COUNT[key] ?? 0;
  PAIR_COUNT[key] = idx + 1;
  return { ...e, bowIndex: idx };
});
const EDGES_WITH_BOW = EDGES.map((e) => {
  const key = `${e.from}->${e.to}`;
  const total = PAIR_COUNT[key] ?? 1;
  const bow = total > 1 ? (e.bowIndex - (total - 1) / 2) * 60 : 0;
  return { ...e, bow };
});

export function NeoSchemaDiagram({ className }: { className?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const isNodeActive = (id: string) => {
    if (!hovered) return true;
    if (hovered === id) return true;
    return EDGES_WITH_BOW.some(
      (e) => (e.from === hovered && e.to === id) || (e.to === hovered && e.from === id),
    );
  };
  const isEdgeActive = (from: string, to: string) =>
    !hovered || from === hovered || to === hovered;

  return (
    <div className={cn("grid gap-8 lg:grid-cols-[1.15fr_0.85fr]", className)}>
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3">
        <svg viewBox="0 0 560 470" className="w-full" role="img" aria-label="Neo4j knowledge graph schema with six node types and eight edge types.">
          {/* edges */}
          {EDGES_WITH_BOW.map((e) => {
            const { d, mid } = bowedPath(e.from, e.to, e.bow);
            const active = isEdgeActive(e.from, e.to);
            return (
              <g key={e.edge} opacity={active ? 1 : 0.15} style={{ transition: "opacity 0.2s" }}>
                <path d={d} fill="none" stroke={active ? "#7FA8FF" : "#DCE7FF"} strokeWidth={1.4} />
                <text
                  x={mid.x}
                  y={mid.y - 4}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={active ? "#0066FF" : "#94A3B8"}
                >
                  {e.edge}
                </text>
              </g>
            );
          })}
          {/* nodes */}
          {NODES.map((n) => {
            const active = isNodeActive(n.id);
            return (
              <g
                key={n.id}
                opacity={active ? 1 : 0.3}
                style={{ transition: "opacity 0.2s" }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <rect
                  x={n.x - NODE_W / 2}
                  y={n.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill="#003399"
                  stroke={hovered === n.id ? "#0066FF" : "#003399"}
                  strokeWidth={hovered === n.id ? 2 : 1.2}
                />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="#FFFFFF">
                  {n.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Edge</th>
              <th className="py-2 pr-3 font-medium">Connects</th>
            </tr>
          </thead>
          <tbody>
            {GRAPH_EDGES.map((e) => (
              <tr
                key={e.edge}
                className="border-b border-border/50 transition-colors hover:bg-[#F7F9FC]"
                onMouseEnter={() => setHovered(e.from)}
                onMouseLeave={() => setHovered(null)}
              >
                <td className="py-2 pr-3">
                  <code className="font-mono text-xs text-accent">{e.edge}</code>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {e.from} → {e.to}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
