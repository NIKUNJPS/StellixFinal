/** Types mirroring backend app/schemas/system_health.py (Batch 12, Page 21). */

export type ServiceStatus = "ok" | "error";

export interface ServiceHealthDetailed {
  status: ServiceStatus;
  uptime_pct: number;
  last_check: string;
  response_time_ms: number | null;
  detail: string | null;
}

export interface JobQueueEntry {
  task_name: string;
  active: number;
  pending: number;
}

export interface ResourceGauges {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

/** Research Memory index for the caller's organization (rebuilt from PostgreSQL). */
export interface MemoryIndexStatus {
  rebuilt_at: string;
  refresh_seconds: number;
  strategies: number;
  failures: number;
  research_notes: number;
}

export interface SystemHealthDetailedResponse {
  status: ServiceStatus;
  services: Record<string, ServiceHealthDetailed>;
  job_queue: JobQueueEntry[];
  failed_job_count: number;
  resources: ResourceGauges;
  memory_index: MemoryIndexStatus | null;
  liveness: boolean;
  readiness: boolean;
}

export const SERVICE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  timescaledb: "TimescaleDB",
  redis: "Redis",
  celery_worker: "Celery Worker",
};
