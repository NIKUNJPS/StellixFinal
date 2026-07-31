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
  // Batch 24: the console link appears only for platform superadmins. The route
  // itself is gated server-side too — this just avoids showing a dead link.
  const isSuperAdmin = useAuthStore((s) => s.user?.is_super_admin ?? false);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex",
        sidebarOpen ? "w-60" : "w-16",
      )}
    >
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" data-testid="sidebar-nav">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={sidebarOpen ? undefined : link.label}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                !sidebarOpen && "justify-center px-0",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <Link
            href="/superadmin"
            title={sidebarOpen ? undefined : "Superadmin Console"}
            className={cn(
              "mt-2 flex items-center gap-3 rounded-md border border-crimson/40 px-3 py-2 text-sm font-medium text-crimson transition-colors hover:bg-crimson/10",
              !sidebarOpen && "justify-center px-0",
            )}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span className="truncate">Superadmin Console</span>}
          </Link>
        )}
      </nav>
      <button
        type="button"
        onClick={toggleSidebar}
        className="flex items-center justify-center gap-2 border-t border-border py-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </aside>
  );
}
