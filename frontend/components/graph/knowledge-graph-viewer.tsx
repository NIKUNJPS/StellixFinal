"use client";

import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from "cytoscape";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getGraphNode, searchGraphNodes } from "@/lib/graph";
import { EDGE_TYPES, NODE_COLORS, NODE_TYPES, type EdgeType, type GraphNodeProps, type NodeType } from "@/lib/graph-types";

const LAYOUTS = {
  "force-directed": { name: "cose", animate: false, padding: 30 } as LayoutOptions,
  hierarchical: { name: "breadthfirst", animate: false, padding: 30, spacingFactor: 1.2 } as LayoutOptions,
  concentric: { name: "concentric", animate: false, padding: 30 } as LayoutOptions,
};
type LayoutKey = keyof typeof LAYOUTS;

function keyPropFor(nodeType: string): string {
  const map: Record<string, string> = {
    Strategy: "strategy_id", Regime: "regime_id", Performance: "performance_id",
    Failure: "failure_id", ResearchNote: "note_id", Researcher: "user_id",
  };
  return map[nodeType] ?? "id";
}

function nodeLabel(nodeType: string, props: GraphNodeProps): string {
  return (
    (props.name as string) ||
    (props.regime_label as string) ||
    (props.content as string)?.slice(0, 24) ||
    (props.trigger_condition as string) ||
    `${nodeType}`
  );
}

export interface GraphElements {
  nodes: { id: string; type: NodeType | string; properties: GraphNodeProps }[];
  /** ``source``/``target`` must be the composite ``"{type}:{id}"`` form matching a
   * node's element id (built from ``node.type`` + ``node.id`` above), not a raw id —
   * see the query-result transforms in app/admin/graph/page.tsx. */
  edges: { source: string; target: string; type: string }[];
}

interface KnowledgeGraphViewerProps {
  /** Externally-provided elements (e.g. from a Research Query result). Replaces the
   * current graph when it changes. */
  seed?: GraphElements | null;
}

