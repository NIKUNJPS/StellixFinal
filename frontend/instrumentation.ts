import * as Sentry from "@sentry/nextjs";

/**
 * Next.js's own instrumentation hook (not Sentry-specific) — runs once per
 * server runtime at process start. Loads the runtime-appropriate Sentry init
 * file. Inert when NEXT_PUBLIC_SENTRY_DSN is unset (Batch 13, same deferred-
 * credential pattern as the backend's SENTRY_DSN): Sentry.init() no-ops on an
 * undefined dsn rather than throwing, so no separate guard is needed here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
