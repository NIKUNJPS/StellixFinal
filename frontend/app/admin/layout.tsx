"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuthStore } from "@/store/auth-store";

const ROLE_ROUTE_ROOTS: Record<string, string> = { risk_manager: "/risk-manager", cio: "/cio" };
const RISK_ROLE_SECTIONS = ["portfolio", "governance", "failures", "memory"];

/**
 * Chrome + auth gate for every /admin/* route.
 *
 * Redirects Compliance Officer users to their dedicated /compliance/* routes.
 * Batch 25: risk_manager/cio are mapped to their own equivalents of every /admin page
 * they are allowed to use (portfolio, governance, failures, memory) instead of being
 * bounced to Failure Intelligence regardless of what they asked for.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Batch 26: redirects apply only to the five system roles, keyed on the EFFECTIVE role —
  // a member on an organization custom role uses the generic /admin pages.
  const effectiveRole = useAuthStore((s) => s.effectiveRole);
  const roleKey = effectiveRole?.system_key ?? null;

  useEffect(() => {
    if (roleKey === "compliance_officer") {
      if (pathname === "/admin/llm-audit") {
        router.replace("/compliance/llm-audit");
      } else if (pathname === "/admin/members") {
        router.replace("/compliance/members");
      } else if (pathname === "/admin/memory") {
        router.replace("/compliance/memory");
      } else {
        router.replace("/compliance/governance");
      }
    } else if (roleKey === "researcher") {
      if (pathname?.startsWith("/admin/strategies")) {
        router.replace(pathname.replace("/admin/strategies", "/researcher/strategies"));
      } else if (pathname?.startsWith("/admin/failures")) {
        router.replace(pathname.replace("/admin/failures", "/researcher/failures"));
      } else if (pathname?.startsWith("/admin/assistant")) {
        router.replace(pathname.replace("/admin/assistant", "/researcher/assistant"));
      } else if (pathname?.startsWith("/admin/research")) {
        router.replace(pathname.replace("/admin/research", "/researcher/research"));
      } else if (pathname?.startsWith("/admin/memory")) {
        router.replace(pathname.replace("/admin/memory", "/researcher/memory"));
      } else {
        router.replace("/researcher/strategies");
      }
    } else if (roleKey && roleKey in ROLE_ROUTE_ROOTS) {
      const root = ROLE_ROUTE_ROOTS[roleKey] as string;
      const section = RISK_ROLE_SECTIONS.find((s) => pathname?.startsWith(`/admin/${s}`));
      router.replace(section ? pathname!.replace("/admin", root) : `${root}/failures`);
    }
  }, [roleKey, pathname, router]);

  return <DashboardShell>{children}</DashboardShell>;
}
