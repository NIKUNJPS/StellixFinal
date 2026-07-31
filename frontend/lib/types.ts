/**
 * Types mirroring the backend Pydantic schemas (app/schemas/health.py).
 * Field names are kept IDENTICAL to the API payload (PROJECT_CONSTITUTION §5),
 * including snake_case (`latency_ms`) — do not rename on the client.
 */

export type ServiceStatus = "ok" | "error";

export interface ServiceHealth {
  status: ServiceStatus;
  latency_ms: number | null;
  detail: string | null;
}

export interface HealthResponse {
  status: ServiceStatus;
  postgres: ServiceHealth;
  neo4j: ServiceHealth;
  redis: ServiceHealth;
}

/** The probed backing services, in display order. */
export const HEALTH_SERVICES = ["postgres", "neo4j", "redis"] as const;
export type HealthServiceKey = (typeof HEALTH_SERVICES)[number];
