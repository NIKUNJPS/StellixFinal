"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useHealth } from "@/hooks/use-health";
import { HEALTH_SERVICES, type ServiceHealth, type ServiceStatus } from "@/lib/types";

const SERVICE_LABELS: Record<(typeof HEALTH_SERVICES)[number], string> = {
  postgres: "PostgreSQL + TimescaleDB",
  redis: "Redis",
};

function StatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <Badge variant={status === "ok" ? "success" : "destructive"}>
      {status === "ok" ? "OK" : "ERROR"}
    </Badge>
  );
}

function ServiceRow({ name, health }: { name: string; health: ServiceHealth }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
      <div className="flex flex-col">
        <span className="font-medium">{name}</span>
        {health.detail ? (
          <span className="text-xs text-destructive">{health.detail}</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {health.latency_ms != null ? `${health.latency_ms} ms` : "—"}
          </span>
        )}
      </div>
      <StatusBadge status={health.status} />
    </div>
  );
}

export default function HealthPage() {
  const { data, isPending, isError, error } = useHealth();

  return (
    <main className="container mx-auto max-w-2xl py-16">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Connection Test</CardTitle>
            {data && <StatusBadge status={data.status} />}
          </div>
          <CardDescription>
            Live health of every backing service. Auto-refreshes every 5 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isPending && (
            <p className="text-sm text-muted-foreground">Contacting backend…</p>
          )}

          {isError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Could not reach the backend API.
              <span className="mt-1 block text-xs opacity-80">
                {error instanceof Error ? error.message : "Unknown error"}
              </span>
            </div>
          )}

          {data &&
            HEALTH_SERVICES.map((key) => (
              <ServiceRow
                key={key}
                name={SERVICE_LABELS[key]}
                health={data[key]}
              />
            ))}
        </CardContent>
      </Card>
    </main>
  );
}
