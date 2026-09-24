import { apiFetch, errorMessage } from "@/lib/api-client";
import type { SignalListResponse } from "@/lib/signal-types";

/** The org's genuinely-Active strategies with their current Buy/Sell/Hold signal.
 * Gated on signals.view — a 403 means the caller's role does not grant it. */
export async function getSignals(): Promise<SignalListResponse> {
  const res = await apiFetch("/signals");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load signals"));
  return (await res.json()) as SignalListResponse;
}
