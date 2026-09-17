"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";
import { navLinksForAccess } from "@/components/layout/nav-config";
import { useNavAccess } from "@/hooks/use-permissions";
import { SidebarCarousel } from "@/components/layout/sidebar-carousel";

const PALETTE = {
  mainBg: "#08090B",
  sidebarBg: "rgba(10, 12, 16, 0.9)",
  cardBg: "#0F1115",
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  glowLavender: "#8E88C7",
  danger: "#E45B5B",
};

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const isSuperAdmin = user?.is_super_admin ?? false;
  const navAccess = useNavAccess();
  const navLinks = navLinksForAccess(navAccess);

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 flex-col overflow-hidden border-r backdrop-blur-2xl transition-[width] duration-300 md:flex",
        sidebarOpen ? "w-60" : "w-16",
      )}
      style={{
        backgroundColor: PALETTE.sidebarBg,
        borderColor: PALETTE.borderSubtle,
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Top-Left Atmospheric Violet Lighting Orb */}
      <div className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full bg-[#5C568E]/30 blur-[90px]" />
      <div className="pointer-events-none absolute top-1/2 -right-20 h-48 w-48 rounded-full bg-[#38BDF8]/10 blur-[100px]" />

      <nav
        className="relative z-10 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-5"
        data-testid="sidebar-nav"
      >
        {navLinks.map((link) => {
          const active =
            pathname === link.href ||
            pathname?.startsWith(`${link.href}/`);

          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              title={sidebarOpen ? undefined : link.label}
              className={cn(
                "group relative flex items-center justify-between rounded-xl px-3.5 py-2",
                "text-sm font-medium",
                "transition-all duration-200",
                !sidebarOpen && "justify-center px-0 py-2.5",
                active
                  ? "text-[#F5F5F7]"
                  : "text-[#9A9DA8] hover:text-[#F5F5F7]",
              )}
            >
              {/* Selected background pill with top-right lighting effect */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 overflow-hidden rounded-xl shadow-lg"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(24, 27, 34, 0.95) 0%, rgba(12, 14, 18, 0.95) 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    boxShadow: "0 8px 24px -4px rgba(0, 0, 0, 0.7)",
                    animation:
                      "sidebarActiveSlide 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  {/* Very thin top lighting effect concentrated on the top right */}
                  <span
                    className="absolute top-0 right-0 left-1/4 h-[1px]"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55) 75%, rgba(255, 255, 255, 0.95) 100%)",
                    }}
                  />
                </span>
              )}

              {/* Hover background */}
              {!active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl border border-transparent bg-transparent transition-all duration-150 group-hover:border-white/[0.08] group-hover:bg-[#14161B]/60"
                />
              )}

              <div
                className={cn(
                  "relative z-10 flex min-w-0 items-center gap-3.5",
                  !sidebarOpen && "justify-center",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-150",
                    active
                      ? "text-[#F5F5F7]"
                      : "text-[#666A76] group-hover:text-[#F5F5F7]",
                  )}
                />

                {sidebarOpen && (
                  <span className="truncate font-medium tracking-[-0.01em]">
                    {link.label}
                  </span>
                )}
              </div>

              {/* Selected page ultra-thin white vertical line indicator */}
              {active && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-10 h-3 w-[1.5px] shrink-0 rounded-full",
                    "transition-all duration-200",
                    !sidebarOpen && "hidden",
                  )}
                  style={{
                    backgroundColor: "#FFFFFF",
                    boxShadow: "0 0 8px rgba(255, 255, 255, 0.9)",
                  }}
                />
              )}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <Link
            href="/superadmin"
            title={sidebarOpen ? undefined : "Superadmin Console"}
            className={cn(
              "group relative mt-3 flex items-center gap-3.5 rounded-xl",
              "border px-3.5 py-2.5",
              "text-sm font-medium",
              "transition-all duration-150",
              !sidebarOpen && "justify-center px-0",
            )}
            style={{
              borderColor: "rgba(228, 91, 91, 0.35)",
              backgroundColor: "rgba(228, 91, 91, 0.1)",
              color: PALETTE.danger,
              boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
            }}
          >
            <ShieldAlert className="relative z-10 h-4 w-4 shrink-0" />

            {sidebarOpen && (
              <span className="relative z-10 truncate font-medium">
                Superadmin Console
              </span>
            )}
          </Link>
        )}
      </nav>

      {/* Sidebar summary card carousel (for non-superadmin roles when expanded) */}
      {sidebarOpen && !isSuperAdmin && <SidebarCarousel />}

      {/* Sidebar collapse control */}
      <div
        className="relative z-10 flex items-center justify-center border-t px-2 py-3"
        style={{ borderColor: PALETTE.borderSubtle }}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border",
            "transition-all duration-150",
            "active:scale-95",
          )}
          style={{
            backgroundColor: PALETTE.elevatedBg,
            borderColor: "rgba(255, 255, 255, 0.12)",
            color: PALETTE.textSecondary,
          }}
          aria-label={
            sidebarOpen ? "Collapse sidebar" : "Expand sidebar"
          }
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Smooth selected navigation animation */}
      <style jsx>{`
        @keyframes sidebarActiveSlide {
          0% {
            opacity: 0.45;
            transform: scaleY(0.72);
          }

          60% {
            opacity: 0.95;
            transform: scaleY(1.03);
          }

          100% {
            opacity: 1;
            transform: scaleY(1);
          }
        }
      `}</style>
    </aside>
  );
}