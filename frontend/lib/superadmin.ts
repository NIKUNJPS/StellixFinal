/**
 * SuperAdmin control-plane API client (Batch 24) — every call targets /superadmin/*,
 * which the backend gates with require_super_admin. A non-superadmin JWT gets a 403
 * here; the /superadmin layout redirects those users away before they ever call this.
 */

import { apiFetch, errorMessage } from "@/lib/api-client";
import type { OrganizationTier } from "@/lib/auth-types";
import type {
  ApproveDemoResponse,
  DemoRequestInbox,
  ImpersonateResponse,
  OrgDetail,
  OrgListResponse,
  PlatformStats,
  RevenueBreakdown,
  UsageResponse,
  UserListResponse,
} from "@/lib/superadmin-types";

async function getJson<T>(path: string, fallback: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

// --- Platform analytics ----------------------------------------------------- //
export function getPlatformStats(): Promise<PlatformStats> {
  return getJson<PlatformStats>("/superadmin/stats", "Failed to load platform stats");
}

export function getRevenueBreakdown(): Promise<RevenueBreakdown> {
  return getJson<RevenueBreakdown>("/superadmin/revenue", "Failed to load revenue");
}

export function getUsageByOrg(): Promise<UsageResponse> {
  return getJson<UsageResponse>("/superadmin/usage", "Failed to load usage");
}

// --- Organizations ---------------------------------------------------------- //
export function listOrgs(params?: {
  status?: string;
  plan?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<OrgListResponse> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.plan) q.set("plan", params.plan);
  if (params?.search) q.set("search", params.search);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return getJson<OrgListResponse>(`/superadmin/orgs${qs ? `?${qs}` : ""}`, "Failed to load organizations");
}

export function getOrgDetail(orgId: string): Promise<OrgDetail> {
  return getJson<OrgDetail>(`/superadmin/orgs/${orgId}`, "Failed to load organization");
}

export function approveOrg(orgId: string, body: { plan?: OrganizationTier; max_strategies?: number }) {
  return postJson<{ id: string; status: string; plan: string }>(
    `/superadmin/orgs/${orgId}/approve`,
    body,
    "Failed to approve organization",
  );
}

export function suspendOrg(orgId: string, reason: string) {
  return postJson<{ id: string; status: string }>(
    `/superadmin/orgs/${orgId}/suspend`,
    { reason },
    "Failed to suspend organization",
  );
}

export function reactivateOrg(orgId: string) {
  return postJson<{ id: string; status: string }>(
    `/superadmin/orgs/${orgId}/reactivate`,
    undefined,
    "Failed to reactivate organization",
  );
}

export function terminateOrg(orgId: string, reason: string) {
  return postJson<{ id: string; status: string }>(
    `/superadmin/orgs/${orgId}/terminate`,
    { reason },
    "Failed to terminate organization",
  );
}

export function updateOrgLimits(
  orgId: string,
  body: { max_strategies?: number; monthly_revenue_usd?: number },
) {
  return postJson<{ id: string; max_strategies: number | null; monthly_revenue_usd: number }>(
    `/superadmin/orgs/${orgId}/limits`,
    body,
    "Failed to update limits",
  );
}

export function addInternalNote(orgId: string, note: string) {
  return postJson<{ id: string; internal_notes: string | null }>(
    `/superadmin/orgs/${orgId}/notes`,
    { note },
    "Failed to add note",
  );
}

// --- Users ------------------------------------------------------------------ //
export function listUsers(params?: { search?: string; limit?: number; offset?: number }): Promise<UserListResponse> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return getJson<UserListResponse>(`/superadmin/users${qs ? `?${qs}` : ""}`, "Failed to load users");
}

export function impersonateUser(targetUserId: string, reason: string): Promise<ImpersonateResponse> {
  return postJson<ImpersonateResponse>(
    "/superadmin/impersonate",
    { target_user_id: targetUserId, reason },
    "Failed to start impersonation",
  );
}

export function suspendUser(userId: string, reason: string) {
  return postJson<{ id: string; is_active: boolean }>(
    `/superadmin/users/${userId}/suspend`,
    { reason },
    "Failed to suspend user",
  );
}

export function forcePasswordReset(userId: string) {
  return postJson<{ ok: boolean }>(
    `/superadmin/users/${userId}/force-password-reset`,
    undefined,
    "Failed to force password reset",
  );
}

// --- Demo requests ---------------------------------------------------------- //
export function listDemoRequests(): Promise<DemoRequestInbox> {
  return getJson<DemoRequestInbox>("/superadmin/demo-requests", "Failed to load demo requests");
}

export function approveDemoRequest(
  requestId: string,
  body: { plan: OrganizationTier; temp_password?: string },
): Promise<ApproveDemoResponse> {
  return postJson<ApproveDemoResponse>(
    `/superadmin/demo-requests/${requestId}/approve`,
    body,
    "Failed to approve demo request",
  );
}

export function rejectDemoRequest(requestId: string, reason: string) {
  return postJson<{ id: string; status: string }>(
    `/superadmin/demo-requests/${requestId}/reject`,
    { reason },
    "Failed to reject demo request",
  );
}
