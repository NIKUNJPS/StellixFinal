"use client";

import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function ResearcherLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
