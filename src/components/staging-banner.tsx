import { appEnv } from "@/lib/app-env";

/**
 * A tiny "STAGING" pill fixed to the top-right corner. Only renders
 * when NEXT_PUBLIC_APP_ENV === "staging" — so it's invisible in
 * production and local dev. The point is to catch the "wait, am I
 * looking at prod or staging?" mistake before someone runs a
 * destructive test against real user data.
 *
 * Server component — no JS shipped. z-index sits above the header
 * and modals so it's always visible; pointer-events-none so it
 * never intercepts clicks.
 */
export function StagingBanner() {
  if (appEnv() !== "staging") return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-1/2 top-2 z-[9999] -translate-x-1/2 select-none rounded-full border border-amber-300/60 bg-amber-100/90 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-900 shadow-sm backdrop-blur"
    >
      Staging
    </div>
  );
}
