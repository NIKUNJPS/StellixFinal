"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Activity, Cpu, HardDrive, Database, ShieldAlert, Sparkles, Server } from "lucide-react";

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
  const isOk = service.status === "ok";

  return (
    <Card
      data-testid={`service-${name}`}
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-200 hover:border-white/[0.18]"
      style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs font-semibold text-[#F5F5F7]">{SERVICE_LABELS[name] ?? name}</p>
          <Badge
            variant={isOk ? "success" : "destructive"}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${
              isOk
                ? "border border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                : "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
            }`}
          >
            {service.status}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-[10px]">
          <div>
            <p className="font-mono text-[#808495]">Uptime</p>
            <p className="mt-0.5 font-mono font-semibold text-[#F5F5F7]">{service.uptime_pct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="font-mono text-[#808495]">Latency</p>
            <p className="mt-0.5 font-mono font-semibold text-[#F5F5F7]">
              {service.response_time_ms !== null ? `${service.response_time_ms.toFixed(0)}ms` : "—"}
            </p>
          </div>
          <div>
            <p className="font-mono text-[#808495]">Checked</p>
            <p className="mt-0.5 font-mono font-semibold text-[#808495]">{new Date(service.last_check).toLocaleTimeString()}</p>
          </div>
        </div>

        {service.detail && <p className="mt-3 font-mono text-[11px] text-[#F87171]">{service.detail}</p>}
      </CardContent>
    </Card>
  );
}

function ResourceGauge({ label, percent, sub }: { label: string; percent: number; sub: string }) {
  // Determine color status based on threshold limits:
  // < 70% : Green (#34D399)
  // 70% - 85% : Yellow (#FBBF24)
  // > 85% : Red (#F87171)
  const getStatusColor = (val: number) => {
    if (val < 70) return { text: "text-[#34D399]", bg: "bg-[#34D399]" };
    if (val <= 85) return { text: "text-[#FBBF24]", bg: "bg-[#FBBF24]" };
    return { text: "text-[#F87171]", bg: "bg-[#F87171]" };
  };

  const status = getStatusColor(percent);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
        <span className="text-[#808495]">{label}</span>
        <span className={`font-semibold ${status.text}`}>{percent.toFixed(1)}%</span>
      </div>

      {/* Progress container with customized dynamic status color for bar fill */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#07080B]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${status.bg}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <p className="mt-1 font-mono text-[10px] text-[#808495]">{sub}</p>
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

  const cardClass = "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#8E88C7]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-60 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* HEADER */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
              <Sparkles className="h-3.5 w-3.5 text-[#8E88C7]" />
              Quantix Intelligence • Operational Telemetry
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
              System Monitoring
            </h1>

            <p className="mt-1 text-xs text-[#9A9DA8]">
              Real-time cluster vitals, service health endpoints, host hardware utilization, and background job queues.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <Badge
                variant={data.status === "ok" ? "success" : "destructive"}
                className={`rounded-xl px-3 py-1 font-mono text-xs font-semibold ${
                  data.status === "ok"
                    ? "border border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                    : "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                }`}
              >
                {data.status}
              </Badge>
            )}
            {data && (
              <Badge
                variant={data.readiness ? "success" : "destructive"}
                data-testid="readiness-badge"
                className={`rounded-xl px-3 py-1 font-mono text-xs font-semibold ${
                  data.readiness
                    ? "border border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                    : "border border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                }`}
              >
                {data.readiness ? "ready" : "not ready"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={busy}
              className="h-10 rounded-xl border-white/10 bg-transparent px-4 font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.05] hover:text-[#F5F5F7]"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* ERROR NOTIFICATION */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#F87171]/30 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#F87171]" />
            <p>{error}</p>
          </div>
        )}

        {/* ERROR TRACKING (SENTRY) PANEL */}
        <Card
          className={cardClass}
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          <CardHeader className="border-b border-white/[0.06] p-5">
            <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
              Error Tracking (Sentry Verification)
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-[#808495]">
              Deliberately trigger exceptions on frontend or backend endpoints to verify diagnostic logging telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackendSentryTest}
                data-testid="sentry-test-backend"
                className="h-9 rounded-xl border-white/10 bg-[#0F1117]/80 font-mono text-xs text-[#F5F5F7] transition-colors hover:border-[#8E88C7]/60 hover:bg-[#8E88C7]/15 hover:text-[#8E88C7]"
              >
                Trigger Backend Exception
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFrontendSentryTest}
                data-testid="sentry-test-frontend"
                className="h-9 rounded-xl border-white/10 bg-[#0F1117]/80 font-mono text-xs text-[#F5F5F7] transition-colors hover:border-[#8E88C7]/60 hover:bg-[#8E88C7]/15 hover:text-[#8E88C7]"
              >
                Trigger Frontend Exception
              </Button>
            </div>
            {sentryTestMessage && (
              <p className="mt-3 font-mono text-xs text-[#808495]">{sentryTestMessage}</p>
            )}
          </CardContent>
        </Card>

        {/* SERVICES GRID & HOST TELEMETRY */}
        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {Object.entries(data.services).map(([name, service]) => (
                <ServiceCard key={name} name={name} service={service} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* HOST RESOURCES */}
              <Card
                className={cardClass}
                style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
              >
                <CardHeader className="border-b border-white/[0.06] p-5">
                  <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Host Hardware Resources
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 p-5">
                  <ResourceGauge
                    label="CPU Utilization"
                    percent={data.resources.cpu_percent}
                    sub="Current processing load across host cores"
                  />
                  <ResourceGauge
                    label="Memory Utilization"
                    percent={data.resources.memory_percent}
                    sub={`${data.resources.memory_used_mb.toFixed(0)} / ${data.resources.memory_total_mb.toFixed(0)} MB RAM allocated`}
                  />
                  <ResourceGauge
                    label="Disk Storage Utilization"
                    percent={data.resources.disk_percent}
                    sub={`${data.resources.disk_used_gb.toFixed(1)} / ${data.resources.disk_total_gb.toFixed(1)} GB volume capacity`}
                  />
                </CardContent>
              </Card>

              {/* JOB QUEUE */}
              <Card
                className={cardClass}
                style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
              >
                <CardHeader className="border-b border-white/[0.06] p-5">
                  <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Async Worker Job Queue
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-[#808495]">
                    {data.failed_job_count} failed job(s) recorded in result backend
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {data.job_queue.length === 0 ? (
                    <p className="p-5 text-xs text-[#808495]">No active or pending tasks in queue.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="w-full text-xs">
                        <TableHeader>
                          <TableRow className="border-b border-white/[0.06] bg-[#0F1117]/40 font-mono text-[10px] uppercase tracking-wider text-[#808495]">
                            <TableHead className="px-5 py-3">Task</TableHead>
                            <TableHead className="px-5 py-3">Active</TableHead>
                            <TableHead className="px-5 py-3">Pending</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-white/[0.04]">
                          {data.job_queue.map((row) => (
                            <TableRow key={row.task_name} className="hover:bg-white/[0.02]">
                              <TableCell className="px-5 py-3 font-mono text-[#F5F5F7]">{row.task_name}</TableCell>
                              <TableCell className="px-5 py-3 font-mono text-[#34D399]">{row.active}</TableCell>
                              <TableCell className="px-5 py-3 font-mono text-[#FBBF24]">{row.pending}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CONSISTENCY ALERTS */}
              <Card
                className={`lg:col-span-2 ${cardClass}`}
                style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
              >
                <CardHeader className="border-b border-white/[0.06] p-5">
                  <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                    Knowledge Graph Consistency Sweep
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-[#808495]">
                    Scheduled audit sweep comparing relational strategy state with Neo4j graph nodes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5">
                  {!data.consistency_alert ? (
                    <p className="text-xs text-[#808495]">No consistency sweep has run yet for this organization.</p>
                  ) : data.consistency_alert.graph_unreachable ? (
                    <div className="flex items-center gap-2 rounded-xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 p-3 text-xs text-[#FBBF24]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Graph database was unreachable during last sweep (
                        {new Date(data.consistency_alert.checked_at).toLocaleString()}).
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 font-mono text-xs">
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <span className="text-[#808495]">Orphaned Nodes: </span>
                          <span className="font-bold text-[#F5F5F7]">{data.consistency_alert.orphaned_graph_nodes.length}</span>
                        </div>
                        <div>
                          <span className="text-[#808495]">Unsynced Strategies: </span>
                          <span className="font-bold text-[#F5F5F7]">{data.consistency_alert.unsynced_strategies.length}</span>
                        </div>
                        <div>
                          <span className="text-[#808495]">Missing Lineage Edges: </span>
                          <span className="font-bold text-[#F5F5F7]">{data.consistency_alert.missing_lineage_edges.length}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-[#808495]">
                        Last sweep completed: {new Date(data.consistency_alert.checked_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}