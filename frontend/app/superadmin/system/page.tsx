"use client";

import { useEffect, useState } from "react";
import {
  Server,
  Activity,
  HardDrive,
  Cpu,
  Layers,
  CheckCircle2,
  AlertOctagon,
  Clock,
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
    getSystemHealthDetailed().then(setHealth).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-[#E4EEF0]/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            System Pulse
          </h1>
          <p className="mt-1 text-sm text-[#E4EEF0]/70">
            Platform-wide infrastructure telemetry, database services, and asynchronous Celery queues.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div className="flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/50 px-3 py-1.5 font-mono text-xs text-[#E4EEF0]/80">
            <Server className="h-3.5 w-3.5 text-[#F4D47C]" />
            <span>Infrastructure Status</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {health && (
        <>
          {/* Global Status Strip */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E4EEF0]/10 bg-[#042F34]/50 p-4 shadow-lg shadow-black/20 backdrop-blur-md">
            <div className="flex items-center gap-2 pr-4 border-r border-[#E4EEF0]/10">
              <span className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">Cluster Pulse:</span>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  health.status === "ok"
                    ? "border-[#F4D47C]/30 bg-[#F4D47C]/10 text-[#F4D47C]"
                    : "border-[#FF5B04]/40 bg-[#FF5B04]/15 text-[#FF5B04]"
                }`}
              >
                {health.status}
              </Badge>
            </div>

            <div className="flex items-center gap-2 pr-4 border-r border-[#E4EEF0]/10">
              <span className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">Liveness:</span>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  health.liveness
                    ? "border-[#F4D47C]/30 bg-[#F4D47C]/10 text-[#F4D47C]"
                    : "border-[#FF5B04]/40 bg-[#FF5B04]/15 text-[#FF5B04]"
                }`}
              >
                {health.liveness ? "Up" : "Down"}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">Readiness:</span>
              <Badge
                className={`font-mono text-[10px] uppercase ${
                  health.readiness
                    ? "border-[#F4D47C]/30 bg-[#F4D47C]/10 text-[#F4D47C]"
                    : "border-[#FF5B04]/40 bg-[#FF5B04]/15 text-[#FF5B04]"
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
                className="border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-lg shadow-black/20 backdrop-blur-md transition-all hover:border-[#FF5B04]/30 hover:bg-[#042F34]/70"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-white">
                      {SERVICE_LABELS[name] ?? name}
                    </p>
                    <Badge
                      className={`font-mono text-[9px] uppercase ${
                        svc.status === "ok"
                          ? "border-[#F4D47C]/30 bg-[#F4D47C]/10 text-[#F4D47C]"
                          : "border-[#FF5B04]/40 bg-[#FF5B04]/15 text-[#FF5B04]"
                      }`}
                    >
                      {svc.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[#E4EEF0]/5 bg-[#16232B]/60 p-2.5 font-mono text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#E4EEF0]/50">Uptime</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#F4D47C]">
                        {svc.uptime_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#E4EEF0]/50">Response</p>
                      <p className="mt-0.5 text-xs font-semibold text-white">
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
            <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
              <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-4 px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                    <Cpu className="h-4 w-4 text-[#F4D47C]" />
                    <span>Host Node Resources</span>
                  </CardTitle>
                </div>
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
            <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
              <CardHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70 py-4 px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                    <ListTodo className="h-4 w-4 text-[#FF5B04]" />
                    <span>
                      Celery Task Queues
                      {health.failed_job_count ? ` · ${health.failed_job_count} failed` : ""}
                    </span>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/40">
                    <TableRow className="border-b border-[#E4EEF0]/10 hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                        Task Definition
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                        Active
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                        Pending
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.job_queue.map((j) => (
                      <TableRow
                        key={j.task_name}
                        className="border-b border-[#E4EEF0]/5 transition-colors hover:bg-[#16232B]/50"
                      >
                        <TableCell className="py-3 font-mono text-xs text-white">
                          {j.task_name}
                        </TableCell>
                        <TableCell className="py-3 text-right font-mono text-xs font-semibold text-[#F4D47C]">
                          {j.active}
                        </TableCell>
                        <TableCell className="py-3 text-right font-mono text-xs text-[#E4EEF0]/70">
                          {j.pending}
                        </TableCell>
                      </TableRow>
                    ))}
                    {health.job_queue.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="py-8 text-center font-mono text-xs text-[#E4EEF0]/50"
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
        <div className="flex items-center justify-center py-20 text-white">
          <div className="flex items-center gap-3 text-sm text-[#E4EEF0]/70">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
            <span className="font-mono">Pinging platform infrastructure nodes...</span>
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
        <span className="flex items-center gap-1.5 text-[#E4EEF0]/80">
          <Icon className="h-3.5 w-3.5 text-[#E4EEF0]/50" />
          {label}
        </span>
        <span className={`font-semibold ${isHigh ? "text-[#FF5B04]" : isMedium ? "text-[#F4D47C]" : "text-white"}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#16232B]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isHigh
              ? "bg-[#FF5B04]"
              : isMedium
              ? "bg-[#F4D47C]"
              : "bg-[#F4D47C]/80"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}