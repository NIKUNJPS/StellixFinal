import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_DSN ? 1.0 : 0.0,
  debug: false,
});

// Required by @sentry/nextjs for client-side navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
