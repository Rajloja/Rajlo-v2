"use client";

import Link from "next/link";
import Image from "next/image";
import { m, useReducedMotion } from "motion/react";
import { Icon } from "./icons";
import { reveal, revealTransition, staggerParent } from "@/lib/animations";
import { PHOTOS, BRAND_FALLBACK_BG } from "./landing-assets";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Landing v3 — §2 Modes.
 *
 * Three magazine spreads. NOT a 3-card grid (banned per MASTER §6.2)
 * and NOT a 01/02/03 numbered sequence (banned per MASTER §8 — the
 * three modes are parallel choices, not an ordered process).
 *
 * Layout rule per MASTER §4.2:
 *   row 1 — image LEFT,  content RIGHT (light-surface panel)
 *   row 2 — image RIGHT, content LEFT  (brand-red panel)
 *   row 3 — image LEFT,  content RIGHT (brand-black panel)
 *
 * Each content panel OVERLAPS its image on the edge facing it, the
 * way an editorial magazine page lets caption text climb onto the
 * photo. On mobile the rows stack vertically and the overlap
 * flattens — the tonal panel sits below the image at full width.
 *
 * One framing sentence sits above the three rows. No eyebrow above
 * each row (would be AI-grammar per MASTER §2.3). No card chrome,
 * no side-stripe borders (banned).
 */
export function LandingV3Modes({ cta }: { cta: LandingCtaTargets }) {
  return (
    <section className="relative overflow-hidden bg-background py-20 md:py-28 lg:py-32">
      {/* Section framing — one direct sentence, no eyebrow. Carries
         the "two modes are equals" principle (PRODUCT.md #3) by
         actually saying it in plain language. */}
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <m.div
          initial={reveal.initial}
          whileInView={reveal.animate}
          viewport={{ once: true, amount: 0.4 }}
          transition={revealTransition}
        >
          <h2 className="max-w-3xl text-[clamp(2rem,3vw+1rem,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]">
            Two ways to ride.
            <br />
            <span className="text-rajlo-red">One way to drive.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted [text-wrap:pretty] md:text-lg">
            Pick the trip that fits the run. Both ride modes settle the same
            way — straight out of your wallet, at the fare the law says.
          </p>
        </m.div>

        {/* Three rows. Spacing between them deliberately wider than
           the section pad above so each row reads as its own
           magazine page rather than a continuous list. */}
        <div className="mt-16 space-y-20 md:mt-20 md:space-y-28 lg:space-y-32">
          <ModeRow
            tone="light"
            imageSide="left"
            image={PHOTOS.modePrivate}
            imageAlt="A driver behind the wheel of a private car in Kingston"
            kicker="Private ride"
            title="Door-to-door, just you."
            body="Pin your pickup and dropoff, see the fare upfront, pay from your wallet. Add stops mid-trip without paying twice. PIN-verify your driver before every trip."
            ctaLabel="Book a private ride"
            ctaHref={cta.riderHref}
          />
          <ModeRow
            tone="brand"
            imageSide="right"
            image={PHOTOS.modeRouteTaxi}
            imageAlt="A route taxi pulling into a Half-Way Tree stop"
            kicker="Route taxi"
            title="Hop the corridor."
            body="The official TA-anchored fare, paid by leg. Find the next driver running your route, board where you're standing, alight at your stop. Same fare you'd pay roadside — cashless."
            ctaLabel="Find a route"
            ctaHref={cta.riderHref}
          />
          <ModeRow
            tone="dark"
            imageSide="left"
            image={PHOTOS.modeDrive}
            imageAlt="A Rajlo driver checking their phone at the dashboard"
            kicker="Drive with Rajlo"
            title="Your car. Your hours."
            body="Use your own car, set your own hours, take both private rides and shared route-taxi trips from one app. Transparent commission. Weekly payouts to your Jamaican bank."
            ctaLabel="Drive with Rajlo"
            ctaHref={cta.driverHref}
          />
        </div>
      </div>
    </section>
  );
}

