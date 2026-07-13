/**
 * Which environment is this deployment?
 *
 * We can't infer this from VERCEL_ENV alone — VERCEL_ENV is
 * "production" for BOTH the prod project's main branch AND the
 * staging project's main branch (each Vercel project has its own
 * "production"). NEXT_PUBLIC_APP_ENV is the app-level source of
 * truth we set explicitly per project.
 *
 * Contract:
 *   NEXT_PUBLIC_APP_ENV="production" → prod (rajlo.com)
 *   NEXT_PUBLIC_APP_ENV="staging"    → staging (staging.rajlo.com)
 *   NEXT_PUBLIC_APP_ENV="development" or unset → local dev
 *
 * Both the server and the browser can call these — the value is
 * inlined at build time via the NEXT_PUBLIC_ prefix.
 */

export type AppEnv = "production" | "staging" | "development";

export function appEnv(): AppEnv {
  const raw = process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging") return "staging";
  return "development";
}

export const isStaging = () => appEnv() === "staging";
export const isProduction = () => appEnv() === "production";
export const isDevelopment = () => appEnv() === "development";
