"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

/**
 * Sticky bottom card shown on /rider/request when the visitor isn't
 * signed in. They still see the trip preview (map + pickup + dropoff
 * + fare estimate) underneath — the prompt sits over the bottom of
 * the viewport, doesn't block the map, and offers a clear "sign in to
 * book" affordance + a "create account" secondary link.
 *
 * The "next" param round-trips the current URL through the login
 * flow so a successful sign-in lands the rider right back here with
 * the same pickup/dropoff/mode in the query string. That preserves
 * the work they put into picking the trip.
 *
 * Renders nothing when used from a server context that can't read
 * the pathname (defensive — should never happen in practice since
 * this is always mounted under /rider/request).
 */
export function AnonymousBookingPrompt({
  fareLabel,
}: {
  /** Optional fare estimate to surface as part of the prompt — gives
   *  the rider a concrete reason to click through ("$X for this
   *  trip"). Pass null when no fare is known yet. */
  fareLabel?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const nextHref = (() => {
    if (!pathname) return "/rider/request";
    const qs = params?.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  const goLogin = () => {
    router.push(`/auth/rider/login?next=${encodeURIComponent(nextHref)}`);
  };
  const goSignup = () => {
    router.push(`/auth/rider/signup?next=${encodeURIComponent(nextHref)}`);
  };

  return (
    <>
      {/* Dim backdrop behind the prompt. Pulls visual attention to the
         sheet and visually dampens the trip preview so the rider's
         eye lands on the CTA. Pointer-events-none so the visitor can
         still tap the map / sheet underneath (the prompt is meant to
         nudge, not lock out). Backdrop-blur adds a subtle frosted
         feel without fully hiding the map. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-30 bg-rajlo-black/40 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="anon-prompt-title"
        // Fixed to the bottom of the viewport, above the backdrop.
        // pointer-events-none on the wrapper so the map underneath
        // stays interactive in the gap above the card; the card
        // itself restores pointer events for its inner content.
        // Bottom padding honors the iOS safe area so the prompt
        // doesn't sit underneath Safari's URL bar / the home
        // indicator on notched devices.
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-line bg-surface p-4 shadow-2xl shadow-rajlo-black/40 backdrop-blur md:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/30">
              <Icon name="user" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                id="anon-prompt-title"
                className="text-sm font-extrabold tracking-tight"
              >
                Sign in to book this ride
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted">
                {fareLabel
                  ? `${fareLabel} for this trip. We'll bring you right back here after you sign in.`
                  : "We'll bring you right back here after you sign in."}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={goSignup}
              className="inline-flex items-center justify-center rounded-full border border-line bg-surface px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft hover:text-rajlo-red"
            >
              Create account
            </button>
            <button
              type="button"
              onClick={goLogin}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-rajlo-red px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Sign in
              <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
