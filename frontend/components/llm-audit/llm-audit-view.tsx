"use client";

import { useCallback, useEffect, useState } from "react";

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
import { getAuditLog } from "@/lib/llm";
import type { AuditLogEntry } from "@/lib/llm-types";

const FUNCTION_NAMES = [
  "generate_hypothesis",
  "explain_failure",
  "critique_strategy",
  "summarize_graph_query_result",
];

export function LLMAuditView() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [functionFilter, setFunctionFilter] = useState<string>("");
  const [userIdFilter, setUserIdFilter] = useState<string>("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getAuditLog({
        function_name: functionFilter || undefined,
        user_id: userIdFilter || undefined,
        limit: 50,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log (admin/compliance_officer only)");
    }
  }, [functionFilter, userIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>LLM Audit Log</CardTitle>
          <CardDescription>
            Every LLM call, logged before the result was returned (admin / compliance_officer only). {total} total.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <select
              value={functionFilter}
              onChange={(e) => setFunctionFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              data-testid="filter-function-name"
            >
              <option value="">All functions</option>
              {FUNCTION_NAMES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <Input
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="Filter by user_id"
              className="h-9 w-64"
            />
            <Button size="sm" variant="outline" onClick={load}>
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="audit-log-table">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2">Function</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Tokens</th>
                    <th className="px-3 py-2">Numeric OK</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className={`cursor-pointer border-b border-border/60 hover:bg-accent/40 ${selected?.id === row.id ? "bg-accent/40" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{row.function_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.model_used}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.input_tokens ?? "—"}/{row.output_tokens ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.numeric_validation_passed === null ? (
                          <span className="text-xs text-muted-foreground">n/a</span>
                        ) : row.numeric_validation_passed ? (
                          <Badge variant="success">passed</Badge>
                        ) : (
                          <Badge variant="destructive">failed</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.created_at.slice(0, 19).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        No LLM calls recorded yet — the research assistant logs every
                        call here once you use it.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selected && (
              <div className="rounded-md border border-border p-4" data-testid="audit-log-detail">
                <h4 className="mb-2 text-sm font-medium">Prompt</h4>
                <pre className="mb-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
                  {selected.full_prompt}
                </pre>
                <h4 className="mb-2 text-sm font-medium">Response</h4>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
                  {selected.full_response}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
