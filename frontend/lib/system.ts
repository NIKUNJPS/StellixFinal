import { apiFetch, errorMessage } from "@/lib/api-client";
import type { SystemHealthDetailedResponse } from "@/lib/system-types";

export async function getSystemHealthDetailed(): Promise<SystemHealthDetailedResponse> {
  const res = await apiFetch("/system/health-detailed");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load system health"));
  return (await res.json()) as SystemHealthDetailedResponse;
}

/** Batch 13: deliberately raises on the backend (a real, intentional 500) so
 * Sentry capture can be verified end-to-end. The rejection here is expected
 * — callers should catch it, not treat it as a real failure. */
export async function triggerBackendSentryTest(): Promise<void> {
  const res = await apiFetch("/system/observability/sentry-test");
  if (!res.ok) throw new Error(await errorMessage(res, "Backend Sentry test failed"));
}
