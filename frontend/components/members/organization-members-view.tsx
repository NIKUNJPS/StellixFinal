"use client";

import { Check, Copy, LockKeyhole, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCan, usePermissionsLoaded } from "@/hooks/use-permissions";
import { formatRole, listOrganizationMembers, type OrganizationMember } from "@/lib/members";
import { PERM } from "@/lib/rbac";

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const MemberRow = memo(function MemberRow({ member }: { member: OrganizationMember }) {
  const [copied, setCopied] = useState(false);
  return (
    <tr className="transition-colors hover:bg-white/[0.02]">
      <td className="px-5 py-3.5">
        <p className="text-sm font-semibold text-[#F5F5F7]">{member.full_name ?? "—"}</p>
        <p className="font-mono text-[11px] text-[#9A9DA8]">{member.email}</p>
      </td>
      <td className="px-5 py-3.5">
        <span className="rounded-md border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#C9C6F0]">
          {member.effective_role?.name ?? formatRole(member.role)}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(member.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy user ID"
          className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-[#808495] hover:text-[#F5F5F7]"
        >
          {member.id}
          {copied ? <Check className="h-3 w-3 text-[#34D399]" /> : <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100" />}
        </button>
      </td>
      <td className="px-5 py-3.5">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            member.is_active ? "text-[#34D399]" : "text-[#F87171]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${member.is_active ? "bg-[#34D399]" : "bg-[#F87171]"}`} />
          {member.is_active ? "Active" : "Deactivated"}
        </span>
        <p className="mt-0.5 font-mono text-[10px] text-[#666A76]">
          {member.email_verified ? "email verified" : "email unverified"} · MFA {member.mfa_enabled ? "on" : "off"}
        </p>
      </td>
      <td className="px-5 py-3.5 font-mono text-xs text-[#9A9DA8]">{formatDateTime(member.last_login_at)}</td>
    </tr>
  );
});

/** Batch 25: read-only organization member directory (compliance officer + admin). */
export function OrganizationMembersView() {
  const loaded = usePermissionsLoaded();
  const allowed = useCan(PERM.MEMBERS_VIEW);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMembers((await listOrganizationMembers()).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  // Filtering is local: the directory is one org's members, so no request per keystroke.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.email.toLowerCase().includes(q) ||
        (m.full_name ?? "").toLowerCase().includes(q) ||
        (m.effective_role?.name ?? m.role).toLowerCase().includes(q) ||
        m.id.startsWith(q),
    );
  }, [members, query]);

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const label = m.effective_role?.name ?? formatRole(m.role);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [members]);

  if (loaded && !allowed) {
    return (
      <div className="mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center text-center text-[#9A9DA8]">
        <LockKeyhole className="h-6 w-6 text-[#808495]" />
        <h1 className="mt-3 text-base font-bold text-[#F5F5F7]">Member directory restricted</h1>
        <p className="mt-1 text-xs">Only compliance officers and admins can view the organization member directory.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              <Users className="h-3.5 w-3.5 text-[#8E88C7]" /> Oversight
            </p>
            <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight">Organization Members</h1>
            <p className="mt-1 text-xs text-[#9A9DA8]">
              Read-only directory of everyone in your organization — match audit entries to real people.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {roleCounts.map(([r, n]) => (
              <span key={r} className="rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-3 py-1.5 font-mono text-[11px] text-[#9A9DA8]">
                {r} <span className="text-[#F5F5F7]">{n}</span>
              </span>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>
        )}

        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-[#808495]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, role or ID"
                className="h-10 w-80 rounded-xl border-white/[0.08] bg-[#0F1117]/80 pl-9 font-mono text-xs text-[#F5F5F7]"
                data-testid="member-search"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#808495]">
                {visible.length} of {members.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={load}
                className="h-9 rounded-xl border-white/[0.08] bg-transparent font-mono text-xs text-[#9A9DA8]"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left" data-testid="members-table">
              <thead>
                <tr className="border-b border-white/[0.06] font-mono text-[10px] uppercase tracking-[0.14em] text-[#808495]">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">User ID</th>
                  <th className="px-5 py-3">Account status</th>
                  <th className="px-5 py-3">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {visible.map((member) => (
                  <MemberRow key={member.id} member={member} />
                ))}
              </tbody>
            </table>
            {!loading && visible.length === 0 && (
              <p className="py-12 text-center text-xs text-[#808495]">No members match your search.</p>
            )}
          </div>
        </section>
        <p className="flex items-center gap-2 text-[11px] text-[#666A76]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#34D399]" /> Scoped to your organization by the server; other tenants are never visible.
        </p>
      </div>
    </div>
  );
}
