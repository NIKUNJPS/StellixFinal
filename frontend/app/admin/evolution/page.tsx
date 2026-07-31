"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KnowledgeGraphViewer, type GraphElements } from "@/components/graph/knowledge-graph-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideCandidate, getEvolutionRun, getPendingCandidates, listEvolutionRuns, startEvolutionRun } from "@/lib/evolution";
import type { EvolutionRunDetail, EvolutionRunSummary, GAConfigOverrides, PendingCandidate } from "@/lib/evolution-types";
import { getLineage } from "@/lib/graph";

const STATUS_COLORS: Record<string, string> = {
  running: "#f59e0b",
  completed: "#16a34a",
  failed: "#dc2626",
};

const DEFAULT_CONFIG: Required<GAConfigOverrides> = {
  population_size: 20,
  max_generations: 50,
  crossover_prob: 0.7,
  crossover_indpb: 0.5,
  mutation_prob: 0.3,
  mutation_indpb: 0.2,
  sigma_base: 0.1,
  elitism_fraction: 0.1,
  tournament_size: 5,
  plateau_generations: 5,
  convergence_window: 10,
  convergence_threshold_pct: 1.0,
};

export default function EvolutionEnginePage() {
  const [symbol, setSymbol] = useState("SPY");
  const [config, setConfig] = useState<Required<GAConfigOverrides>>(DEFAULT_CONFIG);
  const [runs, setRuns] = useState<EvolutionRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvolutionRunDetail | null>(null);
  const [lineageElements, setLineageElements] = useState<GraphElements | null>(null);
  const [pending, setPending] = useState<PendingCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await listEvolutionRuns();
      setRuns(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    }
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const data = await getPendingCandidates();
      setPending(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pending candidates");
    }
  }, []);

  useEffect(() => {
    loadRuns();
    loadPending();
  }, [loadRuns, loadPending]);

  function updateConfig(key: keyof GAConfigOverrides, value: string) {
    const num = Number(value);
    if (Number.isNaN(num)) return;
    setConfig((prev) => ({ ...prev, [key]: num }));
  }

  async function runEvolution() {
    setError(null);
    setMessage(null);
    try {
      const res = await startEvolutionRun({ symbol, strategy_ids: "all", ga_config: config });
      setMessage(res.message);
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start evolution run");
    }
  }

  async function selectRun(id: string) {
    setError(null);
    try {
      const detail = await getEvolutionRun(id);
      setSelectedRun(detail);

      const seedId = detail.seed_strategy_ids[0];
      if (seedId) {
        const lineage = await getLineage(seedId);
        if (lineage.found) {
          const nodes = [lineage.target, ...lineage.ancestors, ...lineage.descendants]
            .filter(Boolean)
            .map((n) => ({ id: String(n!.strategy_id), type: "Strategy" as const, properties: n! }));
          const edges = lineage.edges.map((e) => ({
            source: `Strategy:${e.from_id}`,
            target: `Strategy:${e.to_id}`,
            type: e.edge_type,
          }));
          setLineageElements({ nodes, edges });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run detail");
    }
  }

  async function decide(strategyId: string, action: "approve" | "reject") {
    setError(null);
    try {
      await decideCandidate(strategyId, action, `${action}d from the Evolution Engine page`);
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Evolution Engine</CardTitle>
            <CardDescription>
              fitness = weighted_avg_sharpe (trade-count-weighted across regimes) + 0.3 &times; robustness_score
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {message && <p className="mb-3 text-sm text-muted-foreground">{message}</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <Label htmlFor="symbol">Symbol</Label>
                <Input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label htmlFor="population_size">Population size</Label>
                <Input
                  id="population_size" type="number" className="h-8"
                  value={config.population_size}
                  onChange={(e) => updateConfig("population_size", e.target.value)}
                  data-testid="config-population-size"
                />
              </div>
              <div>
                <Label htmlFor="max_generations">Max generations</Label>
                <Input
                  id="max_generations" type="number" className="h-8"
                  value={config.max_generations}
                  onChange={(e) => updateConfig("max_generations", e.target.value)}
                  data-testid="config-max-generations"
                />
              </div>
              <div>
                <Label htmlFor="crossover_prob">Crossover prob.</Label>
                <Input
                  id="crossover_prob" type="number" step="0.05" className="h-8"
                  value={config.crossover_prob}
                  onChange={(e) => updateConfig("crossover_prob", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sigma_base">Mutation sigma (base)</Label>
                <Input
                  id="sigma_base" type="number" step="0.01" className="h-8"
                  value={config.sigma_base}
                  onChange={(e) => updateConfig("sigma_base", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="elitism_fraction">Elitism %</Label>
                <Input
                  id="elitism_fraction" type="number" step="0.05" className="h-8"
                  value={config.elitism_fraction}
                  onChange={(e) => updateConfig("elitism_fraction", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="tournament_size">Tournament size</Label>
                <Input
                  id="tournament_size" type="number" className="h-8"
                  value={config.tournament_size}
                  onChange={(e) => updateConfig("tournament_size", e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={runEvolution} data-testid="start-evolution-run" className="h-8 w-full">
                  Run Evolution
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Run history</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No evolution runs yet.</p>
            ) : (
              <table className="w-full text-sm" data-testid="evolution-run-table">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Generations</th>
                    <th className="px-3 py-2">Best fitness</th>
                    <th className="px-3 py-2">Candidates</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => selectRun(r.id)}
                      className={`cursor-pointer border-b border-border/60 hover:bg-accent/40 ${selectedRun?.id === r.id ? "bg-accent/40" : ""}`}
                    >
                      <td className="px-3 py-2">{r.symbol}</td>
                      <td className="px-3 py-2">
                        <Badge style={{ background: STATUS_COLORS[r.status], color: "white" }}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{r.generations_run}</td>
                      <td className="px-3 py-2">{r.best_fitness?.toFixed(4) ?? "—"}</td>
                      <td className="px-3 py-2">{r.candidate_count}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {selectedRun && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fitness over generations · run {selectedRun.id.slice(0, 8)}</CardTitle>
              {selectedRun.error && <CardDescription className="text-destructive">{selectedRun.error}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full" data-testid="fitness-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedRun.generation_history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="generation" tick={{ fontSize: 11 }} label={{ value: "Generation", position: "insideBottom", offset: -5, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Line type="monotone" dataKey="best_fitness" stroke="#16a34a" name="Best fitness" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="avg_fitness" stroke="#3b82f6" name="Avg fitness" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="sigma" stroke="#f59e0b" name="Mutation sigma" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedRun && lineageElements && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Evolutionary lineage</CardTitle>
              <CardDescription>Parent {"->"} child chains for this run&apos;s seed strategy (Cytoscape, hierarchical)</CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeGraphViewer seed={lineageElements} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending candidates</CardTitle>
            <CardDescription>GA-evolved strategies awaiting approve/reject</CardDescription>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending candidates.</p>
            ) : (
              <div className="flex flex-col gap-3" data-testid="pending-candidates">
                {pending.map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">robustness {c.robustness_score?.toFixed(3) ?? "—"}</span>
                    </div>
                    {c.regime_compatibility && (
                      <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {Object.entries(c.regime_compatibility).map(([label, sharpe]) => (
                          <span key={label} className="rounded-full border border-border px-2 py-0.5">
                            {label}: {sharpe?.toFixed(2) ?? "n/a"}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide(c.id, "approve")} data-testid={`approve-${c.id}`}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide(c.id, "reject")} data-testid={`reject-${c.id}`}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
