import { apiFetch, errorMessage } from "@/lib/api-client";
import type { RateLimitUsage } from "@/lib/usage-types";

export async function getRateLimitUsage(): Promise<RateLimitUsage> {
  const res = await apiFetch("/usage/rate-limits");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load usage"));
  return (await res.json()) as RateLimitUsage;
}
