"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, User as UserIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { API_BASE_URL } from "@/lib/api";
import { logout } from "@/lib/auth";
import { useAuthStore } from "@/store/auth-store";

function initials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const router = useRouter();
  const { user } = useAuthStore();

  if (!user) return null;

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-[#0F1117] p-0.5 shadow-md backdrop-blur-md transition-all duration-200 hover:border-white/[0.25] hover:shadow-lg hover:shadow-[#6F6B9B]/20 active:scale-95"
          data-testid="user-menu-trigger"
          aria-label="User menu"
        >
          <Avatar className="h-full w-full rounded-full">
            {user.avatar_url && (
              <AvatarImage src={`${API_BASE_URL}${user.avatar_url}`} alt={user.email} />
            )}
            <AvatarFallback className="bg-[#14161B] text-xs font-semibold text-[#F5F5F7]">
              {initials(user.full_name, user.email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-60 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0D0F14]/90 p-1.5 text-[#F5F5F7] shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-all duration-200"
        style={{
          boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.85), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Header Section */}
        <DropdownMenuLabel className="mb-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 font-normal">
          <p className="truncate text-sm font-semibold tracking-tight text-[#F5F5F7]">
            {user.full_name ?? user.email.split("@")[0]}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-[#9A9DA8]">
            {user.email}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="-mx-1.5 my-1 bg-white/[0.08]" />

        {/* Menu Items */}
        <DropdownMenuItem asChild>
          <Link
            href="/settings"
            className="flex cursor-pointer items-center rounded-xl px-3 py-2 text-xs font-medium text-[#9A9DA8] transition-colors duration-150 focus:bg-white/[0.08] focus:text-[#F5F5F7] hover:bg-white/[0.08] hover:text-[#F5F5F7]"
          >
            <UserIcon className="mr-2.5 h-4 w-4 text-[#808495]" /> Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/settings"
            className="flex cursor-pointer items-center rounded-xl px-3 py-2 text-xs font-medium text-[#9A9DA8] transition-colors duration-150 focus:bg-white/[0.08] focus:text-[#F5F5F7] hover:bg-white/[0.08] hover:text-[#F5F5F7]"
          >
            <Settings className="mr-2.5 h-4 w-4 text-[#808495]" /> Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="-mx-1.5 my-1 bg-white/[0.08]" />

        {/* Sign out */}
        <DropdownMenuItem
          onSelect={onLogout}
          className="flex cursor-pointer items-center rounded-xl px-3 py-2 text-xs font-medium text-[#F87171] transition-colors duration-150 focus:bg-[#F87171]/[0.12] focus:text-[#F87171] hover:bg-[#F87171]/[0.12] hover:text-[#F87171]"
        >
          <LogOut className="mr-2.5 h-4 w-4 text-[#F87171]" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
