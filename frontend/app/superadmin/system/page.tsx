"use client";

import { useEffect, useState } from "react";
import {
  Server,
  Activity,
  HardDrive,
  Cpu,
  ShieldAlert,
  ListTodo,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSystemHealthDetailed } from "@/lib/system";
import { SERVICE_LABELS, type SystemHealthDetailedResponse } from "@/lib/system-types";

export default function SuperadminSystemPage() {
  const [health, setHealth] = useState<SystemHealthDetailedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSystemHealthDetailed()
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to ping health"));
  }, []);

  const cardClass =
    "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <div className="relative mx-auto max-w-5xl space-y-6 text-[#F5F5F7]">
      {/* Ambient Background Glow Orbs */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8E88C7] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8E88C7]" />
            </span>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              Quantix Intelligence • Control Plane
            </p>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#F5F5F7] sm:text-3xl">
            System Pulse
          </h1>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Platform-wide infrastructure telemetry, database services, and asynchronous Celery queues.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <Server className="h-3.5 w-3.5 text-[#8E88C7]" />
            <span>Infrastructure Status</span>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2.5 rounded-2xl border p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.08)",
            borderColor: "rgba(248, 113, 113, 0.25)",
          }}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {health && (
        <>
          {/* Global Status Strip */}
          <div
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <div className="flex items-center gap-2.5 border-r border-white/[0.08] pr-5">
              <span className="font-mono text-xs uppercase tracking-wider text-[#808495]">Cluster Pulse:</span>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  health.status === "ok"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-[#F87171]/40 bg-[#F87171]/15 text-[#F87171]"
                }`}
              >
                {health.status}
              </Badge>
            </div>

            <div className="flex items-center gap-2.5 border-r border-white/[0.08] pr-5">
              <span className="font-mono text-xs uppercase tracking-wider text-[#808495]">Liveness:</span>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  health.liveness
                    ? "border-[#8E88C7]/30 bg-[#8E88C7]/10 text-[#8E88C7]"
                    : "border-[#F87171]/40 bg-[#F87171]/15 text-[#F87171]"
                }`}
              >
                {health.liveness ? "Up" : "Down"}
              </Badge>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs uppercase tracking-wider text-[#808495]">Readiness:</span>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  health.readiness
                    ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
                    : "border-[#F87171]/40 bg-[#F87171]/15 text-[#F87171]"
                }`}
              >
                {health.readiness ? "Ready" : "Not Ready"}
              </Badge>
            </div>
          </div>

          {/* Core Services Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(health.services).map(([name, svc]) => (
              <Card
                key={name}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18]"
                style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
              >
                <div className="pointer-events-none absolute -top-16 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-[#8E88C7]/15 opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40" />
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#F5F5F7]">
                      {SERVICE_LABELS[name] ?? name}
                    </p>
                    <Badge
                      className={`font-mono text-[9px] uppercase ${
                        svc.status === "ok"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-[#F87171]/40 bg-[#F87171]/15 text-[#F87171]"
                      }`}
                    >
                      {svc.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-[#07080B]/60 p-2.5 font-mono text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#666A76]">Uptime</p>
                      <p className="mt-0.5 text-xs font-semibold text-emerald-400">
                        {svc.uptime_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#666A76]">Response</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#F5F5F7]">
                        {svc.response_time_ms !== null ? `${svc.response_time_ms.toFixed(0)}ms` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Resources and Job Queue Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Compute Resources */}
            <Card className={cardClass} style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}>
              <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  <Cpu className="h-4 w-4 text-[#8E88C7]" />
                  <span>Host Node Resources</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <Gauge
                  label="CPU Utilization"
                  pct={health.resources.cpu_percent}
                  icon={Cpu}
                />
                <Gauge
                  label="Memory Allocation"
                  pct={health.resources.memory_percent}
                  icon={Activity}
                />
                <Gauge
                  label="Storage Volume"
                  pct={health.resources.disk_percent}
                  icon={HardDrive}
                />
              </CardContent>
            </Card>

            {/* Task Queues */}
            <Card className={cardClass} style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}>
              <CardHeader className="border-b border-white/[0.06] bg-[#0F1115]/80 py-4 px-6">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  <ListTodo className="h-4 w-4 text-[#8E88C7]" />
                  <span>
                    Celery Task Queues
                    {health.failed_job_count ? ` · ${health.failed_job_count} failed` : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="border-b border-white/[0.06] bg-[#0F1115]/40">
                    <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                        Task Definition
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                        Active
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                        Pending
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.job_queue.map((j) => (
                      <TableRow
                        key={j.task_name}
                        className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                      >
                        <TableCell className="py-3 font-mono text-xs text-[#F5F5F7]">
                          {j.task_name}
                        </TableCell>
                        <TableCell className="py-3 text-right font-mono text-xs font-semibold text-[#8E88C7]">
                          {j.active}
                        </TableCell>
                        <TableCell className="py-3 text-right font-mono text-xs text-[#9A9DA8]">
                          {j.pending}
                        </TableCell>
                      </TableRow>
                    ))}
                    {health.job_queue.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="py-8 text-center font-mono text-xs text-[#808495]"
                        >
                          Queues idle. No background jobs running.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!health && !error && (
        <div className="flex items-center justify-center py-24 text-[#F5F5F7]">
          <div className="flex items-center gap-3 text-sm text-[#9A9DA8]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
            <span className="font-mono text-xs">Pinging platform infrastructure nodes...</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Gauge({
  label,
  pct,
  icon: Icon,
}: {
  label: string;
  pct: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const isHigh = pct >= 85;
  const isMedium = pct >= 65 && pct < 85;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="flex items-center gap-1.5 text-[#9A9DA8]">
          <Icon className="h-3.5 w-3.5 text-[#666A76]" />
          {label}
        </span>
        <span
          className={`font-semibold ${
            isHigh ? "text-[#F87171]" : isMedium ? "text-amber-300" : "text-[#8E88C7]"
          }`}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06] p-[1px]">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isHigh
              ? "bg-[#F87171] shadow-[0_0_10px_rgba(248,113,113,0.6)]"
              : isMedium
              ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
              : "bg-gradient-to-r from-[#6F6B9B] to-[#8E88C7] shadow-[0_0_8px_rgba(142,136,199,0.5)]"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}