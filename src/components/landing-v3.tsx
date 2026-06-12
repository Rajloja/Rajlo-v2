import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { LandingV3Hero } from "./landing-v3-hero";
import { LandingV3Modes } from "./landing-v3-modes";
import { LandingV3Tariff } from "./landing-v3-tariff";
import { LandingV3How } from "./landing-v3-how";
import { LandingV3Why } from "./landing-v3-why";
import { LandingV3Driver } from "./landing-v3-driver";
import { LandingV3Founding } from "./landing-v3-founding";
import { LandingV3Final } from "./landing-v3-final";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Landing page — v3 redesign.
 *
 * Server-component shell. Renders the eight-section page shape
 * confirmed in `design-system/MASTER.md` §7. Only §1 Hero and the
 * client sections (Modes, Tariff, How, Why, Driver, Founding,
 * Final) carry motion islands; the shell itself ships zero JS.
 *
 * Section order (do not reorder without re-shaping MASTER §7 first):
 *
 *   1. Hero       — search-first; the input IS the product
 *   2. Modes      — alternating magazine spreads, not a card grid
 *   3. Tariff     — editorial pull-quote with the real TA numbers
 *   4. How it works — 3-step horizontal flow, no 01/02/03 chrome
 *   5. Why Rajlo  — 4-tile bento grid (asymmetric, not 2x2)
 *   6. Driver     — full-bleed photo + driver CTA
 *   7. Founding   — two non-identical panels, replaces fake quotes
 *   8. Final CTA  — single brand-red panel, dual CTA
 *
 * Tonal rhythm across the page (deliberately varied):
 *   §1 dark · §2 light · §3 light · §4 dark · §5 light · §6 dark
 *   · §7 light · §8 brand-red drench
 *
 * Anti-patterns enforced structurally:
 *   - No identical card grids anywhere
 *   - No 01/02/03 numbered scaffolding
 *   - Only two eyebrows total (hero pill + driver section pivot)
 *   - No cream / sand body backgrounds
 *   - No fake metrics, no fake testimonials
 *
 * Source of truth: design-system/MASTER.md. Every visual decision
 * downstream cites a token from that file.
 */
export function LandingV3({ cta }: { cta: LandingCtaTargets }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader
        bookHref={cta.riderHref}
        bookLabel={cta.riderIsDashboard ? "Open dashboard" : "Book a ride"}
        transparentOverDark
      />

      {/* §1 Hero — client island (search input + filtered suggestions) */}
      <LandingV3Hero cta={cta} />

      {/* §2 Modes — three alternating magazine spreads */}
      <LandingV3Modes cta={cta} />

      {/* §3 TA tariff editorial moment — surfaces the regulation */}
      <LandingV3Tariff />

      {/* §4 How it works — three-step flow, no numbered chrome */}
      <LandingV3How />

      {/* §5 Why Rajlo — bento-asymmetric 4-tile grid */}
      <LandingV3Why />

      {/* §6 Driver recruitment — full-bleed photographic */}
      <LandingV3Driver cta={cta} />

      {/* §7 Founding users — two non-identical panels */}
      <LandingV3Founding cta={cta} />

      {/* §8 Final CTA — single brand-red drench */}
      <LandingV3Final cta={cta} />

      <SiteFooter />
    </div>
  );
}
