"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShieldAlert } from "lucide-react";

import { NAV_LINKS } from "@/components/layout/nav-config";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

/**
 * Mobile navigation drawer (Batch 21). The desktop sidebar is `hidden md:flex`, so
 * below the md breakpoint there was no way to reach nav links. This hamburger +
 * slide-over drawer (built on the existing Sheet) fills that gap; it is itself
 * `md:hidden` so it never shows alongside the desktop sidebar.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isSuperAdmin = useAuthStore((s) => s.user?.is_super_admin ?? false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="text-muted-foreground hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="px-4 pt-5 text-stellix-highlight">Stellix Labs</SheetTitle>
        <nav className="mt-4 flex flex-col gap-1 overflow-y-auto px-2 pb-8">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
          {isSuperAdmin && (
            <Link
              href="/superadmin"
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center gap-3 rounded-md border border-crimson/40 px-3 py-2 text-sm font-medium text-crimson hover:bg-crimson/10"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Superadmin Console
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
