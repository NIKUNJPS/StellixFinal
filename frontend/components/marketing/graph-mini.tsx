"use client";

import { useEffect, useRef } from "react";
import type { Core } from "cytoscape";

/**
 * A small live Cytoscape.js knowledge-graph (Batch 15) for the Features page —
 * a real graph engine rendering real node/edge types, not a screenshot.
 * Cytoscape is dynamically imported on mount so it never ships in the initial
 * bundle (protects landing-page performance).
 */

const ELEMENTS = [
  { data: { id: "s1", label: "Strategy", type: "Strategy" } },
  { data: { id: "s2", label: "Strategy", type: "Strategy" } },
  { data: { id: "r1", label: "Crisis", type: "Regime" } },
  { data: { id: "r2", label: "Bull", type: "Regime" } },
  { data: { id: "f1", label: "Failure", type: "Failure" } },
  { data: { id: "p1", label: "Perf", type: "Performance" } },
  { data: { source: "s1", target: "r2", label: "VALID_IN" } },
  { data: { source: "s1", target: "r1", label: "FAILED_IN" } },
  { data: { source: "s2", target: "s1", label: "MUTATED_FROM" } },
  { data: { source: "f1", target: "p1", label: "CAUSED_BY" } },
  { data: { source: "s1", target: "p1", label: "EVALUATED_BY" } },
];

const TYPE_COLOR: Record<string, string> = {
  Strategy: "#0066FF",
  Regime: "#003399",
  Failure: "#dc2626",
  Performance: "#7FA8FF",
};

export function GraphMini() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let cy: Core | undefined;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (destroyed || !ref.current) return;
      cy = cytoscape({
        container: ref.current,
        elements: ELEMENTS,
        style: [
          {
            selector: "node",
            style: {
              "background-color": (ele: { data: (k: string) => string }) => TYPE_COLOR[ele.data("type")] ?? "#64748B",
              label: "data(label)",
              color: "#0A0F1E",
              "font-size": "9px",
              "text-valign": "bottom",
              "text-margin-y": 3,
              width: 18,
              height: 18,
            },
          },
          {
            selector: "edge",
            style: {
              width: 1.4,
              "line-color": "#B8D1FF",
              "target-arrow-color": "#0066FF",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              label: "data(label)",
              "font-size": "7px",
              color: "#64748B",
              "text-rotation": "autorotate",
            },
          },
        ],
        layout: { name: "cose", animate: false, padding: 12 },
        userZoomingEnabled: false,
        userPanningEnabled: false,
        autoungrabify: true,
        boxSelectionEnabled: false,
      });
      cy.fit(undefined, 16);
    })();
    return () => {
      destroyed = true;
      if (cy) cy.destroy();
    };
  }, []);

  return <div ref={ref} className="h-56 w-full rounded-lg border border-[#E2E8F0] bg-white" aria-label="Live knowledge graph" />;
}