export function KnowledgeGraphViewer({ seed }: KnowledgeGraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [layout, setLayout] = useState<LayoutKey>("force-directed");
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set(NODE_TYPES));
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<string>>(new Set(EDGE_TYPES));
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ nodeType: string; nodeId: string; props: GraphNodeProps } | null>(null);
  const [selectedEdges, setSelectedEdges] = useState<{ direction: string; edge_type: string; other: GraphNodeProps; otherLabels: string[] }[]>([]);

  // Initialize Cytoscape once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            "font-size": 9,
            color: "#e2e8f0",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 28,
            height: 28,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 7,
            color: "#94a3b8",
          },
        },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": "#f8fafc" },
        },
      ],
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    cy.on("tap", "node", async (evt) => {
      const n = evt.target;
      const nodeType = n.data("type") as string;
      const nodeId = n.data("key") as string;
      try {
        const detail = await getGraphNode(nodeType as NodeType, nodeId);
        setSelected({ nodeType, nodeId, props: detail.node });
        setSelectedEdges([
          ...detail.outgoing.map((e) => ({ direction: "out", edge_type: e.edge_type, other: e.other, otherLabels: e.other_labels })),
          ...detail.incoming.map((e) => ({ direction: "in", edge_type: e.edge_type, other: e.other, otherLabels: e.other_labels })),
        ]);
        // Expand-on-click: merge the neighbor nodes/edges into the visible graph.
        const newElements: ElementDefinition[] = [];
        const addNeighbor = (labels: string[], props: GraphNodeProps, edgeType: string, direction: "out" | "in") => {
          const otherType = labels[0] ?? "Strategy";
          const key = String(props[keyPropFor(otherType)] ?? "");
          if (!key) return;
          const otherId = `${otherType}:${key}`;
          if (cy.getElementById(otherId).empty()) {
            newElements.push({
              data: { id: otherId, key, type: otherType, label: nodeLabel(otherType, props), color: NODE_COLORS[otherType as NodeType] ?? "#94a3b8" },
            });
          }
          const edgeId = direction === "out" ? `${n.id()}->${otherId}:${edgeType}` : `${otherId}->${n.id()}:${edgeType}`;
          if (cy.getElementById(edgeId).empty()) {
            newElements.push({
              data: direction === "out"
                ? { id: edgeId, source: n.id(), target: otherId, type: edgeType, label: edgeType }
                : { id: edgeId, source: otherId, target: n.id(), type: edgeType, label: edgeType },
            });
          }
        };
        detail.outgoing.forEach((e) => addNeighbor(e.other_labels, e.other, e.edge_type, "out"));
        detail.incoming.forEach((e) => addNeighbor(e.other_labels, e.other, e.edge_type, "in"));
        if (newElements.length) {
          cy.add(newElements);
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Failed to load node detail");
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Load seed elements whenever they change.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !seed) return;
    cy.elements().remove();
    setSelected(null);
    setSelectedEdges([]);
    const elements: ElementDefinition[] = [];
    const seenNodes = new Set<string>();
    for (const node of seed.nodes) {
      const id = `${node.type}:${node.id}`;
      if (seenNodes.has(id)) continue;
      seenNodes.add(id);
      elements.push({
        data: { id, key: node.id, type: node.type, label: nodeLabel(node.type, node.properties), color: NODE_COLORS[node.type as NodeType] ?? "#94a3b8" },
      });
    }
    for (const [i, edge] of seed.edges.entries()) {
      elements.push({ data: { id: `seed-edge-${i}`, source: edge.source, target: edge.target, type: edge.type, label: edge.type } });
    }
    cy.add(elements);
    cy.layout(LAYOUTS[layout]).run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const runLayout = useCallback((key: LayoutKey) => {
    setLayout(key);
    cyRef.current?.layout(LAYOUTS[key]).run();
  }, []);

  const applyFilters = useCallback((nodeTypes: Set<string>, edgeTypes: Set<string>) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach((n) => {
      n.style("display", nodeTypes.has(n.data("type")) ? "element" : "none");
    });
    cy.edges().forEach((e) => {
      const sourceVisible = nodeTypes.has(e.source().data("type"));
      const targetVisible = nodeTypes.has(e.target().data("type"));
      const typeVisible = edgeTypes.has(e.data("type"));
      e.style("display", sourceVisible && targetVisible && typeVisible ? "element" : "none");
    });
  }, []);

  useEffect(() => {
    applyFilters(visibleNodeTypes, visibleEdgeTypes);
  }, [visibleNodeTypes, visibleEdgeTypes, applyFilters]);

  function toggleNodeType(t: string) {
    setVisibleNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleEdgeType(t: string) {
    setVisibleEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function runSearch() {
    setSearchError(null);
    if (!search.trim()) return;
    try {
      const result = await searchGraphNodes(search.trim());
      const cy = cyRef.current;
      if (!cy) return;
      const elements: ElementDefinition[] = [];
      for (const item of result.items) {
        const key = String(item.properties[keyPropFor(item.node_type)] ?? "");
        const id = `${item.node_type}:${key}`;
        if (cy.getElementById(id).empty()) {
          elements.push({
            data: { id, key, type: item.node_type, label: nodeLabel(item.node_type, item.properties), color: NODE_COLORS[item.node_type as NodeType] ?? "#94a3b8" },
          });
        }
      }
      cy.add(elements);
      cy.layout(LAYOUTS[layout]).run();
      if (result.items.length === 0) setSearchError("No matches");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    }
  }

  function exportPng() {
    const cy = cyRef.current;
    if (!cy) return;
    const uri = cy.png({ full: true, scale: 2, bg: "#0f172a" });
    const a = document.createElement("a");
    a.href = uri;
    a.download = "knowledge-graph.png";
    a.click();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Search by name..."
          className="h-8 w-48"
          data-testid="graph-search-input"
        />
        <Button size="sm" variant="outline" onClick={runSearch} data-testid="graph-search-button">
          Search
        </Button>
        <div className="ml-2 flex gap-1">
          {(Object.keys(LAYOUTS) as LayoutKey[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={layout === key ? "default" : "outline"}
              onClick={() => runLayout(key)}
              data-testid={`layout-${key}`}
            >
              {key}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportPng} data-testid="export-png">
          Export PNG
        </Button>
      </div>
      {searchError && <p className="text-xs text-destructive">{searchError}</p>}

      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Nodes:</span>
          {NODE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleNodeType(t)}
              data-testid={`node-filter-${t}`}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5"
              style={{ opacity: visibleNodeTypes.has(t) ? 1 : 0.35 }}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: NODE_COLORS[t] }} />
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Edges:</span>
          {EDGE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleEdgeType(t)}
              data-testid={`edge-filter-${t}`}
              className="rounded-full border border-border px-2 py-0.5"
              style={{ opacity: visibleEdgeTypes.has(t) ? 1 : 0.35 }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="h-[480px] w-full rounded-md border border-border bg-slate-950"
          data-testid="cytoscape-canvas"
        />
        {selected && (
          <div className="absolute right-0 top-0 h-full w-72 overflow-y-auto border-l border-border bg-card p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <Badge>{selected.nodeType}</Badge>
              <button className="text-xs text-muted-foreground" onClick={() => setSelected(null)} data-testid="close-detail-panel">
                close
              </button>
            </div>
            <h4 className="mb-2 text-sm font-medium">{nodeLabel(selected.nodeType, selected.props)}</h4>
            <dl className="space-y-1 text-xs">
              {Object.entries(selected.props)
                .filter(([k]) => k !== "organization_id")
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="truncate text-right">{String(v)}</dd>
                  </div>
                ))}
            </dl>
            {selectedEdges.length > 0 && (
              <div className="mt-3">
                <h5 className="mb-1 text-xs font-medium text-muted-foreground">Edges</h5>
                <ul className="space-y-1 text-xs">
                  {selectedEdges.map((e, i) => (
                    <li key={i} className="truncate">
                      {e.direction === "out" ? "→" : "←"} {e.edge_type} {e.otherLabels[0]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
