import { LandingV3 } from "@/components/landing-v3";
import { getLandingCtaTargets } from "@/lib/landing-cta-targets";

// Always render per-request so the CTA reflects the visitor's live
// session — see landing-v3/page.tsx for the full reasoning.
export const dynamic = "force-dynamic";

/**
 * Public landing — server component just resolves the CTA targets
 * (signed-in vs visitor) and hands off to the v3 client landing
 * (booking-widget over photo, four-photo carousel, typed headline,
 * editorial tariff section, magazine mode spreads, bento why-grid,
 * brand-red closer). The legacy v2 component is still in tree for
 * rollback if needed; remove once v3 has soaked in production.
 */
export default async function Home() {
  const cta = await getLandingCtaTargets();
  return <LandingV3 cta={cta} />;
}
