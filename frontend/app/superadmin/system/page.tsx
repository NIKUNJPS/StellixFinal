"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="text-sm text-muted-foreground">Platform infrastructure health across all services.</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {health && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Overall</span>
            <Badge variant={health.status === "ok" ? "success" : "destructive"}>{health.status}</Badge>
            <span className="text-sm text-muted-foreground">Liveness</span>
            <Badge variant={health.liveness ? "success" : "destructive"}>{health.liveness ? "up" : "down"}</Badge>
            <span className="text-sm text-muted-foreground">Readiness</span>
            <Badge variant={health.readiness ? "success" : "destructive"}>{health.readiness ? "ready" : "not ready"}</Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(health.services).map(([name, svc]) => (
              <Card key={name}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{SERVICE_LABELS[name] ?? name}</p>
                    <Badge variant={svc.status === "ok" ? "success" : "destructive"}>{svc.status}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p>Uptime</p>
                      <p className="text-sm font-medium text-foreground">{svc.uptime_pct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p>Response</p>
                      <p className="text-sm font-medium text-foreground">
                        {svc.response_time_ms !== null ? `${svc.response_time_ms.toFixed(0)}ms` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Gauge label="CPU" pct={health.resources.cpu_percent} />
                <Gauge label="Memory" pct={health.resources.memory_percent} />
                <Gauge label="Disk" pct={health.resources.disk_percent} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Job queue{health.failed_job_count ? ` · ${health.failed_job_count} failed` : ""}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.job_queue.map((j) => (
                      <TableRow key={j.task_name}>
                        <TableCell className="font-medium">{j.task_name}</TableCell>
                        <TableCell className="text-right">{j.active}</TableCell>
                        <TableCell className="text-right">{j.pending}</TableCell>
                      </TableRow>
                    ))}
                    {health.job_queue.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-4 text-center text-sm text-muted-foreground">Idle.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!health && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}

function Gauge({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct.toFixed(0)}%</span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
