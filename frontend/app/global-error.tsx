"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Next.js App Router's error boundary of last resort — catches errors thrown
 * during rendering anywhere in the tree, including the root layout, which is
 * why this file provides its own <html>/<body> (it replaces RootLayout
 * entirely when it fires). Recommended by @sentry/nextjs so React render
 * errors are captured the same as the event-handler/unhandled-exception
 * paths the global window handlers already cover (Batch 13).
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground antialiased">
        <div className="text-center">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="mt-1 text-sm text-muted-foreground">The error has been reported.</p>
        </div>
      </body>
    </html>
  );
}
