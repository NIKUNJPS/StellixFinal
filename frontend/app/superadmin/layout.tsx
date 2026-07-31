"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Building2,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  ServerCog,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Toaster } from "sonner";

import { ErrorBoundary } from "@/components/error-boundary";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { loadMe, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

/**
 * SUPERADMIN console shell (Batch 24).
 *
 * A deliberately separate chrome from the client dashboard: crimson accent, a
 * "SUPERADMIN CONSOLE" badge, and a red border-top so it is impossible to mistake
 * the founder's platform-wide surface for a tenant's own view. The gate is
 * defence-in-depth in front of the backend's require_super_admin — a non-superadmin
 * who reaches this route is bounced to the client dashboard rather than shown an
 * empty console. The real authorization lives server-side; this is just UX.
 */

const SUPERADMIN_NAV = [
  { href: "/superadmin", label: "Command Center", icon: LayoutDashboard, exact: true },
  { href: "/superadmin/companies", label: "Companies", icon: Building2 },
  { href: "/superadmin/demo-requests", label: "Demo Requests", icon: Inbox },
  { href: "/superadmin/users", label: "Users", icon: Users },
  { href: "/superadmin/analytics", label: "Analytics", icon: Activity },
  { href: "/superadmin/system", label: "System", icon: ServerCog },
];

export default function SuperadminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "unauthenticated">("loading");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    loadMe().then((me) => {
      if (!active) return;
      if (!me) {
        setStatus("unauthenticated");
      } else if (!me.user.is_super_admin) {
        setStatus("denied");
      } else {
        setStatus("ready");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    // Non-superadmins are redirected to the client dashboard (this app's dashboard
    // route is /dashboard; the spec's "/admin/dashboard" doesn't exist here).
    if (status === "denied") router.replace("/dashboard");
  }, [status, router]);

  if (status !== "ready" || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          {status === "denied" ? "Redirecting…" : "Loading console…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col border-t-4 border-crimson">
      {/* Top bar — crimson-accented, unmistakably the internal console. */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
        {/* Mobile nav drawer — the crimson sidebar is hidden below md. */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger aria-label="Open navigation" className="text-crimson md:hidden">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-t-4 border-crimson p-0">
            <SheetTitle className="px-4 pt-5 text-crimson">Superadmin Console</SheetTitle>
            <nav className="mt-4 flex flex-col gap-1 px-2 pb-8">
              {SUPERADMIN_NAV.map((link) => {
                const active = link.exact
                  ? pathname === link.href
                  : pathname === link.href || pathname?.startsWith(`${link.href}/`);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-crimson/15 text-crimson"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
        <Link href="/superadmin" className="flex items-center gap-2 font-semibold text-crimson">
          <ShieldAlert className="h-5 w-5" />
          <span className="text-lg">Stellix Labs</span>
        </Link>
        <span className="rounded-md border border-crimson/50 bg-crimson/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-crimson">
          Superadmin Console
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
            title="Back to the client app"
          >
            Client app
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-crimson"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
          <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" data-testid="superadmin-nav">
            {SUPERADMIN_NAV.map((link) => {
              const active = link.exact
                ? pathname === link.href
                : pathname === link.href || pathname?.startsWith(`${link.href}/`);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-crimson/15 text-crimson"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Platform-wide access. Every action is logged.
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      <Toaster position="top-right" theme="dark" richColors closeButton />
    </div>
  );
}
