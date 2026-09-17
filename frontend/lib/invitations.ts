import { apiFetch, errorMessage } from "@/lib/api-client";

export type InvitationStatus = "pending" | "accepted" | "revoked";

export type OrgRole =
  | "researcher"
  | "risk_manager"
  | "cio"
  | "compliance_officer"
  | "admin";

export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  /** Batch 26: the role granted on acceptance (system or custom). */
  role_id: string | null;
  status: InvitationStatus;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  /** Only returned when no SMTP server is configured (dev) — see app/services/email.py. */
  dev_invite_link?: string | null;
}

/** Human labels for the 5 RBAC roles (PROJECT_CONSTITUTION §2 → Auth). */
export const ROLE_LABELS: Record<OrgRole, string> = {
  researcher: "Researcher",
  risk_manager: "Risk Manager",
  cio: "CIO",
  compliance_officer: "Compliance Officer",
  admin: "Admin",
};

export async function listInvitations(): Promise<Invitation[]> {
  const res = await apiFetch("/users/invitations");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load invitations"));
  const data = (await res.json()) as { items: Invitation[] };
  return data.items;
}

export async function createInvitation(email: string, roleId: string): Promise<Invitation> {
  const res = await apiFetch("/users/invitations", {
    method: "POST",
    body: JSON.stringify({ email, role_id: roleId }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to send the invitation"));
  return (await res.json()) as Invitation;
}

export async function revokeInvitation(id: string): Promise<Invitation> {
  const res = await apiFetch(`/users/invitations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to revoke the invitation"));
  return (await res.json()) as Invitation;
}
