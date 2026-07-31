"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Mail, UserPlus, X } from "lucide-react";

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
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  ROLE_LABELS,
  type Invitation,
  type InvitationStatus,
  type OrgRole,
} from "@/lib/invitations";

const ROLES = Object.keys(ROLE_LABELS) as OrgRole[];

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

export function TeamTab() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("researcher");
  const [busy, setBusy] = useState(false);
  // Present only when the backend has no SMTP configured — it hands back the link
  // so an admin can still complete the flow locally.
  const [devLink, setDevLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInvitations(await listInvitations());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invitations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDevLink(null);
    setNotice(null);
    try {
      const created = await createInvitation(email, role);
      setNotice(`Invitation sent to ${created.email}.`);
      if (created.dev_invite_link) setDevLink(created.dev_invite_link);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the invitation");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    setError(null);
    try {
      await revokeInvitation(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke the invitation");
    }
  }

  return (
    <div className="flex flex-col gap-6">
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
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || !email}>
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
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                  {devLink}
                </code>
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
          {error && (
            <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

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
            <p className="text-sm text-muted-foreground">
              No invitations yet. Invite your first colleague above.
            </p>
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
                      <td className="py-2.5 pr-4">{ROLE_LABELS[invite.role]}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {formatDate(invite.expires_at)}
                      </td>
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
        </CardContent>
      </Card>
    </div>
  );
}
