"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Search, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmActionDialog, shortDate } from "@/components/superadmin/shared";
import {
  forcePasswordReset,
  impersonateUser,
  listUsers,
  suspendUser,
} from "@/lib/superadmin";
import type { PlatformUser, UserListResponse } from "@/lib/superadmin-types";
import { useAuthStore } from "@/store/auth-store";

export default function UsersPage() {
  const router = useRouter();
  const [data, setData] = useState<UserListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<PlatformUser | null>(null);
  const [suspending, setSuspending] = useState<PlatformUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await listUsers({ search: search || undefined, limit: 100 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  async function doImpersonate(user: PlatformUser, reason: string) {
    const res = await impersonateUser(user.id, reason);
    // Switch the in-memory session to the read-only impersonation token and drop
    // into the client app AS the target user. The founder signs back in afterward.
    useAuthStore.getState().setAccessToken(res.access_token);
    toast.success(`Impersonating ${user.email} — read-only, 15 min. Sign in again to return.`);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Every user across every tenant.</p>
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Input placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.email}
                    {u.is_super_admin && <Badge variant="destructive" className="ml-2">superadmin</Badge>}
                  </TableCell>
                  <TableCell>{u.company}</TableCell>
                  <TableCell className="capitalize">{u.role.replace("_", " ")}</TableCell>
                  <TableCell>
                    {u.is_active ? <Badge variant="success">active</Badge> : <Badge variant="secondary">suspended</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{shortDate(u.last_login_at)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={u.is_super_admin}>Manage</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setImpersonating(u)}>
                          <UserCog className="mr-2 h-4 w-4" /> Impersonate (read-only)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await forcePasswordReset(u.id);
                              toast.success("Sessions revoked; user must re-authenticate");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed");
                            }
                          }}
                        >
                          <KeyRound className="mr-2 h-4 w-4" /> Force password reset
                        </DropdownMenuItem>
                        {u.is_active && (
                          <DropdownMenuItem className="text-destructive" onClick={() => setSuspending(u)}>
                            Suspend user
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <p className="text-xs text-muted-foreground">Showing {data.items.length} of {data.total}.</p>}

      <ConfirmActionDialog
        open={!!impersonating}
        onOpenChange={(v) => !v && setImpersonating(null)}
        title={impersonating ? `Impersonate ${impersonating.email}?` : ""}
        description="Opens the client app as this user in a READ-ONLY session (15 min). Writes are blocked and the action is logged. You'll sign in again to return to the console."
        confirmLabel="Start read-only session"
        requireReason
        reasonLabel="Reason (logged for SOC 2)"
        onConfirm={async (reason) => {
          if (impersonating) await doImpersonate(impersonating, reason);
        }}
      />

      <ConfirmActionDialog
        open={!!suspending}
        onOpenChange={(v) => !v && setSuspending(null)}
        title={suspending ? `Suspend ${suspending.email}?` : ""}
        description="Deactivates the user and revokes their sessions."
        confirmLabel="Suspend user"
        destructive
        requireReason
        onConfirm={async (reason) => {
          if (!suspending) return;
          await suspendUser(suspending.id, reason);
          toast.success("User suspended");
          setSuspending(null);
          await load();
        }}
      />
    </div>
  );
}
