"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSystemHealthDetailed, triggerBackendSentryTest } from "@/lib/system";
import { SERVICE_LABELS, type SystemHealthDetailedResponse } from "@/lib/system-types";

function ServiceCard({ name, service }: { name: string; service: SystemHealthDetailedResponse["services"][string] }) {
  return (
    <Card data-testid={`service-${name}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">{SERVICE_LABELS[name] ?? name}</p>
          <Badge variant={service.status === "ok" ? "success" : "destructive"}>{service.status}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            <p>Uptime</p>
            <p className="text-sm font-medium text-foreground">{service.uptime_pct.toFixed(1)}%</p>
          </div>
          <div>
            <p>Response</p>
            <p className="text-sm font-medium text-foreground">
              {service.response_time_ms !== null ? `${service.response_time_ms.toFixed(0)}ms` : "—"}
            </p>
          </div>
          <div>
            <p>Last Check</p>
            <p className="text-sm font-medium text-foreground">{new Date(service.last_check).toLocaleTimeString()}</p>
          </div>
        </div>
        {service.detail && <p className="mt-2 text-xs text-destructive">{service.detail}</p>}
      </CardContent>
    </Card>
  );
}

function ResourceGauge({ label, percent, sub }: { label: string; percent: number; sub: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{percent.toFixed(1)}%</span>
      </div>
      <Progress value={percent} />
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export default function SystemMonitoringPage() {
  const [data, setData] = useState<SystemHealthDetailedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentryTestMessage, setSentryTestMessage] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const health = await getSystemHealthDetailed();
      setData(health);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load system health (admin role required)");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  async function handleBackendSentryTest() {
    setSentryTestMessage(null);
    try {
      await triggerBackendSentryTest();
      setSentryTestMessage("Unexpected: backend did not raise.");
    } catch {
      setSentryTestMessage(
        "Backend raised as expected (500) — check server logs / Sentry for the captured event.",
      );
    }
  }

  function handleFrontendSentryTest() {
    setSentryTestMessage("Throwing a real client-side exception now — check Sentry for the captured event.");
    throw new Error("Batch 13 Sentry verification: this client-side exception is intentional.");
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">System Monitoring</h1>
          {data && <Badge variant={data.status === "ok" ? "success" : "destructive"}>{data.status}</Badge>}
          {data && (
            <Badge variant={data.readiness ? "success" : "destructive"} data-testid="readiness-badge">
              {data.readiness ? "ready" : "not ready"}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Error Tracking (Sentry)</CardTitle>
          <CardDescription>
            Deliberately trigger a real exception on each side to confirm it&apos;s captured. No-op locally unless
            SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN are configured — the exception, log line, and clean error response
            still happen either way.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleBackendSentryTest} data-testid="sentry-test-backend">
            Trigger Backend Exception
          </Button>
          <Button variant="outline" size="sm" onClick={handleFrontendSentryTest} data-testid="sentry-test-frontend">
            Trigger Frontend Exception
          </Button>
          {sentryTestMessage && <p className="text-sm text-muted-foreground">{sentryTestMessage}</p>}
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Object.entries(data.services).map(([name, service]) => (
              <ServiceCard key={name} name={name} service={service} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Host Resources</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ResourceGauge
                  label="CPU"
                  percent={data.resources.cpu_percent}
                  sub="current utilization"
                />
                <ResourceGauge
                  label="Memory"
                  percent={data.resources.memory_percent}
                  sub={`${data.resources.memory_used_mb.toFixed(0)} / ${data.resources.memory_total_mb.toFixed(0)} MB`}
                />
                <ResourceGauge
                  label="Disk"
                  percent={data.resources.disk_percent}
                  sub={`${data.resources.disk_used_gb.toFixed(1)} / ${data.resources.disk_total_gb.toFixed(1)} GB`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Job Queue</CardTitle>
                <CardDescription>{data.failed_job_count} failed job(s) in the result backend</CardDescription>
              </CardHeader>
              <CardContent>
                {data.job_queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active or pending tasks.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.job_queue.map((row) => (
                        <TableRow key={row.task_name}>
                          <TableCell className="font-mono text-xs">{row.task_name}</TableCell>
                          <TableCell>{row.active}</TableCell>
                          <TableCell>{row.pending}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Consistency Alerts</CardTitle>
                <CardDescription>Knowledge-graph sync sweep (Batch 7)</CardDescription>
              </CardHeader>
              <CardContent>
                {!data.consistency_alert ? (
                  <p className="text-sm text-muted-foreground">No consistency sweep has run yet for this organization.</p>
                ) : data.consistency_alert.graph_unreachable ? (
                  <p className="flex items-center gap-2 text-sm text-amber-500">
                    <AlertTriangle className="h-4 w-4" /> Graph database was unreachable during the last sweep (
                    {new Date(data.consistency_alert.checked_at).toLocaleString()}).
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 text-sm">
                    <p>
                      Orphaned nodes: <strong>{data.consistency_alert.orphaned_graph_nodes.length}</strong> · Unsynced
                      strategies: <strong>{data.consistency_alert.unsynced_strategies.length}</strong> · Missing lineage
                      edges: <strong>{data.consistency_alert.missing_lineage_edges.length}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last checked {new Date(data.consistency_alert.checked_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
