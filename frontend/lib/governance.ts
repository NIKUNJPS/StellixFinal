import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  ActiveStrategiesResponse,
  ApprovalQueueResponse,
  ComplianceExportEnqueued,
  ComplianceExportFormat,
  ComplianceExportJob,
  ComplianceExportJobListResponse,
  GovernanceAuditLogListResponse,
  KillSwitchReview,
  KillSwitchReviewListResponse,
  KillSwitchReviewState,
  StrategyControlListResponse,
} from "@/lib/governance-types";

export async function getActiveStrategies(): Promise<ActiveStrategiesResponse> {
  const res = await apiFetch("/governance/active-strategies");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load active strategies"));
  return (await res.json()) as ActiveStrategiesResponse;
}

export async function getApprovalQueue(): Promise<ApprovalQueueResponse> {
  const res = await apiFetch("/governance/approval-queue");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load approval queue"));
  return (await res.json()) as ApprovalQueueResponse;
}

export async function killSwitch(strategyId: string, reason: string): Promise<void> {
  const res = await apiFetch(`/governance/kill-switch/${strategyId}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Kill switch failed"));
}

export async function getGovernanceAuditLog(params: {
  event_type?: string;
  entity_type?: string;
  actor_user_id?: string;
  q?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<GovernanceAuditLogListResponse> {
  const search = new URLSearchParams();
  if (params.event_type) search.set("event_type", params.event_type);
  if (params.entity_type) search.set("entity_type", params.entity_type);
  if (params.actor_user_id) search.set("actor_user_id", params.actor_user_id);
  if (params.q) search.set("q", params.q);
  if (params.start_date) search.set("start_date", params.start_date);
  if (params.end_date) search.set("end_date", params.end_date);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  const res = await apiFetch(`/governance/audit-log?${search.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load audit log"));
  return (await res.json()) as GovernanceAuditLogListResponse;
}

export async function createComplianceExport(payload: {
  start_date: string;
  end_date: string;
  export_format: ComplianceExportFormat;
}): Promise<ComplianceExportEnqueued> {
  const res = await apiFetch("/governance/export", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to enqueue compliance export"));
  return (await res.json()) as ComplianceExportEnqueued;
}

export async function getComplianceExportJob(jobId: string): Promise<ComplianceExportJob> {
  const res = await apiFetch(`/governance/export/${jobId}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load export job"));
  return (await res.json()) as ComplianceExportJob;
}

/** Resolves the browser to the download endpoint directly (auth via the same
 * cookie/bearer-aware apiFetch, then a Blob URL so <a download> works). */
export async function downloadComplianceExport(jobId: string, format: ComplianceExportFormat): Promise<void> {
  const res = await apiFetch(`/governance/export/${jobId}/download`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to download export"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stellix-compliance-export.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Batch 25: kill switch review + strategy controls + export history -------

export async function getKillSwitchReviews(params: {
  review_state?: "all" | "awaiting" | KillSwitchReviewState;
  since_days?: number;
} = {}): Promise<KillSwitchReviewListResponse> {
  const search = new URLSearchParams();
  search.set("review_state", params.review_state ?? "all");
  if (params.since_days) search.set("since_days", String(params.since_days));
  const res = await apiFetch(`/governance/kill-switch/reviews?${search.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load kill switch reviews"));
  return (await res.json()) as KillSwitchReviewListResponse;
}

export async function acknowledgeKillSwitchReview(reviewId: string, note: string): Promise<KillSwitchReview> {
  const res = await apiFetch(`/governance/kill-switch/reviews/${reviewId}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to record the review"));
  return (await res.json()) as KillSwitchReview;
}

export async function getStrategyControls(): Promise<StrategyControlListResponse> {
  const res = await apiFetch("/governance/strategy-controls");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load strategies"));
  return (await res.json()) as StrategyControlListResponse;
}

export async function listComplianceExports(): Promise<ComplianceExportJobListResponse> {
  const res = await apiFetch("/governance/export?limit=5");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load recent exports"));
  return (await res.json()) as ComplianceExportJobListResponse;
}
