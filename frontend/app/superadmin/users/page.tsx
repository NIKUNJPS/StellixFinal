"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Search, UserCog, Users, ShieldAlert, MoreHorizontal, ShieldCheck } from "lucide-react";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers({ search: search || undefined, limit: 100 });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  async function doImpersonate(user: PlatformUser, reason: string) {
    const res = await impersonateUser(user.id, reason);
    useAuthStore.getState().setAccessToken(res.access_token);
    toast.success(`Impersonating ${user.email} — read-only, 15 min. Sign in again to return.`);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-[#E4EEF0]/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Users
          </h1>
          <p className="mt-1 text-sm text-[#E4EEF0]/70">
            Cross-tenant identity management, RBAC assignments, and operator access controls.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div className="flex items-center gap-2 rounded-lg border border-[#E4EEF0]/10 bg-[#042F34]/50 px-3 py-1.5 font-mono text-xs text-[#E4EEF0]/80">
            <Users className="h-3.5 w-3.5 text-[#F4D47C]" />
            <span>Total Accounts: {data?.total ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <Input
            placeholder="Search by email address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 border-[#E4EEF0]/10 bg-[#042F34]/60 font-mono text-xs text-white placeholder:text-[#E4EEF0]/40 focus:border-[#FF5B04]/50 focus:ring-1 focus:ring-[#FF5B04]/50"
          />
          <Button
            type="submit"
            size="icon"
            className="border border-[#E4EEF0]/10 bg-[#16232B] text-[#FF5B04] hover:border-[#FF5B04]/40 hover:bg-[#FF5B04]/10"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 px-4 py-3 text-sm text-[#FF5B04]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Card */}
      <Card className="overflow-hidden border border-[#E4EEF0]/10 bg-[#042F34]/40 shadow-xl shadow-black/20 backdrop-blur-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-[#E4EEF0]/10 bg-[#16232B]/70">
              <TableRow className="border-b border-[#E4EEF0]/10 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  User Account
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Organization
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Role
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Last Login
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#E4EEF0]/60">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((u) => (
                <TableRow
                  key={u.id}
                  className="group border-b border-[#E4EEF0]/5 transition-colors hover:bg-[#16232B]/50"
                >
                  <TableCell className="py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-white">{u.email}</span>
                      {u.is_super_admin && (
                        <Badge className="border-[#FF5B04]/40 bg-[#FF5B04]/15 px-1.5 py-0 font-mono text-[9px] text-[#FF5B04] uppercase">
                          Root
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#E4EEF0]/80">
                    {u.company}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs capitalize text-[#F4D47C]">
                    {u.role.replace("_", " ")}
                  </TableCell>
                  <TableCell className="py-3.5">
                    {u.is_active ? (
                      <Badge className="border-[#F4D47C]/30 bg-[#F4D47C]/10 font-mono text-[10px] text-[#F4D47C] uppercase">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="border-[#FF5B04]/30 bg-[#FF5B04]/10 font-mono text-[10px] text-[#FF5B04] uppercase">
                        Suspended
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#E4EEF0]/60">
                    {shortDate(u.last_login_at)}
                  </TableCell>
                  <TableCell className="py-3.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.is_super_admin}
                          className="h-7 w-7 p-0 text-[#E4EEF0]/70 hover:bg-[#16232B] hover:text-[#F4D47C] disabled:opacity-30"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border border-[#E4EEF0]/10 bg-[#042F34] text-white shadow-2xl backdrop-blur-xl"
                      >
                        <DropdownMenuItem
                          onClick={() => setImpersonating(u)}
                          className="font-mono text-xs hover:bg-[#16232B] focus:bg-[#16232B] focus:text-[#F4D47C]"
                        >
                          <UserCog className="mr-2 h-3.5 w-3.5 text-[#F4D47C]" /> Impersonate (Read-Only)
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
                          className="font-mono text-xs hover:bg-[#16232B] focus:bg-[#16232B] focus:text-white"
                        >
                          <KeyRound className="mr-2 h-3.5 w-3.5 text-[#E4EEF0]/60" /> Force Password Reset
                        </DropdownMenuItem>
                        {u.is_active && (
                          <DropdownMenuItem
                            onClick={() => setSuspending(u)}
                            className="font-mono text-xs text-[#FF5B04] hover:bg-[#FF5B04]/10 focus:bg-[#FF5B04]/10 focus:text-[#FF5B04]"
                          >
                            <ShieldAlert className="mr-2 h-3.5 w-3.5 text-[#FF5B04]" /> Suspend User
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}

              {data && data.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center font-mono text-xs text-[#E4EEF0]/50">
                    No user accounts match the search criteria.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-[#E4EEF0]/70">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
                      <span className="font-mono">Loading user directory...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Meta Footer */}
      {data && !loading && (
        <p className="font-mono text-xs text-[#E4EEF0]/50">
          Showing {data.items.length} of {data.total} platform users.
        </p>
      )}

      {/* Impersonation Dialog */}
      <ConfirmActionDialog
        open={!!impersonating}
        onOpenChange={(v) => !v && setImpersonating(null)}
        title={impersonating ? `Impersonate ${impersonating.email}?` : ""}
        description="Opens the client application as this user in a READ-ONLY session (15 min). All write mutations are blocked and this action is recorded in SOC 2 audit trails."
        confirmLabel="Start Read-Only Session"
        requireReason
        reasonLabel="Reason for Audit Logging"
        onConfirm={async (reason) => {
          if (impersonating) await doImpersonate(impersonating, reason);
        }}
      />

      {/* Suspension Dialog */}
      <ConfirmActionDialog
        open={!!suspending}
        onOpenChange={(v) => !v && setSuspending(null)}
        title={suspending ? `Suspend ${suspending.email}?` : ""}
        description="Immediately deactivates the user and revokes all active auth sessions and tokens across the platform."
        confirmLabel="Suspend User"
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