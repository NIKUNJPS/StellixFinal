"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";
import { getNavLinks } from "@/components/layout/nav-config";

const PALETTE = {
  mainBg: "#08090B",
  sidebarBg: "#0B1017",
  cardBg: "#0F1115",
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  glowLavender: "#6F6B9B",
  danger: "#E45B5B",
};

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  // Batch 24: the console link appears only for platform superadmins.
  // The route itself is gated server-side too — this just avoids showing a dead link.
  const isSuperAdmin = user?.is_super_admin ?? false;
  const navLinks = getNavLinks(user?.role);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r transition-[width] duration-300 md:flex",
        sidebarOpen ? "w-60" : "w-16",
      )}
      style={{
        backgroundColor: PALETTE.sidebarBg,
        borderColor: PALETTE.borderSubtle,
      }}
    >
      <nav
        className="flex-1 space-y-1 overflow-y-auto px-2.5 py-4"
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
                "group relative flex items-center justify-between rounded-xl px-3 py-2.5",
                "text-sm font-medium",
                "transition-all duration-150",
                !sidebarOpen && "justify-center px-0",
                active
                  ? "text-[#F5F5F7]"
                  : "text-[#9A9DA8] hover:text-[#F5F5F7]",
              )}
            >
              {/* Selected background */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl border shadow-sm"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: "rgba(255, 255, 255, 0.12)",
                    boxShadow: "0 4px 18px -2px rgba(0, 0, 0, 0.5)",
                    animation:
                      "sidebarActiveSlide 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              )}

              {/* Hover background */}
              {!active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl border border-transparent bg-transparent transition-all duration-150 group-hover:border-white/[0.06] group-hover:bg-[#14161B]/60"
                />
              )}

              <div
                className={cn(
                  "relative z-10 flex min-w-0 items-center gap-3",
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
                  <span className="truncate tracking-[-0.01em]">
                    {link.label}
                  </span>
                )}
              </div>

              {/* Selected page indicator */}
              {active && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-10 h-1.5 w-1.5 shrink-0 rounded-full",
                    "transition-all duration-200",
                    !sidebarOpen && "hidden",
                  )}
                  style={{
                    backgroundColor: PALETTE.glowLavender,
                    boxShadow: "0 0 8px rgba(111, 107, 155, 0.9)",
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
              "group relative mt-2 flex items-center gap-3 rounded-xl",
              "border px-3 py-2.5",
              "text-sm font-medium",
              "transition-all duration-150",
              !sidebarOpen && "justify-center px-0",
            )}
            style={{
              borderColor: "rgba(228, 91, 91, 0.3)",
              backgroundColor: "rgba(228, 91, 91, 0.08)",
              color: PALETTE.danger,
            }}
          >
            <ShieldAlert className="relative z-10 h-4 w-4 shrink-0" />

            {sidebarOpen && (
              <span className="relative z-10 truncate">
                Superadmin Console
              </span>
            )}
          </Link>
        )}
      </nav>

      {/* Sidebar collapse control */}
      <div
        className="flex items-center justify-center border-t px-2 py-3"
        style={{ borderColor: PALETTE.borderSubtle }}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border",
            "transition-all duration-150",
            "active:scale-95",
          )}
          style={{
            backgroundColor: PALETTE.elevatedBg,
            borderColor: PALETTE.borderSubtle,
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