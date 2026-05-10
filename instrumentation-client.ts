/**
 * Sentry — client-side instrumentation.
 *
 * Runs in the browser, AFTER the HTML document is loaded but BEFORE
 * React hydration begins. That timing is exactly what we want for
 * an error tracker: we capture errors thrown during hydration too,
 * not just after.
 *
 * Mirrors the server config:
 *   - Errors only, no tracing, no replay (replay is heavy and would
 *     blow the free quota immediately).
 *   - Disabled in dev so local browsing doesn't pollute the inbox.
 *   - No-op when `NEXT_PUBLIC_SENTRY_DSN` is not configured.
 *
 * The `onRouterTransitionStart` export hooks into Next.js's
 * client-side navigation events — every push/replace/traverse
 * pushes a breadcrumb so a stack trace at the bottom of a long
 * navigation chain still tells us "which page caused this".
 *
 * Reference: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: process.env.NODE_ENV === "production",
    sampleRate: 1.0,
    tracesSampleRate: 0,
    // Replay is opt-in and very expensive on the free tier — keep
    // both knobs at 0 unless we explicitly decide to enable it for
    // a specific debugging session.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  });
}

/**
 * Pushes a navigation breadcrumb on every client-side route change.
 * `Sentry.captureRouterTransitionStart` is a no-op when Sentry is
 * not initialised (DSN missing), so we can export it unconditionally.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
