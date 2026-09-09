"use client";

import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function CioLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
