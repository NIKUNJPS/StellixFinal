"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";
import { NAV_LINKS } from "@/components/layout/nav-config";

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const pathname = usePathname();

  // Batch 24: the console link appears only for platform superadmins.
  // The route itself is gated server-side too — this just avoids showing a dead link.
  const isSuperAdmin = useAuthStore((s) => s.user?.is_super_admin ?? false);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-[#d3dbdd]/10 bg-[#16232b] transition-[width] duration-300 md:flex",
        sidebarOpen ? "w-60" : "w-16",
      )}
    >
      <nav
        className="flex-1 space-y-1 overflow-y-auto px-2 py-4"
        data-testid="sidebar-nav"
      >
        {NAV_LINKS.map((link) => {
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
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5",
                "text-sm font-medium",
                "transition-colors duration-200",
                !sidebarOpen && "justify-center px-0",
                active
                  ? "text-[#d3dbdd]"
                  : "text-[#d3dbdd]/75 hover:text-[#d3dbdd]",
              )}
            >
              {/* Sliding active background */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl bg-[#042F34]"
                  style={{
                    animation:
                      "sidebarActiveSlide 320ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              )}

              {/* Hover background */}
              {!active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl bg-transparent transition-colors duration-200 group-hover:bg-[#042F34]/70"
                />
              )}

              <Icon
                className={cn(
                  "relative z-10 h-[18px] w-[18px] shrink-0",
                  "transition-all duration-200",
                  active
                    ? "text-[#d3dbdd]"
                    : "text-[#d3dbdd]/70 group-hover:text-[#d3dbdd]",
                )}
              />

              {sidebarOpen && (
                <span className="relative z-10 truncate">
                  {link.label}
                </span>
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
              "border border-crimson/40 px-3 py-2.5",
              "text-sm font-medium text-crimson",
              "transition-colors duration-200",
              "hover:bg-crimson/10",
              !sidebarOpen && "justify-center px-0",
            )}
          >
            <ShieldAlert className="relative z-10 h-[18px] w-[18px] shrink-0" />

            {sidebarOpen && (
              <span className="relative z-10 truncate">
                Superadmin Console
              </span>
            )}
          </Link>
        )}
      </nav>

      {/* Sidebar collapse control */}
      <div className="flex items-center justify-center border-t border-[#d3dbdd]/10 px-2 py-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            "border border-[#d3dbdd]/15",
            "bg-[#16232b]",
            "text-[#d3dbdd]/75",
            "transition-all duration-200",
            "hover:border-[#d3dbdd]/30",
            "hover:bg-[#042F34]",
            "hover:text-[#d3dbdd]",
            "active:scale-95",
          )}
          aria-label={
            sidebarOpen ? "Collapse sidebar" : "Expand sidebar"
          }
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-[18px] w-[18px]" />
          ) : (
            <ChevronRight className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>

      {/* Smooth active navigation animation */}
      <style jsx>{`
        @keyframes sidebarActiveSlide {
          0% {
            opacity: 0.45;
            transform: scaleY(0.72);
          }

          55% {
            opacity: 0.9;
            transform: scaleY(1.04);
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