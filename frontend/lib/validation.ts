import { apiFetch, errorMessage } from "@/lib/api-client";
import type { ValidationResult } from "@/lib/validation-types";

export async function getValidation(strategyId: string): Promise<ValidationResult | null> {
  const res = await apiFetch(`/strategies/${strategyId}/validation`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load validation"));
  return (await res.json()) as ValidationResult;
}

export async function triggerValidation(strategyId: string, symbol: string): Promise<void> {
  const res = await apiFetch(`/strategies/${strategyId}/validate`, {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to start validation"));
}
