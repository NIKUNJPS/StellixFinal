"use client";

import Link from "next/link";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { GlobalSearch } from "@/components/layout/global-search";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { WsStatus } from "@/components/layout/ws-status";

import { useAuthStore } from "@/store/auth-store";

export function TopNav() {
  const user = useAuthStore((s) => s.user);
  const homeHref = user?.role === "compliance_officer" ? "/compliance/governance" : user?.role === "researcher" ? "/researcher/strategies" : user?.role === "risk_manager" ? "/risk-manager/failures" : "/dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <MobileNav />
      <Link href={homeHref} className="flex items-center gap-2 font-semibold text-stellix-highlight">
        <span className="text-lg">Stellix Labs</span>
      </Link>
      {/* Breadcrumb + divider are secondary — hidden on mobile to avoid overflow. */}
      <div className="hidden h-6 w-px bg-border md:block" />
      <div className="hidden md:block">
        <Breadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <WsStatus />
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
