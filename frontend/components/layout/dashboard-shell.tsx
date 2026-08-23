"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Toaster } from "sonner";

import { ErrorBoundary } from "@/components/error-boundary";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { RealtimeAlerts } from "@/components/ws/realtime-alerts";
import { loadMe } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";
import { useAuthStore } from "@/store/auth-store";

const ONBOARDING_DISMISSED_KEY = "stellix:onboarding-dismissed";

/** Shared chrome for every authenticated dashboard page (Batch 12): top nav +
 * sidebar + the auth-gate/redirect-to-login check every page needs. Centralized
 * here rather than copy-pasted per page (the original pattern in
 * app/dashboard/page.tsx, before this batch, had each page re-implement it). */
export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, organization } = useAuthStore();
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated">("loading");
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    let active = true;
    // On a hard refresh the in-memory access token is gone; loadMe() will trigger a
    // silent refresh from the httpOnly cookie. If that fails, send them to /login.
    loadMe().then(async (me) => {
      if (!active) return;
      setStatus(me ? "ready" : "unauthenticated");
      // Batch 21: a freshly-approved org with no strategies gets the onboarding
      // wizard — unless it already completed onboarding or dismissed it this session.
      if (me && typeof window !== "undefined" && !sessionStorage.getItem(ONBOARDING_DISMISSED_KEY)) {
        try {
          const ob = await getOnboardingStatus();
          if (active && !ob.completed && ob.strategy_count === 0) setShowWizard(true);
        } catch {
          /* non-fatal — never block the dashboard on the onboarding probe */
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function dismissWizard() {
    if (typeof window !== "undefined") sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    setShowWizard(false);
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "ready" || !user || !organization) {
    return (
      // Loading state
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
    );
  }

  // The WebSocket provider lives in app/providers.tsx (above every page). This shell
  // hosts the consumers — the global alert surface, the toast portal, and (in
  // TopNav) the connection status dot — all of which are below that provider.
  return (
    <div className="flex h-screen flex-col">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-black p-6">
          {/* A crash in a page component shows the branded fallback, not a blank shell. */}
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      <RealtimeAlerts />
      <Toaster position="top-right" theme="dark" richColors closeButton />
      {showWizard && <OnboardingWizard onClose={dismissWizard} />}
    </div>
  );
}
