import { apiFetch, errorMessage } from "@/lib/api-client";
import type { EffectiveRole, UserRole } from "@/lib/auth-types";

/**
 * Batch 26 dynamic RBAC. Permission keys mirror backend app/rbac/catalog.py (class P).
 * UI gating uses these; the backend enforces every one of them independently.
 */
export const PERM = {
  ORGANIZATION_MANAGE: "organization.manage",
  BILLING_MANAGE: "billing.manage",
  MEMBERS_VIEW: "members.view",
  MEMBERS_INVITE: "members.invite",
  ROLES_MANAGE: "roles.manage",
  SYSTEM_MONITOR: "system.monitor",
  DIGEST_SEND: "digest.send",
  GOVERNANCE_VIEW: "governance.view",
  STRATEGY_APPROVE: "strategy.approve",
  STRATEGY_RETIRE: "strategy.retire",
  STRATEGY_FAIL_MANUAL: "strategy.fail_manual",
  KILLSWITCH_TRIGGER: "killswitch.trigger",
  KILLSWITCH_REVIEW: "killswitch.review",
  KILLSWITCH_HISTORY_ALL: "killswitch.history.view_all",
  AUDIT_VIEW_ALL: "audit.view.all",
  AUDIT_VIEW_ORG_RISK: "audit.view.org_risk",
  AUDIT_VIEW_OWN_RISK: "audit.view.own_risk",
  COMPLIANCE_EXPORT: "compliance.export",
  LLM_AUDIT_VIEW: "llm_audit.view",
  STRATEGY_VERSION: "strategy.version",
  STRATEGY_DELETE_ANY_DRAFT: "strategy.delete_any_draft",
} as const;

export const AUDIT_VIEW_PERMS = [PERM.AUDIT_VIEW_ALL, PERM.AUDIT_VIEW_ORG_RISK, PERM.AUDIT_VIEW_OWN_RISK];

export interface Permission {
  id: string;
  key: string;
  category: string;
  description: string;
}

export interface Role {
  id: string;
  organization_id: string | null;
  name: string;
  description: string;
  is_system_default: boolean;
  system_key: UserRole | null;
  scope: "system" | "organization";
  permissions: string[];
  member_count: number;
  created_at: string;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: string[];
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

// --- organization (org admins) ---------------------------------------------------
export async function listOrgRoles(): Promise<Role[]> {
  return (await json<{ items: Role[] }>(await apiFetch("/roles"), "Failed to load roles")).items;
}

export async function listPermissionCatalog(): Promise<Permission[]> {
  return (await json<{ items: Permission[] }>(await apiFetch("/roles/permissions"), "Failed to load permissions")).items;
}

export async function createOrgRole(input: RoleInput): Promise<Role> {
  return json(await apiFetch("/roles", { method: "POST", body: JSON.stringify(input) }), "Failed to create role");
}

export async function updateOrgRole(id: string, input: Partial<RoleInput>): Promise<Role> {
  return json(await apiFetch(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(input) }), "Failed to update role");
}

export async function deleteOrgRole(id: string): Promise<void> {
  const res = await apiFetch(`/roles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to delete role"));
}

export interface MemberWithRole {
  id: string;
  email: string;
  full_name: string | null;
  effective_role: EffectiveRole | null;
}

export async function assignMemberRole(userId: string, roleId: string): Promise<MemberWithRole> {
  return json(
    await apiFetch(`/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ role_id: roleId }) }),
    "Failed to change role",
  );
}

// --- platform (superadmin) ---------------------------------------------------------
export interface SystemRoleListing {
  items: Role[];
  custom_roles_by_organization: { organization_id: string; organization_name: string; custom_role_count: number }[];
}

export async function saListRoles(): Promise<SystemRoleListing> {
  return json(await apiFetch("/superadmin/roles"), "Failed to load roles");
}

export async function saListPermissions(): Promise<Permission[]> {
  return (await json<{ items: Permission[] }>(await apiFetch("/superadmin/permissions"), "Failed to load permissions")).items;
}

export async function saCreateRole(input: RoleInput): Promise<Role> {
  return json(await apiFetch("/superadmin/roles", { method: "POST", body: JSON.stringify(input) }), "Failed to create role");
}

export async function saUpdateRole(id: string, input: { name?: string; description?: string }): Promise<Role> {
  return json(await apiFetch(`/superadmin/roles/${id}`, { method: "PATCH", body: JSON.stringify(input) }), "Failed to update role");
}

export async function saSetRolePermissions(id: string, permissions: string[]): Promise<Role> {
  return json(
    await apiFetch(`/superadmin/roles/${id}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) }),
    "Failed to save permissions",
  );
}

export async function saDeleteRole(id: string): Promise<void> {
  const res = await apiFetch(`/superadmin/roles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to delete role"));
}

export async function saCreatePermission(input: { key: string; category: string; description: string }): Promise<Permission> {
  return json(await apiFetch("/superadmin/permissions", { method: "POST", body: JSON.stringify(input) }), "Failed to create permission");
}

export function groupByCategory(perms: Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>();
  for (const p of perms) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return Array.from(groups.entries());
}
