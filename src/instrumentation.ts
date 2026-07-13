/**
 * Server + edge instrumentation for Rajlo. Wires Sentry into the
 * Node.js and Edge runtimes so server errors / API route failures /
 * proxy errors all flow into the Sentry dashboard. Companion file
 * `src/instrumentation-client.ts` handles browser-side capture.
 *
 * Conventions:
 *   - File MUST sit at `src/instrumentation.ts` (or repo root) — Next.js
 *     auto-discovers it. Don't rename it.
 *   - `register()` runs once when each runtime spins up.
 *   - `onRequestError` is Next 15+'s hook for "any error during a
 *     server-rendered or route-handler request". Sentry's
 *     `captureRequestError` matches that signature exactly.
 *
 * Historical note (2026-07-13): the project previously ALSO had
 * `sentry.server.config.ts` + `sentry.edge.config.ts` at the repo
 * root — legacy Sentry-SDK-v7 files. Those duplicate this init at
 * runtime (double capture, double transaction volume) and have been
 * deleted. If they reappear during a Sentry wizard re-run, delete
 * them again — this file is the source of truth for server/edge.
 *
 * We only ENABLE Sentry in production. In dev, errors print to the
 * console and you see them in your terminal — no need to fill the
 * Sentry dashboard with noise from your own laptop.
 */

import * as Sentry from "@sentry/nextjs";

/**
 * DSN resolution: env var wins, hardcoded fallback keeps capture
 * working when the env var is missing (which was the launch-eve
 * state of this repo — memory note "Sentry reconnection blocked
 * pending user's DSN" referred to the missing env var, not to a
 * missing SDK setup).
 *
 * The hardcoded DSN is a Sentry INGEST key — public-key-safe, meant
 * to sit in client bundles. Checking it into git is fine; it doesn't
 * grant read access to error data. If you're migrating to a different
 * Sentry project, either update this line OR remove the fallback so
 * an unset env var becomes a loud misconfig instead of silent
 * wrong-project ingestion.
 */
const DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  "https://5b2710ffe979b3a0b6c982ce2ead80d9@o4511370874650624.ingest.us.sentry.io/4511370876026880";

const commonInit = {
  dsn: DSN,
  // Sampling: 10% of transactions for performance monitoring.
  // 100% of errors are always captured regardless.
  tracesSampleRate: 0.1,
  // Send a tagged "environment" so the Sentry UI separates prod
  // events from preview deploys from local.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
};

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(commonInit);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(commonInit);
  }
}

/** Next 15+ hook — every request error flows through this. */
export const onRequestError = Sentry.captureRequestError;
