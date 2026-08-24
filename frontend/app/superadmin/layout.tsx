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
  ShieldCheck,
  Radio,
  Users,
  ArrowLeft,
} from "lucide-react";
import { Toaster } from "sonner";

import { ErrorBoundary } from "@/components/error-boundary";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { loadMe, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

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
    if (status === "denied") router.replace("/dashboard");
  }, [status, router]);

  if (status !== "ready" || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#16232B]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF5B04] border-t-transparent" />
          <p className="font-mono text-xs uppercase tracking-widest text-[#E4EEF0]/60">
            {status === "denied" ? "Redirecting to client workspace…" : "Authenticating Superadmin Console…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#16232B] text-white antialiased selection:bg-[#FF5B04]/30 selection:text-white">
      {/* Top Header Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E4EEF0]/10 bg-[#16232B] px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Mobile Nav Trigger */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger aria-label="Open navigation" className="rounded-lg p-1.5 text-[#E4EEF0]/80 hover:bg-[#16232B] hover:text-white md:hidden">
              <Menu className="h-5 w-5 text-[#FF5B04]" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-r border-[#E4EEF0]/10 bg-[#16232B] p-0 text-white">
              <SheetTitle className="border-b border-[#E4EEF0]/10 px-5 py-4 text-left font-mono text-xs font-bold uppercase tracking-wider text-white">
                Superadmin Navigation
              </SheetTitle>
              <nav className="mt-3 flex flex-col gap-1 px-3">
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
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        active
                          ? "border border-[#FF5B04]/40 bg-[#042F34]/50 text-white"
                          : "text-[#E4EEF0]/70 hover:bg-[#042F34]/30 hover:text-white",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#FF5B04]" : "text-[#E4EEF0]/60")} />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Brand Logo & Console Tag */}
          <Link href="/superadmin" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#FF5B04]/40 bg-[#FF5B04]/10 text-[#FF5B04] transition-all group-hover:bg-[#FF5B04]/20 group-hover:shadow-[0_0_16px_rgba(255,91,4,0.35)]">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white transition-colors group-hover:text-[#F4D47C]">
                Stellix Labs
              </span>
              <span className="font-mono text-[9px] tracking-wider text-[#E4EEF0]/50 uppercase">
                Control Plane
              </span>
            </div>
          </Link>

          <div className="hidden h-5 w-px bg-[#E4EEF0]/10 sm:block" />

          <div className="hidden items-center gap-2 rounded-md border border-[#FF5B04]/30 bg-[#FF5B04]/10 px-2 py-0.5 sm:flex">
            <Radio className="h-3 w-3 text-[#FF5B04]" />
            <span className="font-mono text-[10px] font-semibold tracking-wider text-[#FF5B04] uppercase">
              Superadmin Mode
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-[#F4D47C] md:inline">
            {user.email}
          </span>

          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-[#E4EEF0]/10 bg-[#16232B] font-mono text-xs text-[#E4EEF0]/80 hover:bg-[#042F34]/40 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Client App</span>
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="h-8 gap-1.5 p-2 text-xs text-[#E4EEF0]/70 hover:bg-[#FF5B04]/15 hover:text-[#FF5B04]"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (Matching Charcoal Teal #16232B) */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#E4EEF0]/10 bg-[#16232B] md:flex">
          {/* Navigation Section */}
          <div className="px-4 pt-4 pb-2">
            <p className="font-mono text-[10px] font-medium tracking-wider text-[#E4EEF0]/40 uppercase">
              Management & Operations
            </p>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" data-testid="superadmin-nav">
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
                    "group relative flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "border border-[#FF5B04]/40 bg-[#042F34]/60 text-white shadow-sm"
                      : "text-[#E4EEF0]/70 hover:border hover:border-[#E4EEF0]/10 hover:bg-[#042F34]/20 hover:text-white",
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active ? "text-[#FF5B04]" : "text-[#E4EEF0]/60 group-hover:text-[#F4D47C]",
                      )}
                    />
                    <span className="truncate">{link.label}</span>
                  </div>

                  {active && (
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#FF5B04] shadow-[0_0_8px_rgba(255,91,4,0.8)]" />
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Audit & Compliance Notice */}
          <div className="border-t border-[#E4EEF0]/10 bg-[#16232B] p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#F4D47C]" />
                <span className="font-mono text-[10px] tracking-wider text-[#E4EEF0]/60 uppercase">
                  SOC 2 Logging
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#F4D47C]">Enforced</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-[#E4EEF0]/50">
              Platform-wide access. Every action is audited.
            </p>
          </div>
        </aside>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-[#16232B] p-6 sm:p-8">
          <ErrorBoundary>
            <div className="mx-auto max-w-6xl">{children}</div>
          </ErrorBoundary>
        </main>
      </div>

      <Toaster position="top-right" theme="dark" richColors closeButton />
    </div>
  );
}
//files to modify