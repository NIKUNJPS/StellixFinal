import { apiFetch, errorMessage } from "@/lib/api-client";
import type { EffectiveRole, UserRole } from "@/lib/auth-types";

/** Batch 25: one row of the read-only organization member directory
 * (mirrors app/schemas/user.py OrganizationMemberRead). */
export interface OrganizationMember {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  /** Batch 26: the role that grants this member's permissions (may be a custom role). */
  effective_role: EffectiveRole | null;
}

export interface OrganizationMemberList {
  total: number;
  items: OrganizationMember[];
}

export async function listOrganizationMembers(q?: string): Promise<OrganizationMemberList> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await apiFetch(`/users/members${qs}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load organization members"));
  return (await res.json()) as OrganizationMemberList;
}

export function memberLabel(member: Pick<OrganizationMember, "full_name" | "email">): string {
  return member.full_name ? `${member.full_name} (${member.email})` : member.email;
}

export function formatRole(role: string | null | undefined): string {
  if (!role) return "—";
  if (role === "cio") return "CIO";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
