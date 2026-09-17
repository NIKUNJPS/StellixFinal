"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeySquare, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PermissionMatrix } from "@/components/rbac/permission-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saCreatePermission,
  saCreateRole,
  saDeleteRole,
  saListPermissions,
  saListRoles,
  saSetRolePermissions,
  saUpdateRole,
  type Permission,
  type Role,
  type SystemRoleListing,
} from "@/lib/rbac";

const panel =
  "rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl";
const field =
  "rounded-xl border-white/[0.08] bg-[#0F1117]/80 font-mono text-xs text-[#F5F5F7] placeholder:text-[#666A76]";
const primary = "rounded-xl bg-[#5C568E] text-xs font-semibold text-white hover:brightness-110";

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((k) => a.has(k));
}

/**
 * Batch 26: platform RBAC console. SuperAdmins edit the permission catalog and the
 * system roles every organization inherits. Every change is written to the
 * SuperAdmin audit log by the backend.
 */
export default function SuperadminRolesPage() {
  const [listing, setListing] = useState<SystemRoleListing | null>(null);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const [newPerm, setNewPerm] = useState({ key: "", category: "", description: "" });

  const load = useCallback(async () => {
    try {
      const [roles, permissions] = await Promise.all([saListRoles(), saListPermissions()]);
      setListing(roles);
      setCatalog(permissions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => listing?.items.find((r) => r.id === selectedId) ?? null,
    [listing, selectedId],
  );

  function select(role: Role) {
    setSelectedId(role.id);
    setPerms(new Set(role.permissions));
    setDescription(role.description);
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!selected) return;
    await run(async () => {
      if (description !== selected.description) await saUpdateRole(selected.id, { description });
      if (!sameSet(perms, selected.permissions)) await saSetRolePermissions(selected.id, [...perms]);
    }, `Saved ${selected.name}`);
  }

  async function onDelete(role: Role) {
    if (!window.confirm(`Delete the system role "${role.name}"?`)) return;
    await run(async () => {
      await saDeleteRole(role.id);
      if (selectedId === role.id) setSelectedId(null);
    }, `Deleted ${role.name}`);
  }

  const dirty = selected ? description !== selected.description || !sameSet(perms, selected.permissions) : false;

  return (
    <div className="relative mx-auto max-w-6xl space-y-6 text-[#F5F5F7]">
      <div className="border-b border-white/[0.06] pb-5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
          Control Plane • Access
        </p>
        <h1 className="mt-1.5 flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          <KeySquare className="h-6 w-6 text-[#8E88C7]" /> Roles &amp; Permissions
        </h1>
        <p className="mt-1 text-xs text-[#9A9DA8]">
          System roles apply to every organization. Changes take effect on each user&apos;s next request.
        </p>
      </div>

      {error && (
        <div
          className="flex items-center gap-2.5 rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs font-medium text-[#F87171]"
          role="alert"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <section className={panel}>
          <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
            System roles
          </h2>
          <ul className="flex flex-col gap-1.5" data-testid="system-roles">
            {listing?.items.map((role) => (
              <li key={role.id}>
                <div
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                    role.id === selectedId
                      ? "border-[#8E88C7]/50 bg-[#8E88C7]/10"
                      : "border-white/[0.06] hover:bg-white/[0.03]"
                  }`}
                >
                  <button type="button" onClick={() => select(role)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{role.name}</span>
                    <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-[#808495]">
                      {role.is_system_default && (
                        <span className="rounded border border-[#8E88C7]/40 px-1 text-[#C9C6F0]">System Role</span>
                      )}
                      {role.permissions.length} perms · {role.member_count} users
                    </span>
                  </button>
                  {!role.is_system_default && (
                    <button
                      type="button"
                      aria-label={`Delete ${role.name}`}
                      onClick={() => void onDelete(role)}
                      className="rounded p-1 text-[#808495] hover:text-[#F87171]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <form
            className="mt-5 flex flex-col gap-2 border-t border-white/[0.06] pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await saCreateRole({ ...newRole, permissions: [] });
                setNewRole({ name: "", description: "" });
              }, "System role created");
            }}
          >
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
              New system role
            </p>
            <Input
              className={field}
              placeholder="Name"
              value={newRole.name}
              onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
            />
            <Input
              className={field}
              placeholder="Description"
              value={newRole.description}
              onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
            />
            <Button type="submit" disabled={busy || !newRole.name.trim()} className={primary}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Create role
            </Button>
          </form>

          {listing && listing.custom_roles_by_organization.length > 0 && (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
                Custom roles by organization
              </p>
              <ul className="space-y-1 font-mono text-[11px] text-[#9A9DA8]">
                {listing.custom_roles_by_organization.map((o) => (
                  <li key={o.organization_id} className="flex justify-between">
                    <span className="truncate">{o.organization_name}</span>
                    <span className="text-[#F5F5F7]">{o.custom_role_count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className={panel}>
          {selected ? (
            <div className="flex flex-col gap-4" data-testid="system-role-editor">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  {selected.system_key && (
                    <p className="font-mono text-[10px] text-[#808495]">key: {selected.system_key}</p>
                  )}
                </div>
                <Button type="button" onClick={() => void onSave()} disabled={busy || !dirty} className={primary}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </div>
              <Input
                className={field}
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <PermissionMatrix catalog={catalog} selected={perms} onChange={setPerms} testId="system-role-permissions" />
            </div>
          ) : (
            <p className="py-16 text-center text-xs text-[#808495]">Select a role to edit its permissions.</p>
          )}

          <form
            className="mt-6 grid gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-[1fr_1fr_2fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await saCreatePermission(newPerm);
                setNewPerm({ key: "", category: "", description: "" });
              }, "Permission added to the catalog");
            }}
          >
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495] sm:col-span-4">
              Add catalog permission
            </p>
            <Input
              className={field}
              placeholder="key (e.g. reports.export)"
              value={newPerm.key}
              onChange={(e) => setNewPerm({ ...newPerm, key: e.target.value })}
            />
            <Input
              className={field}
              placeholder="category"
              value={newPerm.category}
              onChange={(e) => setNewPerm({ ...newPerm, category: e.target.value })}
            />
            <Input
              className={field}
              placeholder="description"
              value={newPerm.description}
              onChange={(e) => setNewPerm({ ...newPerm, description: e.target.value })}
            />
            <Button
              type="submit"
              disabled={busy || !newPerm.key.trim() || !newPerm.category.trim()}
              className={primary}
            >
              Add
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
