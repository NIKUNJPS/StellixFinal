import type { ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";

/**
 * Chrome + auth gate for every /admin/* route.
 *
 * Previously each admin page imported DashboardShell itself, and 11 of the 16 did
 * not — so those pages rendered as a bare centered column with no sidebar, no top
 * nav, no breadcrumb (hence no way back), and, because the shell is also what runs
 * the loadMe()/redirect-to-login check, no auth gate either: a signed-out visitor
 * got a shell-less page whose data calls all 401'd.
 *
 * Putting it in the layout makes that structurally impossible to get wrong again —
 * a new page under /admin cannot forget the chrome, because it never opts in.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
