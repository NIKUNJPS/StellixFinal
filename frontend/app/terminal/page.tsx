"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import TerminalWorkspace from "@/components/terminal/terminal-workspace";

export default function TerminalPage() {
  return (
    <DashboardShell>
      <TerminalWorkspace />
    </DashboardShell>
  );
}
