import { LandingV2 } from "@/components/landing-v2";
import { getLandingCtaTargets } from "@/lib/landing-cta-targets";

// Always render per-request so the CTA reflects the visitor's live
// session — see landing-v3/page.tsx for the full reasoning.
export const dynamic = "force-dynamic";

/**
 * Public landing — server component just resolves the CTA targets
 * (signed-in vs visitor) and hands off to the client landing, which
 * owns all the GSAP animation choreography.
 */
export default async function Home() {
  const cta = await getLandingCtaTargets();
  return <LandingV2 cta={cta} />;
}
