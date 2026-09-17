"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Mail, Pencil, Plus, Trash2, UserCog, UserPlus, X } from "lucide-react";

import { PermissionMatrix } from "@/components/rbac/permission-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCan } from "@/hooks/use-permissions";
import { loadMe } from "@/lib/auth";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  ROLE_LABELS,
  type Invitation,
  type InvitationStatus,
} from "@/lib/invitations";
import { formatRole, listOrganizationMembers, type OrganizationMember } from "@/lib/members";
import {
  assignMemberRole,
  createOrgRole,
  deleteOrgRole,
  listOrgRoles,
  listPermissionCatalog,
  PERM,
  updateOrgRole,
  type Permission,
  type Role,
} from "@/lib/rbac";
import { useAuthStore } from "@/store/auth-store";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function statusVariant(status: InvitationStatus): "default" | "secondary" | "outline" {
  if (status === "accepted") return "default";
  if (status === "pending") return "secondary";
  return "outline";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function RoleOptions({ roles }: { roles: Role[] }) {
  const system = roles.filter((r) => r.scope === "system");
  const custom = roles.filter((r) => r.scope === "organization");
  return (
    <>
      <optgroup label="System roles">
        {system.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </optgroup>
      {custom.length > 0 && (
        <optgroup label="Custom roles">
          {custom.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

/* ---------------------------------------------------------------- invitations */

function InviteCard({ roles, onInvited }: { roles: Role[]; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  // Present only when the backend has no SMTP configured — it hands back the link
  // so an admin can still complete the flow locally.
  const [devLink, setDevLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Defaults to the least-privileged system role, same as the backend.
  const selectedRoleId = roleId || (roles.find((r) => r.system_key === "researcher")?.id ?? "");

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoleId) return;
    setBusy(true);
    setError(null);
    setDevLink(null);
    setNotice(null);
    try {
      const created = await createInvitation(email, selectedRoleId);
      setNotice(`Invitation sent to ${created.email}.`);
      if (created.dev_invite_link) setDevLink(created.dev_invite_link);
      setEmail("");
      onInvited();
    } catch (err) {
      setError(errorText(err, "Failed to send the invitation"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Invite a colleague
        </CardTitle>
        <CardDescription>
          They&apos;ll receive a link to set their own password. The role you pick here
          is applied the moment they join.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end" noValidate>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={selectedRoleId}
              onChange={(e) => setRoleId(e.target.value)}
              className={selectClass}
              data-testid="invite-role"
            >
              <RoleOptions roles={roles} />
            </select>
          </div>
          <Button type="submit" disabled={busy || !email || !selectedRoleId}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </form>

        {notice && <p className="mt-3 text-sm text-emerald-500">{notice}</p>}
        {devLink && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              No mail server configured — share this link manually:
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{devLink}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(devLink)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <ErrorLine message={error} />
      </CardContent>
    </Card>
  );
}

function InvitationsCard({ roles, reloadKey }: { roles: Role[]; reloadKey: number }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roleNames = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  const refresh = useCallback(async () => {
    try {
      setInvitations(await listInvitations());
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load invitations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, reloadKey]);

  async function onRevoke(id: string) {
    setError(null);
    try {
      await revokeInvitation(id);
      await refresh();
    } catch (err) {
      setError(errorText(err, "Failed to revoke the invitation"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Invitations
        </CardTitle>
        <CardDescription>Everyone invited to this organization.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invitations yet. Invite your first colleague above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Expires</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {invitations.map((invite) => (
                  <tr key={invite.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">{invite.email}</td>
                    <td className="py-2.5 pr-4">
                      {(invite.role_id ? roleNames.get(invite.role_id) : undefined) ?? ROLE_LABELS[invite.role]}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(invite.expires_at)}</td>
                    <td className="py-2.5 text-right">
                      {invite.status === "pending" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void onRevoke(invite.id)}
                          aria-label={`Revoke invitation for ${invite.email}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorLine message={error} />
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- role assignment */

function MemberRolesCard({ roles, onChanged }: { roles: Role[]; onChanged: () => void }) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers((await listOrganizationMembers()).items);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load members"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAssign(member: OrganizationMember, roleId: string) {
    if (!roleId || roleId === member.effective_role?.id) return;
    setSavingId(member.id);
    setError(null);
    try {
      const updated = await assignMemberRole(member.id, roleId);
      setMembers((list) =>
        list.map((m) => (m.id === member.id ? { ...m, effective_role: updated.effective_role } : m)),
      );
      onChanged();
      // Changing your own role changes what you can do right now: refresh /me so the
      // UI follows the server, which already enforces the new permissions.
      if (member.id === currentUserId) await loadMe();
    } catch (err) {
      setError(errorText(err, "Failed to change role"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-4 w-4" />
          Member roles
        </CardTitle>
        <CardDescription>
          Changes apply to the member&apos;s next request — nobody has to sign out and back in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="member-roles-table">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Member</th>
                  <th className="pb-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium">{member.full_name ?? member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </td>
                    <td className="py-2.5">
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.effective_role?.id ?? ""}
                        disabled={savingId === member.id}
                        onChange={(e) => void onAssign(member, e.target.value)}
                        className={selectClass}
                        data-testid={`member-role-${member.email}`}
                      >
                        {!member.effective_role && <option value="">{formatRole(member.role)}</option>}
                        <RoleOptions roles={roles} />
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorLine message={error} />
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- roles */

interface RoleDraft {
  id: string | null;
  name: string;
  description: string;
  permissions: Set<string>;
}

function RolesCard({ roles, onChanged }: { roles: Role[]; onChanged: () => void }) {
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPermissionCatalog()
      .then(setCatalog)
      .catch((err) => setError(errorText(err, "Failed to load permissions")));
  }, []);

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      permissions: [...draft.permissions],
    };
    try {
      if (draft.id) await updateOrgRole(draft.id, input);
      else await createOrgRole(input);
      setDraft(null);
      onChanged();
      // The editor may hold the role being edited; keep the UI in step with the server.
      await loadMe();
    } catch (err) {
      setError(errorText(err, "Failed to save role"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(role: Role) {
    if (!window.confirm(`Delete the custom role "${role.name}"?`)) return;
    setError(null);
    try {
      await deleteOrgRole(role.id);
      onChanged();
    } catch (err) {
      setError(errorText(err, "Failed to delete role"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Roles
        </CardTitle>
        <CardDescription>
          System roles are defined by the platform. Custom roles are visible only inside this organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="org-roles-table">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Permissions</th>
                <th className="pb-2 font-medium">Members</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">{role.name}</span>{" "}
                    <Badge variant={role.scope === "system" ? "secondary" : "outline"}>
                      {role.scope === "system" ? "System Role" : "Custom"}
                    </Badge>
                    {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{role.permissions.length}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{role.member_count}</td>
                  <td className="py-2.5 text-right">
                    {role.scope === "organization" && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${role.name}`}
                          onClick={() =>
                            setDraft({
                              id: role.id,
                              name: role.name,
                              description: role.description,
                              permissions: new Set(role.permissions),
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${role.name}`}
                          onClick={() => void onDelete(role)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {draft ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4" data-testid="role-editor">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role-description">Description</Label>
                <Input
                  id="role-description"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
            </div>
            <PermissionMatrix
              catalog={catalog}
              selected={draft.permissions}
              onChange={(permissions) => setDraft({ ...draft, permissions })}
              testId="org-role-permissions"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void onSave()} disabled={busy || !draft.name.trim()}>
                {busy ? "Saving…" : draft.id ? "Save role" : "Create role"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setDraft({ id: null, name: "", description: "", permissions: new Set() })}
            data-testid="new-custom-role"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New custom role
          </Button>
        )}
        <ErrorLine message={error} />
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- tab */

export function TeamTab() {
  const canInvite = useCan(PERM.MEMBERS_INVITE);
  const canManageRoles = useCan(PERM.ROLES_MANAGE);
  const canViewMembers = useCan(PERM.MEMBERS_VIEW);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadRoles = useCallback(async () => {
    try {
      setRoles(await listOrgRoles());
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load roles"));
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const refreshAll = useCallback(() => {
    setReloadKey((k) => k + 1);
    void loadRoles();
  }, [loadRoles]);

  return (
    <div className="flex flex-col gap-6">
      <ErrorLine message={error} />
      {canInvite && <InviteCard roles={roles} onInvited={refreshAll} />}
      {canManageRoles && canViewMembers && <MemberRolesCard roles={roles} onChanged={loadRoles} />}
      {canManageRoles && <RolesCard roles={roles} onChanged={refreshAll} />}
      {canInvite && <InvitationsCard roles={roles} reloadKey={reloadKey} />}
    </div>
  );
}
