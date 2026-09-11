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
      <div className="flex min-h-screen items-center justify-center bg-[#07080B] text-[#F5F5F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#8E88C7] border-t-transparent" />
          <p className="font-mono text-xs uppercase tracking-widest text-[#9A9DA8]">
            {status === "denied" ? "Redirecting to client workspace…" : "Authenticating Superadmin Console…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#07080B] text-[#F5F5F7] antialiased selection:bg-[#8E88C7]/30 selection:text-white">
      {/* Top Header Bar */}
      <header
        className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0D0F14]/80 px-4 sm:px-6 backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Mobile Nav Trigger */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger aria-label="Open navigation" className="rounded-xl p-1.5 text-[#9A9DA8] hover:bg-white/[0.05] hover:text-white md:hidden">
              <Menu className="h-5 w-5 text-[#8E88C7]" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-r border-white/[0.08] bg-[#0D0F14] p-0 text-white backdrop-blur-2xl">
              <SheetTitle className="border-b border-white/[0.08] px-5 py-4 text-left font-mono text-xs font-bold uppercase tracking-wider text-[#F5F5F7]">
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
                        "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                        active
                          ? "border border-white/[0.15] bg-[#1C1F26] text-white shadow-md"
                          : "text-[#9A9DA8] hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#F5F5F7]" : "text-[#666A76]")} />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Brand Logo & Console Tag */}
          <Link href="/superadmin" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/15 text-[#8E88C7] transition-all group-hover:bg-[#8E88C7]/25 group-hover:shadow-[0_0_16px_rgba(142,136,199,0.35)]">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#F5F5F7] transition-colors group-hover:text-[#8E88C7]">
                Stellix Labs
              </span>
              <span className="font-mono text-[9px] tracking-widest text-[#666A76] uppercase">
                Control Plane
              </span>
            </div>
          </Link>

          <div className="hidden h-5 w-px bg-white/[0.08] sm:block" />

          <div className="hidden items-center gap-2 rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/10 px-3 py-1 sm:flex backdrop-blur-md">
            <Radio className="h-3 w-3 text-[#8E88C7]" />
            <span className="font-mono text-[10px] font-semibold tracking-wider text-[#8E88C7] uppercase">
              Superadmin Mode
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-[#8E88C7] md:inline">
            {user.email}
          </span>

          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-white/[0.1] bg-[#0F1115] font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.05] hover:text-white"
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
            className="h-8 gap-1.5 rounded-xl p-2 text-xs text-[#9A9DA8] hover:bg-[#F87171]/15 hover:text-[#F87171]"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside
          className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#0A0C10]/85 backdrop-blur-2xl md:flex"
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.1)" }}
        >
          {/* Top-Left Atmospheric Violet Lighting Orb */}
          <div className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full bg-[#5C568E]/30 blur-[90px]" />
          <div className="pointer-events-none absolute top-1/2 -right-20 h-48 w-48 rounded-full bg-[#38BDF8]/10 blur-[100px]" />

          {/* Navigation Section */}
          <div className="px-4 pt-5 pb-2">
            <p className="font-mono text-[10px] font-medium tracking-wider text-[#666A76] uppercase">
              Management & Operations
            </p>
          </div>
          <nav className="relative z-10 flex-1 space-y-1.5 overflow-y-auto px-3 py-2" data-testid="superadmin-nav">
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
                    "group relative flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                    active ? "text-[#F5F5F7]" : "text-[#9A9DA8] hover:text-[#F5F5F7]",
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
                      }}
                    >
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

                  <div className="relative z-10 flex items-center gap-3.5 truncate">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active ? "text-[#F5F5F7]" : "text-[#666A76] group-hover:text-[#F5F5F7]",
                      )}
                    />
                    <span className="truncate font-medium tracking-[-0.01em]">{link.label}</span>
                  </div>

                  {/* Selected page ultra-thin white vertical line indicator */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="relative z-10 h-3 w-[1.5px] shrink-0 rounded-full"
                      style={{
                        backgroundColor: "#FFFFFF",
                        boxShadow: "0 0 8px rgba(255, 255, 255, 0.9)",
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Audit & Compliance Notice */}
          <div className="relative z-10 border-t border-white/[0.06] bg-[#0A0C10]/85 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#8E88C7]" />
                <span className="font-mono text-[10px] tracking-wider text-[#9A9DA8] uppercase">
                  SOC 2 Logging
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#34D399]">Enforced</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-[#666A76]">
              Platform-wide access. Every action is audited.
            </p>
          </div>
        </aside>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-[#07080B] p-6 sm:p-8">
          <ErrorBoundary>
            <div className="mx-auto max-w-6xl">{children}</div>
          </ErrorBoundary>
        </main>
      </div>

      <Toaster position="top-right" theme="dark" richColors closeButton />
    </div>
  );
}