import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Externalise OpenTelemetry / Prisma instrumentation packages that
  // Sentry pulls in transitively. They use a dynamic `require()` for
  // platform-specific code, which webpack can't statically analyse —
  // this triggers a noisy "Critical dependency" warning on every
  // build. Marking them as external keeps the runtime behaviour
  // intact (Sentry still works) while silencing the warning.
  serverExternalPackages: [
    "@opentelemetry/instrumentation",
    "@prisma/instrumentation",
  ],
};

/**
 * Sentry build-time wrapper.
 *
 * Two distinct gates:
 *
 *   1. `NEXT_PUBLIC_SENTRY_DSN` must be set for the wrapper to do
 *      anything useful — without it, runtime instrumentation is a
 *      no-op (see `instrumentation.ts`), and the source-map upload
 *      would also have nowhere to go. Skipping the wrap entirely
 *      keeps the build identical to the un-instrumented baseline
 *      for any contributor / preview deploy that doesn't have
 *      Sentry credentials.
 *
 *   2. Source-map upload (the main thing this wrapper actually does
 *      at build time) requires `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` +
 *      `SENTRY_PROJECT`. The plugin tolerates those being missing —
 *      it just skips the upload step with a warning — so we wrap
 *      whenever the DSN is present and let the plugin decide.
 *
 * Wrapper-side config kept conservative: silent in non-CI builds,
 * no automatic Vercel cron monitors, no React component annotation
 * (extra runtime overhead we don't need yet). Sourcemaps are hidden
 * from the served bundles (`hideSourceMaps`) so visitors can't read
 * unminified code, but Sentry still ingests them via the upload.
 */
const sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      disableLogger: true,
      automaticVercelMonitors: false,
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
