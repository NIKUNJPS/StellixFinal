import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  FailedStrategiesByRegimeResponse,
  HypothesesLeadingToActiveResponse,
  LineageResponse,
  NodeDetailResponse,
  NodeType,
  RecurringFailureModesResponse,
  RobustAcrossRegimesResponse,
  SearchResponse,
} from "@/lib/graph-types";

export async function getFailedStrategiesByRegime(
  regime: string,
  months = 24,
): Promise<FailedStrategiesByRegimeResponse> {
  const res = await apiFetch(
    `/graph/query/failed-strategies-by-regime?regime=${encodeURIComponent(regime)}&months=${months}`,
  );
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load failed-strategies-by-regime"));
  return (await res.json()) as FailedStrategiesByRegimeResponse;
}

export async function getLineage(strategyId: string): Promise<LineageResponse> {
  const res = await apiFetch(`/graph/query/lineage/${strategyId}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load lineage"));
  return (await res.json()) as LineageResponse;
}

export async function getRobustAcrossRegimes(minRegimes = 4): Promise<RobustAcrossRegimesResponse> {
  const res = await apiFetch(`/graph/query/robust-across-regimes?min_regimes=${minRegimes}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load robust-across-regimes"));
  return (await res.json()) as RobustAcrossRegimesResponse;
}

export async function getRecurringFailureModes(minOccurrences = 3): Promise<RecurringFailureModesResponse> {
  const res = await apiFetch(`/graph/query/recurring-failure-modes?min_occurrences=${minOccurrences}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load recurring-failure-modes"));
  return (await res.json()) as RecurringFailureModesResponse;
}

export async function getHypothesesLeadingToActive(): Promise<HypothesesLeadingToActiveResponse> {
  const res = await apiFetch("/graph/query/hypotheses-leading-to-active");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load hypotheses-leading-to-active"));
  return (await res.json()) as HypothesesLeadingToActiveResponse;
}

export async function getGraphNode(nodeType: NodeType, nodeId: string): Promise<NodeDetailResponse> {
  const res = await apiFetch(`/graph/node/${nodeType}/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load node"));
  return (await res.json()) as NodeDetailResponse;
}

export async function searchGraphNodes(q: string, nodeType?: NodeType): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (nodeType) params.set("node_type", nodeType);
  const res = await apiFetch(`/graph/search?${params.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Search failed"));
  return (await res.json()) as SearchResponse;
}
