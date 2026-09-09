"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { GraphElements } from "@/components/graph/knowledge-graph-viewer";
import { Button } from "@/components/ui/button";

// cytoscape is a large, canvas-only library used nowhere else. Load it client-side
// with a skeleton (Batch 20 Lighthouse pass) so it never runs during SSR and stays
// out of the initial render path for this route.
const KnowledgeGraphViewer = dynamic(
  () => import("@/components/graph/knowledge-graph-viewer").then((m) => m.KnowledgeGraphViewer),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[520px] animate-pulse rounded-lg border border-white/[0.06] bg-[#14161B]/50"
        aria-label="Loading knowledge graph"
      />
    ),
  },
);
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getFailedStrategiesByRegime,
  getHypothesesLeadingToActive,
  getLineage,
  getRecurringFailureModes,
  getRobustAcrossRegimes,
} from "@/lib/graph";
import type { GraphNodeProps } from "@/lib/graph-types";

function strategyNode(id: string, properties: GraphNodeProps) {
  return { id, type: "Strategy" as const, properties };
}

export function KnowledgeGraphView() {
  const [elements, setElements] = useState<GraphElements | null>(null);
  const [summary, setSummary] = useState<string>(
    "Knowledge grows as you research — add a strategy to begin.",
  );
  const [error, setError] = useState<string | null>(null);
  const [regime, setRegime] = useState("Bear");
  const [lineageId, setLineageId] = useState("");

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "Query failed");
  }

  async function runFailedByRegime() {
    setError(null);
    try {
      const res = await getFailedStrategiesByRegime(regime, 24);
      const nodes = [
        { id: regime, type: "Regime" as const, properties: { regime_label: regime } },
        ...res.items.map((it) => strategyNode(it.strategy_id, { name: it.name, status: it.status })),
      ];
      const edges = res.items.map((it) => ({
        source: `Strategy:${it.strategy_id}`,
        target: `Regime:${regime}`,
        type: "FAILED_IN",
      }));
      setElements({ nodes, edges });
      setSummary(`${res.items.length} strategies failed in ${regime} in the past 24 months`);
    } catch (e) {
      fail(e);
    }
  }

  async function runLineage() {
    if (!lineageId.trim()) {
      setError("Enter a strategy id first");
      return;
    }
    setError(null);
    try {
      const res = await getLineage(lineageId.trim());
      if (!res.found) {
        setError("Strategy not found in the graph");
        return;
      }
      const allNodes = [res.target, ...res.ancestors, ...res.descendants].filter(Boolean) as GraphNodeProps[];
      const nodes = allNodes.map((n) => strategyNode(String(n.strategy_id), n));
      const edges = res.edges.map((e) => ({
        source: `Strategy:${e.from_id}`,
        target: `Strategy:${e.to_id}`,
        type: e.edge_type,
      }));
      setElements({ nodes, edges });
      setSummary(`Lineage: ${res.ancestors.length} ancestor(s), ${res.descendants.length} descendant(s)`);
    } catch (e) {
      fail(e);
    }
  }

  async function runRobustAcrossRegimes() {
    setError(null);
    try {
      const res = await getRobustAcrossRegimes(4);
      const nodes = res.items.map((it) =>
        strategyNode(it.strategy_id, { name: it.name, robustness_score: it.robustness_score, regime_count: it.regime_count }),
      );
      setElements({ nodes, edges: [] });
      setSummary(`${res.items.length} strategies valid across ${res.min_regimes}+ distinct regimes`);
    } catch (e) {
      fail(e);
    }
  }

  async function runRecurringFailureModes() {
    setError(null);
    try {
      const res = await getRecurringFailureModes(3);
      const nodes: GraphElements["nodes"] = [];
      const edges: GraphElements["edges"] = [];
      const seenRegimes = new Set<string>();
      for (const item of res.items) {
        const regimeLabel = item.regime_label ?? "unknown";
        if (!seenRegimes.has(regimeLabel)) {
          seenRegimes.add(regimeLabel);
          nodes.push({ id: regimeLabel, type: "Regime", properties: { regime_label: regimeLabel } });
        }
        for (const sid of item.strategy_ids) {
          nodes.push(strategyNode(sid, { name: sid }));
          edges.push({ source: `Strategy:${sid}`, target: `Regime:${regimeLabel}`, type: "FAILED_IN" });
        }
      }
      setElements({ nodes, edges });
      setSummary(`${res.items.length} recurring failure mode(s) (>= ${res.min_occurrences} occurrences)`);
    } catch (e) {
      fail(e);
    }
  }

  async function runHypothesesLeadingToActive() {
    setError(null);
    try {
      const res = await getHypothesesLeadingToActive();
      const nodes: GraphElements["nodes"] = [];
      const edges: GraphElements["edges"] = [];
      for (const item of res.items) {
        nodes.push({ id: item.note_id, type: "ResearchNote", properties: { content: item.content, hypothesis: item.hypothesis } });
        for (const s of item.active_strategies) {
          nodes.push(strategyNode(s.strategy_id, { name: s.name, status: "active" }));
          edges.push({ source: `Strategy:${s.strategy_id}`, target: `ResearchNote:${item.note_id}`, type: "INSPIRED_BY" });
        }
      }
      setElements({ nodes, edges });
      setSummary(`${res.items.length} hypothesis/hypotheses leading to an Active strategy`);
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl text-[#9A9DA8]">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="border border-white/[0.06] bg-[#0F1115] text-[#F5F5F7]">
          <CardHeader className="border-b border-white/[0.06]">
            <CardTitle className="text-lg font-semibold text-[#F5F5F7]">Research Queries</CardTitle>
            <CardDescription className="text-xs text-[#666A76]">The 5 named graph queries (SRC report {"§"}5.4)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="flex flex-col gap-1.5">
              <Input
                value={regime}
                onChange={(e) => setRegime(e.target.value)}
                className="h-8 border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] placeholder:text-[#666A76]"
                placeholder="Regime (e.g. Bear)"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={runFailedByRegime}
                data-testid="query-failed-by-regime"
                className="border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] hover:border-white/[0.12] hover:bg-[#14161B]/80"
              >
                Failed strategies by regime
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input
                value={lineageId}
                onChange={(e) => setLineageId(e.target.value)}
                className="h-8 border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] placeholder:text-[#666A76]"
                placeholder="Strategy ID"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={runLineage}
                data-testid="query-lineage"
                className="border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] hover:border-white/[0.12] hover:bg-[#14161B]/80"
              >
                Evolutionary lineage
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runRobustAcrossRegimes}
              data-testid="query-robust-across-regimes"
              className="border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] hover:border-white/[0.12] hover:bg-[#14161B]/80"
            >
              Robust across regimes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={runRecurringFailureModes}
              data-testid="query-recurring-failure-modes"
              className="border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] hover:border-white/[0.12] hover:bg-[#14161B]/80"
            >
              Recurring failure modes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={runHypothesesLeadingToActive}
              data-testid="query-hypotheses-active"
              className="border-white/[0.06] bg-[#14161B] text-xs text-[#F5F5F7] hover:border-white/[0.12] hover:bg-[#14161B]/80"
            >
              Hypotheses {"→"} Active strategies
            </Button>
            {error && <p className="text-xs text-[#E45B5B]">{error}</p>}
          </CardContent>
        </Card>

        <Card className="border border-white/[0.06] bg-[#0F1115] text-[#F5F5F7]">
          <CardHeader className="border-b border-white/[0.06]">
            <CardTitle className="text-lg font-semibold text-[#F5F5F7]">Knowledge Graph Viewer</CardTitle>
            <CardDescription className="text-xs text-[#666A76]">{summary}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <KnowledgeGraphViewer seed={elements} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}