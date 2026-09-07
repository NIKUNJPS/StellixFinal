import type { ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";

/**
 * Chrome + auth gate for every /compliance/* route.
 */
export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
