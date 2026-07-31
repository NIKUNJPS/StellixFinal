import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  EvolutionRunDetail,
  EvolutionRunEnqueued,
  EvolutionRunListResponse,
  EvolutionRunRequest,
  PendingCandidatesResponse,
} from "@/lib/evolution-types";

export async function startEvolutionRun(payload: EvolutionRunRequest): Promise<EvolutionRunEnqueued> {
  const res = await apiFetch("/evolution/run", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to start evolution run"));
  return (await res.json()) as EvolutionRunEnqueued;
}

export async function listEvolutionRuns(): Promise<EvolutionRunListResponse> {
  const res = await apiFetch("/evolution/runs");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load evolution runs"));
  return (await res.json()) as EvolutionRunListResponse;
}

export async function getEvolutionRun(id: string): Promise<EvolutionRunDetail> {
  const res = await apiFetch(`/evolution/runs/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load evolution run"));
  return (await res.json()) as EvolutionRunDetail;
}

export async function getPendingCandidates(): Promise<PendingCandidatesResponse> {
  const res = await apiFetch("/evolution/candidates/pending");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load pending candidates"));
  return (await res.json()) as PendingCandidatesResponse;
}

export async function decideCandidate(
  strategyId: string,
  action: "approve" | "reject",
  justification: string,
): Promise<void> {
  const res = await apiFetch(`/evolution/candidates/${strategyId}/${action}`, {
    method: "POST",
    body: JSON.stringify({ justification }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to ${action} candidate`));
}
