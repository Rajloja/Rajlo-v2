import { createSupabaseAuthServerClient } from "./supabase-auth-server";

/**
 * Resolves the right destinations for the public landing-page CTAs
 * ("Book a ride" / "Drive with Rajlo") based on who's signed in.
 *
 * The principle: a visitor — anonymous or signed in — should always
 * land on a USEFUL page, never a barrier. Specifically:
 *
 *   "Book a ride" / "Find a ride" / "Start riding" (all rider CTAs)
 *     - signed in as rider  → /rider              (their dashboard)
 *     - everyone else       → /rider/request      (the booking page,
 *                                                  which renders an
 *                                                  AnonymousBookingPrompt
 *                                                  for visitors who
 *                                                  aren't signed in
 *                                                  yet — they can see
 *                                                  the trip preview +
 *                                                  fare before being
 *                                                  asked to sign in)
 *
 *   "Drive with Rajlo"
 *     - signed in as driver → /driver             (their dashboard)
 *     - everyone else       → /driver-join        (the marketing page)
 *
 * Why this matters: before, anonymous rider CTAs bounced straight to
 * the login form, which kills first-impression conversion. Showing
 * the booking page first lets the visitor see what they're about to
 * buy + a fare estimate, then nudges sign-in via a sticky prompt
 * that round-trips the URL so they land back here after auth.
 *
 * We deliberately don't try to be clever for cross-role cases (e.g.
 * a driver tapping "Book a ride") — they fall through to the default
 * login/marketing flow, which is what they'd want anyway since their
 * driver account isn't a rider account on this platform.
 *
 * Reads through the auth client (anon key + cookies). Safe to call
 * from server components — never throws on a missing session.
 */

export type LandingCtaTargets = {
  riderHref: string;
  driverHref: string;
  /** Whether the rider button should read "My dashboard" vs "Book a ride". */
  riderIsDashboard: boolean;
  /** Whether the driver button should read "Open driver dashboard" vs "Drive with Rajlo". */
  driverIsDashboard: boolean;
};

const DEFAULTS: LandingCtaTargets = {
  // Anonymous default goes to /rider/request — the booking page
  // gracefully handles unauthenticated visitors with a sticky sign-in
  // prompt, so this is the right "default" landing for any rider CTA.
  riderHref: "/rider/request",
  driverHref: "/driver-join",
  riderIsDashboard: false,
  driverIsDashboard: false,
};

export async function getLandingCtaTargets(): Promise<LandingCtaTargets> {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return DEFAULTS;

    const { data: profile } = await auth
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role ?? "") as string;
    if (role === "rider") {
      return {
        ...DEFAULTS,
        riderHref: "/rider",
        riderIsDashboard: true,
      };
    }
    if (role === "driver") {
      return {
        ...DEFAULTS,
        driverHref: "/driver",
        driverIsDashboard: true,
      };
    }
    return DEFAULTS;
  } catch {
    // Cookie parse error / Supabase outage — never block the landing
    // page on this. Fall back to the defaults so the page still works.
    return DEFAULTS;
  }
}
