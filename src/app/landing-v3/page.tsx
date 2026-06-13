import type { Metadata } from "next";
import { LandingV3 } from "@/components/landing-v3";
import { getLandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Preview route for the landing-page redesign.
 *
 * The current production landing renders from `src/components/landing-v2.tsx`
 * via the root `/` route. This sibling route lets us iterate on v3 in
 * isolation — point it at `/landing-v3` to compare side-by-side before
 * the cut-over. When v3 ships, this file becomes a one-line proxy to
 * the same component the root page renders, or the root page swaps
 * imports.
 *
 * Workflow source: PRODUCT.md + design-system/MASTER.md. Every visual
 * decision in the tree under this route cites a token from MASTER.
 */
export const metadata: Metadata = {
  title: "Rajlo — Ride. Drive. Move.",
  description:
    "Private rides and TA-tariff route taxis from one wallet. Verified drivers. Made for Jamaica.",
};

// Always render per-request so the CTA reflects the visitor's live
// session. Without this, Next.js 16 may partially prerender and
// freeze the "not signed in" CTA values into the cached HTML, which
// shows up as "I logged in but Find a Ride still bounces me to
// /auth/rider/login". `getLandingCtaTargets` reads cookies(), but
// the directive removes any ambiguity.
export const dynamic = "force-dynamic";

export default async function LandingV3Page() {
  const cta = await getLandingCtaTargets();
  return <LandingV3 cta={cta} />;
}
