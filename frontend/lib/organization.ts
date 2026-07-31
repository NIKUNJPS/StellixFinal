import { apiFetch, errorMessage } from "@/lib/api-client";
import type { OrganizationRead } from "@/lib/auth-types";

export async function updateOrganization(benchmarkSymbol: string): Promise<OrganizationRead> {
  const res = await apiFetch("/organizations/me", {
    method: "PATCH",
    body: JSON.stringify({ benchmark_symbol: benchmarkSymbol }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to update organization settings"));
  return (await res.json()) as OrganizationRead;
}

// Batch 22: toggle the weekly digest. The PATCH endpoint accepts a partial body, so
// this updates only the one field.
export async function setWeeklyDigestEnabled(enabled: boolean): Promise<OrganizationRead> {
  const res = await apiFetch("/organizations/me", {
    method: "PATCH",
    body: JSON.stringify({ weekly_digest_enabled: enabled }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to update digest preference"));
  return (await res.json()) as OrganizationRead;
}

export interface WeeklyDigestContent {
  event: string;
  audience: string;
  subject: string;
  body: string;
  stats: {
    window_days: number;
    new_strategies_this_week: number;
    new_failures_this_week: Array<{ name: string; trigger: string }>;
    regime_changes_this_week: Array<{ symbol: string; old: string; new: string }>;
    evolution_completions_this_week: number;
    portfolio_sharpe: number | null;
  };
}

export async function previewWeeklyDigest(): Promise<WeeklyDigestContent> {
  const res = await apiFetch("/notifications/digest/preview", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to build digest preview"));
  return (await res.json()) as WeeklyDigestContent;
}
