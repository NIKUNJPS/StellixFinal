"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Search, UserCog, Users, ShieldAlert, MoreHorizontal } from "lucide-react";
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
    <div className="relative mx-auto max-w-6xl space-y-6 text-[#F5F5F7]">
      {/* Ambient Background Glow Orbs */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8E88C7] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8E88C7]" />
            </span>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              Quantix Intelligence • Control Plane
            </p>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#F5F5F7] sm:text-3xl">
            Users
          </h1>
          <p className="mt-1 text-xs text-[#9A9DA8]">
            Cross-tenant identity management, RBAC assignments, and operator access controls.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <div
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <Users className="h-3.5 w-3.5 text-[#8E88C7]" />
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
          <div className="relative">
            <Input
              placeholder="Search by email address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 rounded-xl border-white/[0.08] bg-[#0D0F14]/70 font-mono text-xs text-[#F5F5F7] placeholder:text-[#666A76] backdrop-blur-md transition-colors focus:border-[#8E88C7]/50 focus:ring-1 focus:ring-[#8E88C7]/50"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="rounded-xl border border-white/[0.08] bg-[#0D0F14]/80 text-[#8E88C7] transition-all hover:border-white/[0.18] hover:bg-[#1A1D24] hover:text-[#F5F5F7] active:scale-95"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {error && (
        <div
          className="flex items-center gap-2.5 rounded-2xl border p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.08)",
            borderColor: "rgba(248, 113, 113, 0.25)",
          }}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Card */}
      <Card
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <CardContent className="p-0">
          <Table>
            <TableHeader className="border-b border-white/[0.06] bg-[#0F1115]/80">
              <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  User Account
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Organization
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Role
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Last Login
                </TableHead>
                <TableHead className="text-right font-mono text-xs uppercase tracking-wider text-[#808495]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((u) => (
                <TableRow
                  key={u.id}
                  className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <TableCell className="py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-[#F5F5F7]">{u.email}</span>
                      {u.is_super_admin && (
                        <Badge className="border border-[#8E88C7]/40 bg-[#8E88C7]/15 px-1.5 py-0 font-mono text-[9px] text-[#8E88C7] uppercase">
                          Root
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#9A9DA8]">
                    {u.company}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs capitalize text-[#8E88C7]">
                    {u.role.replace("_", " ")}
                  </TableCell>
                  <TableCell className="py-3.5">
                    {u.is_active ? (
                      <Badge className="border border-[#34D399]/30 bg-[#34D399]/10 font-mono text-[10px] text-[#34D399] uppercase">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="border border-[#F87171]/30 bg-[#F87171]/10 font-mono text-[10px] text-[#F87171] uppercase">
                        Suspended
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-xs text-[#808495]">
                    {shortDate(u.last_login_at)}
                  </TableCell>
                  <TableCell className="py-3.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.is_super_admin}
                          className="h-7 w-7 rounded-lg p-0 text-[#9A9DA8] hover:bg-white/[0.06] hover:text-[#F5F5F7] disabled:opacity-30"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="rounded-xl border border-white/[0.08] bg-[#0D0F14]/95 p-1 text-[#F5F5F7] shadow-2xl backdrop-blur-2xl"
                        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
                      >
                        <DropdownMenuItem
                          onClick={() => setImpersonating(u)}
                          className="rounded-lg font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.05] hover:text-[#F5F5F7] focus:bg-white/[0.06] focus:text-[#8E88C7]"
                        >
                          <UserCog className="mr-2 h-3.5 w-3.5 text-[#8E88C7]" /> Impersonate (Read-Only)
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
                          className="rounded-lg font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.05] hover:text-[#F5F5F7] focus:bg-white/[0.06] focus:text-[#F5F5F7]"
                        >
                          <KeyRound className="mr-2 h-3.5 w-3.5 text-[#666A76]" /> Force Password Reset
                        </DropdownMenuItem>
                        {u.is_active && (
                          <DropdownMenuItem
                            onClick={() => setSuspending(u)}
                            className="rounded-lg font-mono text-xs text-[#F87171] hover:bg-[#F87171]/10 focus:bg-[#F87171]/15 focus:text-[#F87171]"
                          >
                            <ShieldAlert className="mr-2 h-3.5 w-3.5 text-[#F87171]" /> Suspend User
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}

              {data && data.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center font-mono text-xs text-[#808495]">
                    No user accounts match the search criteria.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-xs text-[#9A9DA8]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
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
        <p className="font-mono text-xs text-[#808495]">
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