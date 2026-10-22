import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Batch 17: emit a self-contained server bundle (.next/standalone) so the
  // production image ships only the traced runtime files + a minimal node_modules,
  // not the full dev dependency tree. Runner copies .next/standalone + .next/static.
  output: "standalone",
  // The Knowledge Graph pages became Research Memory (ADR 0012); keep old links working.
  async redirects() {
    return [
      {
        source: "/:role(admin|researcher|compliance|risk-manager|cio)/graph",
        destination: "/:role/memory",
        permanent: true,
      },
    ];
  },
};

// Batch 13: wraps build output with Sentry's instrumentation + (when
// SENTRY_AUTH_TOKEN is set — a separate, deferred credential from the
// runtime NEXT_PUBLIC_SENTRY_DSN, only needed to upload sourcemaps) source
// map upload. `silent: true` keeps local builds quiet when no org/project is
// configured yet, which is the current dev-deferred state.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
