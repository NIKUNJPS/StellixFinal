"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShieldAlert } from "lucide-react";

import { getNavLinks } from "@/components/layout/nav-config";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.is_super_admin ?? false;
  const navLinks = getNavLinks(user?.role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          "border border-white/[0.08]",
          "bg-[#0F1117]",
          "text-[#9A9DA8]",
          "transition-all duration-200",
          "hover:border-white/[0.18]",
          "hover:bg-[#14161B]",
          "hover:text-[#F5F5F7]",
          "md:hidden",
        )}
      >
        <Menu className="h-[18px] w-[18px]" />
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-72 border-r border-white/[0.06] bg-[#08090B] p-0 text-[#F5F5F7] backdrop-blur-xl"
      >
        <SheetTitle className="px-5 pt-5 text-sm font-semibold tracking-wide text-[#F5F5F7]">
          Stellix Labs
        </SheetTitle>

        <nav className="mt-5 flex flex-col gap-1 overflow-y-auto px-2 pb-8">
          {navLinks.map((link) => {
            const active =
              pathname === link.href ||
              pathname?.startsWith(`${link.href}/`);

            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5",
                  "text-sm font-medium",
                  "transition-all duration-200",
                  active
                    ? "bg-[#14161B] text-[#F5F5F7] border border-white/[0.12]"
                    : "text-[#9A9DA8] hover:bg-[#14161B]/60 hover:text-[#F5F5F7]",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                    active
                      ? "text-[#F5F5F7]"
                      : "text-[#666A76] group-hover:text-[#F5F5F7]",
                  )}
                />

                <span className="truncate">
                  {link.label}
                </span>
              </Link>
            );
          })}

          {isSuperAdmin && (
            <Link
              href="/superadmin"
              onClick={() => setOpen(false)}
              className={cn(
                "mt-2 flex items-center gap-3 rounded-xl",
                "border border-crimson/40 px-3 py-2.5",
                "text-sm font-medium text-crimson",
                "transition-colors duration-200",
                "hover:bg-crimson/10",
              )}
            >
              <ShieldAlert className="h-[18px] w-[18px] shrink-0" />

              <span className="truncate">
                Superadmin Console
              </span>
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}