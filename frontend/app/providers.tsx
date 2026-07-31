"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { WebSocketProvider } from "@/hooks/useWebSocket";

/** App-wide client providers (TanStack Query + realtime WebSocket).
 *
 * WebSocketProvider lives here, above every page, on purpose (Batch 19): each
 * authenticated page renders its own <DashboardShell>, so a provider mounted
 * *inside* the shell would sit BELOW the page component — and a page that calls
 * useWebSocket() in its own body (regimes, dashboard) would read context from
 * above the shell and get the no-op fallback. Hoisting it here puts every page
 * below the provider. It stays idle (no socket) until auth is present — connect()
 * guards on accessToken/user and reconnects when they appear — so mounting it on
 * public marketing pages costs nothing. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>{children}</WebSocketProvider>
    </QueryClientProvider>
  );
}
