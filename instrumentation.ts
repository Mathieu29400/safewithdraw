/**
 * Sentry — server-side instrumentation.
 *
 * Runs once when the Next.js server boots, on both the Node.js
 * runtime (Vercel functions, /api routes, server components) and the
 * Edge runtime (middleware, edge functions). The two sub-inits are
 * gated on `NEXT_RUNTIME` because the SDK ships different transport
 * code for each — loading both would double-count exceptions.
 *
 * Configuration philosophy:
 *   - Capture exceptions only. No tracing, no profiling, no
 *     performance monitoring. Free tier (5k events/mo) is plenty
 *     for early-stage error monitoring; tracing burns it in days.
 *   - Disabled in development (`NODE_ENV !== "production"`) so local
 *     dev never spams the Sentry dashboard. The DSN can stay set.
 *   - No-op when `NEXT_PUBLIC_SENTRY_DSN` is not configured: a fresh
 *     clone of the repo without Sentry env vars boots normally.
 *
 * The `onRequestError` re-export wires Next.js's built-in
 * server-error hook into Sentry — every uncaught error in a server
 * component, route handler or server action is captured automatically
 * with the request path attached for context.
 *
 * Reference: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const enabled = process.env.NODE_ENV === "production";

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn,
      enabled,
      // Sample 100 % of errors. Sampling makes sense for tracing /
      // performance events, not for the (already rare) exceptions we
      // actually want to see.
      sampleRate: 1.0,
      tracesSampleRate: 0,
      // Strip the "[Vercel] …" prefix and similar internal noise from
      // event titles for cleaner inbox triage.
      sendDefaultPii: false,
      environment: process.env.VERCEL_ENV ?? "production",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      enabled,
      sampleRate: 1.0,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      environment: process.env.VERCEL_ENV ?? "production",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
    });
  }
}

/**
 * Reports server-side errors (server components, route handlers,
 * server actions, middleware) to Sentry with the request context
 * attached. Wiring is automatic — Next.js looks for an exported
 * `onRequestError` symbol from this file.
 */
export const onRequestError = Sentry.captureRequestError;
