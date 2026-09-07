"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuthStore } from "@/store/auth-store";

/**
 * Chrome + auth gate for every /admin/* route.
 *
 * Redirects Compliance Officer users to their dedicated /compliance/* routes.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user?.role === "compliance_officer") {
      if (pathname === "/admin/llm-audit") {
        router.replace("/compliance/llm-audit");
      } else if (pathname === "/admin/graph") {
        router.replace("/compliance/graph");
      } else {
        router.replace("/compliance/governance");
      }
    } else if (user?.role === "researcher") {
      if (pathname?.startsWith("/admin/strategies")) {
        router.replace(pathname.replace("/admin/strategies", "/researcher/strategies"));
      } else if (pathname?.startsWith("/admin/failures")) {
        router.replace(pathname.replace("/admin/failures", "/researcher/failures"));
      } else if (pathname?.startsWith("/admin/assistant")) {
        router.replace(pathname.replace("/admin/assistant", "/researcher/assistant"));
      } else if (pathname?.startsWith("/admin/research")) {
        router.replace(pathname.replace("/admin/research", "/researcher/research"));
      } else if (pathname?.startsWith("/admin/graph")) {
        router.replace(pathname.replace("/admin/graph", "/researcher/graph"));
      } else {
        router.replace("/researcher/strategies");
      }
    }
  }, [user, pathname, router]);

  return <DashboardShell>{children}</DashboardShell>;
}