type ModeRowProps = {
  /** Visual tone of the content panel.
   *  - `light` — surface-soft panel on a light background. Reads as
   *    an editorial caption page.
   *  - `brand` — brand-red gradient. Reads as the brand's own voice.
   *  - `dark`  — brand-black with red bloom. Mirrors the hero so the
   *    section closes with the same density it opened in. */
  tone: "light" | "brand" | "dark";
  /** Which side the IMAGE lives on. Content takes the other side. */
  imageSide: "left" | "right";
  image: string;
  imageAlt: string;
  /** Small label above the title. NOT a tracked-uppercase eyebrow
   *  (banned per MASTER §2.3); this is a normal-case secondary
   *  display line at body-lg weight. */
  kicker: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

function ModeRow({
  tone,
  imageSide,
  image,
  imageAlt,
  kicker,
  title,
  body,
  ctaLabel,
  ctaHref,
}: ModeRowProps) {
  const reduce = useReducedMotion();

  // Tonal style for the content panel + ink colour for the body
  // copy. Each branch picks ONE source-of-truth color from the
  // tokens defined in MASTER §1.
  const panelStyle: React.CSSProperties =
    tone === "brand"
      ? {
          background:
            "linear-gradient(155deg, #f10100 0%, #d40100 55%, #a30000 100%)",
        }
      : tone === "dark"
        ? {
            background:
              "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.30) 0%, rgba(241,1,0,0) 50%), linear-gradient(165deg, #1a1d10 0%, #111906 60%, #07090a 100%)",
          }
        : { background: "var(--surface-soft)" };

  const panelInk =
    tone === "light"
      ? "text-foreground"
      : "text-white";
  const bodyInk =
    tone === "light" ? "text-muted" : "text-white/80";
  const kickerInk =
    tone === "light" ? "text-rajlo-red" : "text-white";
  const ctaInk =
    tone === "brand"
      ? "bg-white text-rajlo-red hover:bg-white/90"
      : "bg-rajlo-red text-white hover:bg-primary-hover";

  // Image+content layout. On lg+, the image takes ~58% of the row
  // width and the content panel overlaps the remaining 42% on the
  // side facing it. The overlap is achieved with a negative margin
  // on the content panel that pulls it back over the image — pure
  // visual, not a true overlay (the image still renders edge-to-edge
  // of its own column for SEO/accessibility's sake).
  const isImageLeft = imageSide === "left";

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={
        reduce
          ? undefined
          : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.3 }}
      transition={{ type: "spring", duration: 0.7, bounce: 0 }}
      className="relative grid items-center gap-0 lg:grid-cols-[1.15fr_1fr] lg:gap-0"
    >
      {/* IMAGE column */}
      <div
        className={`relative aspect-[5/4] overflow-hidden rounded-[2rem] shadow-2xl md:aspect-[16/10] ${
          isImageLeft ? "lg:order-1" : "lg:order-2"
        }`}
        style={{ background: BRAND_FALLBACK_BG }}
      >
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="(min-width: 1024px) 58vw, 100vw"
          className="object-cover transition-transform duration-[1200ms] ease-out hover:scale-[1.03]"
        />
        {/* Tonal scrim — pulls the image toward the adjacent panel's
           hue so the magazine spread reads as a single composition
           rather than two unrelated rectangles. */}
        <div
          aria-hidden
          className={`absolute inset-0 ${
            tone === "brand"
              ? "bg-gradient-to-tr from-rajlo-red/30 via-transparent to-transparent"
              : tone === "dark"
                ? "bg-gradient-to-tr from-rajlo-black/45 via-transparent to-transparent"
                : "bg-gradient-to-tr from-rajlo-black/15 via-transparent to-transparent"
          }`}
        />
      </div>

      {/* CONTENT column — the panel that does the magazine-overlap
         visual on lg+. Negative top margin on mobile so the panel
         pulls up to overlap the image; on lg+, negative horizontal
         margin pulls it INTO the image column for the magazine
         overlap. */}
      <div
        className={`relative ${
          isImageLeft
            ? "lg:order-2 lg:-ml-16 xl:-ml-24"
            : "lg:order-1 lg:-mr-16 xl:-mr-24"
        } -mt-10 px-2 md:-mt-16 md:px-4 lg:mt-0 lg:px-0`}
      >
        <div
          className={`relative overflow-hidden rounded-[2rem] p-8 shadow-2xl md:p-12 ${panelInk}`}
          style={panelStyle}
        >
          <p
            className={`font-secondary text-xs font-extrabold uppercase tracking-[0.3em] md:text-[13px] ${kickerInk}`}
          >
            {kicker}
          </p>
          <h3 className="mt-4 text-[clamp(1.75rem,2.5vw+1rem,3rem)] font-extrabold leading-[1.05] tracking-[-0.025em] [text-wrap:balance]">
            {title}
          </h3>
          <p
            className={`mt-5 max-w-md text-base leading-relaxed [text-wrap:pretty] md:text-lg ${bodyInk}`}
          >
            {body}
          </p>
          <Link
            href={ctaHref}
            className={`group mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-extrabold shadow-md transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current ${ctaInk}`}
          >
            {ctaLabel}
            <Icon
              name="arrow-right"
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </m.div>
  );
}
