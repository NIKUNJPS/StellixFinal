import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  ExplanationEnqueued,
  Failure,
  FailureClusters,
  FailureHeatmapResponse,
  FailureList,
} from "@/lib/failure-types";

export async function listFailures(limit = 200): Promise<FailureList> {
  const res = await apiFetch(`/failures?limit=${limit}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load failures"));
  return (await res.json()) as FailureList;
}

export async function getFailure(id: string): Promise<Failure> {
  const res = await apiFetch(`/failures/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load failure"));
  return (await res.json()) as Failure;
}

export async function getFailureClusters(): Promise<FailureClusters> {
  const res = await apiFetch("/failures/clusters");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load clusters"));
  return (await res.json()) as FailureClusters;
}

export async function getFailureHeatmap(): Promise<FailureHeatmapResponse> {
  const res = await apiFetch("/failures/heatmap");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load failure heatmap"));
  return (await res.json()) as FailureHeatmapResponse;
}

/** Batch 25: queue AI explanation generation for a failure that has none yet. */
export async function requestFailureExplanation(id: string): Promise<ExplanationEnqueued> {
  const res = await apiFetch(`/failures/${id}/explanation`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to request an explanation"));
  return (await res.json()) as ExplanationEnqueued;
}
