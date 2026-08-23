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

import {
  KnowledgeGraphViewer,
  type GraphElements,
} from "@/components/graph/knowledge-graph-viewer";
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
import {
  decideCandidate,
  getEvolutionRun,
  getPendingCandidates,
  listEvolutionRuns,
  startEvolutionRun,
} from "@/lib/evolution";
import type {
  EvolutionRunDetail,
  EvolutionRunSummary,
  GAConfigOverrides,
  PendingCandidate,
} from "@/lib/evolution-types";
import { getLineage } from "@/lib/graph";

const STATUS_COLORS: Record<string, string> = {
  running: "#f2d17d",
  completed: "#075056",
  failed: "#074068",
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
  const [config, setConfig] =
    useState<Required<GAConfigOverrides>>(DEFAULT_CONFIG);
  const [runs, setRuns] = useState<EvolutionRunSummary[]>([]);
  const [selectedRun, setSelectedRun] =
    useState<EvolutionRunDetail | null>(null);
  const [lineageElements, setLineageElements] =
    useState<GraphElements | null>(null);
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
      setError(
        e instanceof Error ? e.message : "Failed to load pending candidates",
      );
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
      const res = await startEvolutionRun({
        symbol,
        strategy_ids: "all",
        ga_config: config,
      });

      setMessage(res.message);
      await loadRuns();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to start evolution run",
      );
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
          const nodes = [
            lineage.target,
            ...lineage.ancestors,
            ...lineage.descendants,
          ]
            .filter(Boolean)
            .map((n) => ({
              id: String(n!.strategy_id),
              type: "Strategy" as const,
              properties: n!,
            }));

          const edges = lineage.edges.map((e) => ({
            source: `Strategy:${e.from_id}`,
            target: `Strategy:${e.to_id}`,
            type: e.edge_type,
          }));

          setLineageElements({ nodes, edges });
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load run detail",
      );
    }
  }

  async function decide(
    strategyId: string,
    action: "approve" | "reject",
  ) {
    setError(null);

    try {
      await decideCandidate(
        strategyId,
        action,
        `${action}d from the Evolution Engine page`,
      );

      await loadPending();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Failed to ${action}`,
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl text-[#d3dbdd]">
      <div className="grid gap-6">

        {/* ============================================================
            EVOLUTION CONTROL
        ============================================================ */}
        <Card className="overflow-hidden rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
          <CardHeader className="border-b border-[#d3dbdd]/10 pb-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#074068]" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d3dbdd]/50">
                    Research Engine
                  </span>
                </div>

                <CardTitle className="text-2xl font-semibold tracking-tight text-[#d3dbdd]">
                  Evolution Engine
                </CardTitle>

                <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#d3dbdd]/60">
                  fitness = weighted_avg_sharpe (trade-count-weighted across
                  regimes) + 0.3 × robustness_score
                </CardDescription>
              </div>

              <div className="hidden rounded-full border border-[#075056] bg-[#042f34]/70 px-3 py-1.5 text-[11px] font-medium text-[#d3dbdd]/80 sm:block">
                Genetic Optimization
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {error && (
              <p className="mb-4 rounded-xl border border-[#074068]/30 bg-[#074068]/10 px-4 py-3 text-sm text-[#074068]">
                {error}
              </p>
            )}

            {message && (
              <p className="mb-4 rounded-xl border border-[#075056] bg-[#042f34]/60 px-4 py-3 text-sm text-[#d3dbdd]/80">
                {message}
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="symbol"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Symbol
                </Label>

                <Input
                  id="symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none placeholder:text-[#d3dbdd]/30 focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="population_size"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Population size
                </Label>

                <Input
                  id="population_size"
                  type="number"
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                  value={config.population_size}
                  onChange={(e) =>
                    updateConfig("population_size", e.target.value)
                  }
                  data-testid="config-population-size"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="max_generations"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Max generations
                </Label>

                <Input
                  id="max_generations"
                  type="number"
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                  value={config.max_generations}
                  onChange={(e) =>
                    updateConfig("max_generations", e.target.value)
                  }
                  data-testid="config-max-generations"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="crossover_prob"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Crossover prob.
                </Label>

                <Input
                  id="crossover_prob"
                  type="number"
                  step="0.05"
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                  value={config.crossover_prob}
                  onChange={(e) =>
                    updateConfig("crossover_prob", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="sigma_base"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Mutation sigma (base)
                </Label>

                <Input
                  id="sigma_base"
                  type="number"
                  step="0.01"
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                  value={config.sigma_base}
                  onChange={(e) =>
                    updateConfig("sigma_base", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="elitism_fraction"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Elitism %
                </Label>

                <Input
                  id="elitism_fraction"
                  type="number"
                  step="0.05"
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                  value={config.elitism_fraction}
                  onChange={(e) =>
                    updateConfig("elitism_fraction", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="tournament_size"
                  className="text-xs font-medium text-[#d3dbdd]/65"
                >
                  Tournament size
                </Label>

                <Input
                  id="tournament_size"
                  type="number"
                  className="h-10 rounded-lg border-[#d3dbdd]/10 bg-[#0f1b22] text-[#d3dbdd] shadow-none focus-visible:border-[#075056] focus-visible:ring-[#075056]"
                  value={config.tournament_size}
                  onChange={(e) =>
                    updateConfig("tournament_size", e.target.value)
                  }
                />
              </div>

              <div className="flex items-end">
                <Button
                  size="sm"
                  onClick={runEvolution}
                  data-testid="start-evolution-run"
                  className="h-10 w-full rounded-lg bg-[#074068] font-semibold text-white shadow-none transition-all hover:bg-[#074068]/90 hover:shadow-[0_0_24px_rgba(7,64,104,0.35)] active:scale-[0.98]"
                >
                  Run Evolution
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============================================================
            RUN HISTORY
        ============================================================ */}
        <Card className="overflow-hidden rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-[#d3dbdd]">
                  Run history
                </CardTitle>

                <CardDescription className="mt-1 text-[#d3dbdd]/50">
                  Previous evolutionary searches
                </CardDescription>
              </div>

              <span className="rounded-full border border-[#d3dbdd]/10 bg-[#0f1b22] px-3 py-1 text-xs text-[#d3dbdd]/50">
                {runs.length} runs
              </span>
            </div>
          </CardHeader>

          <CardContent>
            {runs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#d3dbdd]/10 py-10 text-center text-sm text-[#d3dbdd]/40">
                No evolution runs yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#d3dbdd]/10">
                <table
                  className="w-full text-sm"
                  data-testid="evolution-run-table"
                >
                  <thead className="bg-[#0f1b22] text-left text-[10px] uppercase tracking-[0.12em] text-[#d3dbdd]/45">
                    <tr className="border-b border-[#d3dbdd]/10">
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Generations</th>
                      <th className="px-4 py-3 font-medium">Best fitness</th>
                      <th className="px-4 py-3 font-medium">Candidates</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                    </tr>
                  </thead>

                  <tbody>
                    {runs.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => selectRun(r.id)}
                        className={`cursor-pointer border-b border-[#d3dbdd]/[0.06] transition-colors last:border-0 hover:bg-[#042f34]/50 ${
                          selectedRun?.id === r.id
                            ? "bg-[#042f34]/80"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-[#d3dbdd]">
                          {r.symbol}
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            className="rounded-full border-0 px-2.5 py-1 text-[10px] font-semibold"
                            style={{
                              background: STATUS_COLORS[r.status],
                              color:
                                r.status === "running"
                                  ? "#16232b"
                                  : "#ffffff",
                            }}
                          >
                            {r.status}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 text-[#d3dbdd]/75">
                          {r.generations_run}
                        </td>

                        <td className="px-4 py-3 font-mono text-[#f2d17d]">
                          {r.best_fitness?.toFixed(4) ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-[#d3dbdd]/75">
                          {r.candidate_count}
                        </td>

                        <td className="px-4 py-3 text-[#d3dbdd]/45">
                          {r.created_at.slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================
            SELECTED RUN FITNESS
        ============================================================ */}
        {selectedRun && (
          <Card className="overflow-hidden rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
            <CardHeader className="border-b border-[#d3dbdd]/10 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-semibold text-[#d3dbdd]">
                    Fitness over generations
                  </CardTitle>

                  <CardDescription className="mt-1 text-[#d3dbdd]/50">
                    Run {selectedRun.id.slice(0, 8)}
                  </CardDescription>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-[#d3dbdd]/50">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#074068]" />
                    Best
                  </span>

                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#f2d17d]" />
                    Average
                  </span>

                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#075056]" />
                    Sigma
                  </span>
                </div>
              </div>

              {selectedRun.error && (
                <CardDescription className="mt-2 text-[#074068]">
                  {selectedRun.error}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="pt-6">
              <div
                className="h-72 w-full"
                data-testid="fitness-chart"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedRun.generation_history}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(211,219,221,0.08)"
                    />

                    <XAxis
                      dataKey="generation"
                      tick={{
                        fontSize: 11,
                        fill: "rgba(211,219,221,0.45)",
                      }}
                      axisLine={{
                        stroke: "rgba(211,219,221,0.1)",
                      }}
                      tickLine={false}
                      label={{
                        value: "Generation",
                        position: "insideBottom",
                        offset: -5,
                        fontSize: 11,
                        fill: "rgba(211,219,221,0.45)",
                      }}
                    />

                    <YAxis
                      tick={{
                        fontSize: 11,
                        fill: "rgba(211,219,221,0.45)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#0f1b22",
                        border: "1px solid rgba(211,219,221,0.12)",
                        borderRadius: 10,
                        color: "#d3dbdd",
                        fontSize: 12,
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="best_fitness"
                      stroke="#074068"
                      name="Best fitness"
                      dot={false}
                      strokeWidth={2.5}
                    />

                    <Line
                      type="monotone"
                      dataKey="avg_fitness"
                      stroke="#f2d17d"
                      name="Avg fitness"
                      dot={false}
                      strokeWidth={2}
                    />

                    <Line
                      type="monotone"
                      dataKey="sigma"
                      stroke="#075056"
                      name="Mutation sigma"
                      dot={false}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            EVOLUTIONARY LINEAGE
        ============================================================ */}
        {selectedRun && lineageElements && (
          <Card className="overflow-hidden rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
            <CardHeader className="border-b border-[#d3dbdd]/10 pb-4">
              <CardTitle className="text-lg font-semibold text-[#d3dbdd]">
                Evolutionary lineage
              </CardTitle>

              <CardDescription className="mt-1 text-[#d3dbdd]/50">
                Parent {"->"} child chains for this run&apos;s seed strategy
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              <div className="overflow-hidden rounded-xl border border-[#d3dbdd]/10 bg-[#0f1b22]">
                <KnowledgeGraphViewer seed={lineageElements} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            PENDING CANDIDATES
        ============================================================ */}
        <Card className="overflow-hidden rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
          <CardHeader className="border-b border-[#d3dbdd]/10 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#f2d17d]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d3dbdd]/45">
                    Review queue
                  </span>
                </div>

                <CardTitle className="text-lg font-semibold text-[#d3dbdd]">
                  Pending candidates
                </CardTitle>

                <CardDescription className="mt-1 text-[#d3dbdd]/50">
                  GA-evolved strategies awaiting approve/reject
                </CardDescription>
              </div>

              {pending.length > 0 && (
                <span className="flex h-11 min-w-11 items-center justify-center rounded-full bg-[#074068] px-3 text-lg font-bold leading-none text-white shadow-sm">
                  {pending.length}
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {pending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d3dbdd]/10 bg-[#0f1b22]/50 py-12 text-center">
                <p className="text-sm text-[#d3dbdd]/40">
                  No pending candidates.
                </p>
              </div>
            ) : (
              <div
                className="grid gap-4"
                data-testid="pending-candidates"
              >
                {pending.map((c, index) => (
                  <div
                    key={c.id}
                    className="group relative overflow-hidden rounded-xl border border-[#d3dbdd]/10 bg-[#0f1b22] transition-all duration-200 hover:border-[#075056] hover:bg-[#0d2026]"
                  >
                    {/* Accent line */}
                    <div className="absolute left-0 top-0 h-full w-1 bg-[#075056] transition-colors group-hover:bg-[#074068]" />

                    <div className="p-5 pl-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-start gap-3">
                            <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-md bg-[#042f34] px-1.5 text-[10px] font-semibold text-[#d3dbdd]/70">
                              {String(index + 1).padStart(2, "0")}
                            </span>

                            <span className="break-words text-base font-semibold leading-6 text-[#d3dbdd]">
                              {c.name}
                            </span>
                          </div>

                          {c.regime_compatibility && (
                            <div className="ml-9 flex flex-wrap gap-2 text-xs">
                              {Object.entries(c.regime_compatibility).map(
                                ([label, sharpe]) => (
                                  <span
                                    key={label}
                                    className="rounded-full border border-[#d3dbdd]/10 bg-[#16232b] px-2.5 py-1 text-[#d3dbdd]/60"
                                  >
                                    <span className="text-[#d3dbdd]/80">
                                      {label}
                                    </span>
                                    <span className="mx-1 text-[#d3dbdd]/25">
                                      :
                                    </span>
                                    <span className="text-[#f2d17d]">
                                      {sharpe?.toFixed(2) ?? "n/a"}
                                    </span>
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-end">
                          <span className="text-xs text-[#d3dbdd]/45">
                            robustness
                          </span>

                          <span className="font-mono text-sm font-semibold text-[#f2d17d]">
                            {c.robustness_score?.toFixed(3) ?? "—"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#d3dbdd]/[0.06] pt-4">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[#d3dbdd]/30">
                          Awaiting decision
                        </span>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => decide(c.id, "approve")}
                            data-testid={`approve-${c.id}`}
                            className="h-9 rounded-lg bg-[#074068] px-4 font-medium text-white shadow-none hover:bg-[#074068]/90"
                          >
                            Approve
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decide(c.id, "reject")}
                            data-testid={`reject-${c.id}`}
                            className="h-9 rounded-lg border-[#d3dbdd]/15 bg-transparent px-4 text-[#d3dbdd]/75 shadow-none hover:border-[#074068]/40 hover:bg-[#074068]/10 hover:text-[#d3dbdd]"
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
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