"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Mount once at the root layout. Monkey-patches `window.fetch` for
 * the lifetime of the app so any 401 from our own `/api/*` endpoints
 * triggers a redirect to the appropriate login page.
 *
 * Why patch fetch and not catch errors at every call site?
 *   - Hundreds of fetch calls scattered across pages and hooks; no
 *     way to enforce per-call handling.
 *   - Supabase's own SDK uses fetch under the hood for token refresh
 *     and auth — we deliberately don't redirect on THOSE 401s so the
 *     SDK can recover (refresh, retry). Filter by URL prefix.
 *
 * Safety rails:
 *   - Only triggers on responses from our own `/api/*` paths. Supabase
 *     auth calls hit `*.supabase.co` and pass through untouched.
 *   - Throttled — multiple in-flight 401s only fire one redirect.
 *   - Doesn't fire while the user is already on a login or public
 *     auth surface (would clobber the form they just submitted).
 */

let lastRedirectAt = 0;
const REDIRECT_THROTTLE_MS = 2_000;

export function AuthFetchGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const original: typeof window.fetch = window.fetch.bind(window);

    const handle401 = () => {
      // Throttle so a page that fires three /api/ calls in parallel
      // and all 401 doesn't cause three router.replace calls in a row.
      const now = Date.now();
      if (now - lastRedirectAt < REDIRECT_THROTTLE_MS) return;
      lastRedirectAt = now;

      // Already on an auth surface? Don't ricochet the user away
      // from the form they're trying to submit. Specifically: sign-in
      // pages can legitimately receive 401 on wrong-credentials.
      //
      // /rider/request is also exempt: that page is deliberately
      // visitable by anonymous users so they can see the trip
      // preview (map + pickup + dropoff + fare estimate) before
      // being asked to sign in. The page mounts an
      // AnonymousBookingPrompt overlay to nudge sign-in instead of
      // an auto-redirect. Any 401s its API calls return (active
      // ride check, matcher, etc.) are silently swallowed by the
      // page's own error handling.
      const path = pathname ?? "";
      if (
        path.startsWith("/auth/") ||
        path === "/403" ||
        path === "/404" ||
        path === "/rider/request" ||
        path.startsWith("/rider/request/")
      ) {
        return;
      }

      // Portal-path checks are BOUNDED (exact match OR trailing-slash
      // subpath) instead of a loose `startsWith`. `startsWith("/driver")`
      // used to match `/driver-join`, `/driver-jobs-in/kingston`, and
      // every future /driver-* marketing route — so an anonymous
      // visitor clicking "Become a driver" on the login page landed
      // briefly on /driver-join, its SiteHeader fired an /api/* call
      // that 401'd, and this guard bounced them right back to
      // /auth/driver/login because it thought they were in the driver
      // portal. The proxy had the same bug on its own gate at
      // src/proxy.ts:220-227 and was already fixed; this was the
      // second occurrence. Same treatment for /admin so any future
      // /admin-* marketing page won't repeat this.
      const isAdminPath = path === "/admin" || path.startsWith("/admin/");
      const isDriverPath =
        path === "/driver" || path.startsWith("/driver/");
      const isRiderPath = path === "/rider" || path.startsWith("/rider/");

      // Public marketing pages (/, /how-it-works, /driver-join,
      // /driver-jobs-in/*, /fare-estimator, etc.) don't belong to any
      // portal, so a 401 from a stray /api/* call on them isn't a
      // signal that the visitor needs to sign in — they weren't
      // required to be signed in in the first place. Swallow it. This
      // is the actual fix for the "Become a driver bounces back" bug:
      // even with the bounded portal check above, a fallback to the
      // rider login would still ricochet the visitor away from the
      // marketing page they legitimately opened.
      if (!isAdminPath && !isDriverPath && !isRiderPath) return;

      const loginPath = isAdminPath
        ? "/auth/admin/login"
        : isDriverPath
          ? "/auth/driver/login"
          : "/auth/rider/login";

      router.replace(`${loginPath}?next=${encodeURIComponent(path)}`);
    };

    window.fetch = async (input, init) => {
      const res = await original(input, init);
      try {
        if (res.status === 401) {
          // Resolve the request URL to check it's our own /api/*.
          // Skip auth-server fetches (Supabase token refresh, etc.).
          const url = (() => {
            if (typeof input === "string") return input;
            if (input instanceof URL) return input.toString();
            if (input instanceof Request) return input.url;
            return "";
          })();
          const isApiCall =
            url.startsWith("/api/") ||
            url.startsWith(`${window.location.origin}/api/`);
          if (isApiCall) {
            handle401();
          }
        }
      } catch {
        /* never let the guard break the response */
      }
      return res;
    };

    return () => {
      window.fetch = original;
    };
  }, [pathname, router]);

  return null;
}
