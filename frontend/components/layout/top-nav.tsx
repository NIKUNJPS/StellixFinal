"use client";

import Link from "next/link";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { GlobalSearch } from "@/components/layout/global-search";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { WsStatus } from "@/components/layout/ws-status";

import { useAuthStore } from "@/store/auth-store";

const PALETTE = {
  mainBg: "#08090B",
  topNavBg: "#0B1017",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  glowLavender: "#6F6B9B",
};

export function TopNav() {
  const user = useAuthStore((s) => s.user);
  const homeHref =
    user?.role === "compliance_officer"
      ? "/compliance/governance"
      : user?.role === "researcher"
      ? "/researcher/strategies"
      : user?.role === "risk_manager"
      ? "/risk-manager/failures"
      : "/dashboard";

  return (
    <header
      className="flex h-16 shrink-0 items-center gap-4 border-b px-4 backdrop-blur-xl transition-colors duration-200 sm:px-6"
      style={{
        backgroundColor: PALETTE.topNavBg,
        borderColor: PALETTE.borderSubtle,
        boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.5)",
      }}
    >
      <MobileNav />

      {/* Brand Header */}
      <Link
        href={homeHref}
        className="group flex items-center gap-2.5 transition-all duration-150"
      >
        <span
          className="h-2 w-2 rounded-full transition-all duration-200 group-hover:scale-125"
          style={{
            backgroundColor: PALETTE.glowLavender,
            boxShadow: "0 0 10px rgba(111, 107, 155, 0.9)",
          }}
        />
        <span
          className="text-[17px] font-bold tracking-tight transition-colors duration-150 group-hover:text-white"
          style={{ color: PALETTE.textPrimary }}
        >
          Stellix Labs
        </span>
      </Link>

      {/* Breadcrumb + vertical divider */}
      <div
        className="hidden h-5 w-px md:block"
        style={{ backgroundColor: PALETTE.borderSubtle }}
      />
      <div className="hidden md:block">
        <Breadcrumb />
      </div>

      {/* Right Tooling and Controls */}
      <div className="ml-auto flex items-center gap-2.5 sm:gap-3.5">
        <WsStatus />

        <div className="hidden sm:block">
          <GlobalSearch />
        </div>

        <div
          className="hidden h-5 w-px sm:block"
          style={{ backgroundColor: PALETTE.borderSubtle }}
        />

        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}