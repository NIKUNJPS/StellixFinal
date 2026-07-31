"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FailureClusterChart } from "@/components/failure/failure-cluster-chart";
import { RegimeTimeline, type TimelineMarker } from "@/components/regime/regime-timeline";
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
import { getFailure, getFailureClusters, listFailures } from "@/lib/failure";
import {
  TRIGGER_COLORS,
  TRIGGER_LABELS,
  type Failure,
  type FailureCluster,
  type FailureListItem,
} from "@/lib/failure-types";
import { getRegimeHistory } from "@/lib/regime";
import type { RegimePoint } from "@/lib/regime-types";

export default function FailureIntelligencePage() {
  const [failures, setFailures] = useState<FailureListItem[]>([]);
  const [clusters, setClusters] = useState<FailureCluster[]>([]);
  const [selected, setSelected] = useState<Failure | null>(null);
  const [symbol, setSymbol] = useState("SPY");
  const [regimePoints, setRegimePoints] = useState<RegimePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listFailures(), getFailureClusters()])
      .then(([f, c]) => {
        setFailures(f.items);
        setClusters(c.clusters);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const loadTimeline = useCallback(async () => {
    try {
      const hist = await getRegimeHistory(symbol.trim().toUpperCase());
      setRegimePoints(hist.points);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load regime timeline");
    }
  }, [symbol]);

  async function selectFailure(id: string) {
    try {
      setSelected(await getFailure(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load failure");
    }
  }

  const markers: TimelineMarker[] = failures.map((f) => ({
    timestamp: f.failure_timestamp,
    color: TRIGGER_COLORS[f.trigger_condition],
    label: TRIGGER_LABELS[f.trigger_condition],
  }));

  const shapData =
    selected?.feature_attribution?.map((f) => ({
      name: f.feature_name,
      value: f.direction === "negative" ? -f.shap_value : f.shap_value,
      color: f.direction === "positive" ? "#16a34a" : "#dc2626",
    })) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Failure Intelligence</CardTitle>
          <CardDescription>
            Failed strategies are first-class, append-only research assets (Pillar 2).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Failure event table */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Failure events</h3>
            {failures.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No failures detected — strategies performing well.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="failure-table">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2">Failure</th>
                      <th className="px-3 py-2">Regime</th>
                      <th className="px-3 py-2">Trigger</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((f) => (
                      <tr
                        key={f.id}
                        onClick={() => selectFailure(f.id)}
                        className={`cursor-pointer border-b border-border/60 hover:bg-accent/40 ${selected?.id === f.id ? "bg-accent/40" : ""}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{f.id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{f.regime_at_failure}</td>
                        <td className="px-3 py-2">
                          <Badge style={{ background: TRIGGER_COLORS[f.trigger_condition], color: "white" }}>
                            {TRIGGER_LABELS[f.trigger_condition]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {f.failure_timestamp.slice(0, 10)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {f.llm_generated_explanation ?? "pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI-generated explanation for the selected failure */}
          {selected && (
            <div data-testid="llm-explanation">
              <h3 className="mb-2 text-sm font-medium">
                AI explanation · failure {selected.id.slice(0, 8)}
              </h3>
              {selected.llm_numeric_validation_passed === false && (
                <Badge variant="destructive" className="mb-2" data-testid="numeric-validation-warning">
                  Warning: a number in this explanation could not be verified against the real record
                </Badge>
              )}
              <p className="text-sm text-muted-foreground">
                {selected.llm_generated_explanation ?? "Explanation pending — generated automatically shortly after the failure was recorded."}
              </p>
            </div>
          )}

          {/* SHAP feature attribution for the selected failure */}
          {selected && (
            <div data-testid="shap-chart">
              <h3 className="mb-2 text-sm font-medium">
                SHAP feature attribution · failure {selected.id.slice(0, 8)}
              </h3>
              {shapData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No attribution (strategy had fewer than 10 trades).
                </p>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shapData} layout="vertical" margin={{ left: 24, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                      <Bar dataKey="value">
                        {shapData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                        <LabelList dataKey="value" position="right" formatter={(v: number) => v.toFixed(3)} style={{ fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Failure cluster bubble chart */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Failure clusters (regime × trigger)</h3>
            <FailureClusterChart clusters={clusters} />
          </div>

          {/* Failure timeline overlaid on the regime timeline */}
          <div>
            <div className="mb-2 flex items-end gap-2">
              <h3 className="text-sm font-medium">Failure timeline</h3>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="ml-auto h-8 w-28" />
              <Button size="sm" variant="outline" onClick={loadTimeline}>Load</Button>
            </div>
            {regimePoints.length > 0 ? (
              <RegimeTimeline points={regimePoints} markers={markers} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Load a symbol to overlay failure events on its regime timeline.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
