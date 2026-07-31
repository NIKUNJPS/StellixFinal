import { apiFetch, errorMessage } from "@/lib/api-client";

export interface OnboardingStatus {
  completed: boolean;
  strategy_count: number;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const res = await apiFetch("/onboarding/status");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load onboarding status"));
  return (await res.json()) as OnboardingStatus;
}

export async function completeOnboarding(): Promise<void> {
  const res = await apiFetch("/onboarding/complete", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to complete onboarding"));
}
