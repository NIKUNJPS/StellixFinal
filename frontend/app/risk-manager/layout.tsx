"use client";

import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function RiskManagerLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
