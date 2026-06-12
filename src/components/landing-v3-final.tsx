"use client";

import Link from "next/link";
import { m, useReducedMotion } from "motion/react";
import { Icon } from "./icons";
import {
  reveal,
  revealTransition,
  staggerParent,
  hoverLift,
  hoverLiftTransition,
  tapDown,
} from "@/lib/animations";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Landing v3 — §8 Final CTA.
 *
 * Single brand-red panel. Drenched, not restrained — this is the
 * one place on the page where the brand is allowed to shout. The
 * preceding seven sections all sit on lighter or darker
 * backgrounds; this one IS the brand color, full-bleed, framing
 * the last word.
 *
 * Composition:
 *   - centered single-column
 *   - large display headline
 *   - one short closing line
 *   - dual CTA, rider primary (white on brand-red) + driver
 *     secondary (outline on brand-red)
 *
 * Anti-patterns deliberately avoided:
 *   - no newsletter signup (off-strategy for a launching rideshare)
 *   - no "trusted by" logo strip (we have no logos to claim yet)
 *   - no closing testimonial (banned per day-one-honest)
 *   - no contact form (not the conversion this page is optimising)
 */
export function LandingV3Final({ cta }: { cta: LandingCtaTargets }) {
  const reduce = useReducedMotion();

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 10% -10%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%), radial-gradient(circle at 100% 110%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 50%), linear-gradient(160deg, #f10100 0%, #d40100 55%, #a30000 100%)",
      }}
    >
      {/* Subtle texture — a ghost wordmark behind the content. Same
         move as the hero's giant Rajlo word, but quieter here so the
         eye lands on the CTA, not the decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-4 -top-8 select-none text-[20vw] font-extrabold leading-none tracking-tighter text-white/[0.05] md:text-[12rem] lg:-left-12"
      >
        Rajlo
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center md:py-32 lg:py-40">
        <m.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.4 }}
          variants={staggerParent}
        >
          <m.h2
            variants={reveal}
            transition={revealTransition}
            className="text-[clamp(2.5rem,4vw+1rem,5rem)] font-extrabold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]"
          >
            Top up. Pick a route.
            <br />
            <span className="text-white/80">Pay nothing at the curb.</span>
          </m.h2>

          <m.p
            variants={reveal}
            transition={revealTransition}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/85 [text-wrap:pretty] md:text-lg"
          >
            The same wallet. The same fare every time. The same drivers, all
            verified. The way Jamaica should move.
          </m.p>

          <m.div
            variants={reveal}
            transition={revealTransition}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <m.div
              whileHover={hoverLift}
              whileTap={tapDown}
              transition={hoverLiftTransition}
            >
              <Link
                href={cta.riderHref}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-extrabold text-rajlo-red shadow-2xl shadow-black/30 transition-all hover:bg-white/95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:text-base"
              >
                {cta.riderIsDashboard ? "Open my dashboard" : "Start riding"}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </m.div>
            <m.div
              whileHover={hoverLift}
              whileTap={tapDown}
              transition={hoverLiftTransition}
            >
              <Link
                href={cta.driverHref}
                className="group inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/10 px-7 py-4 text-sm font-extrabold text-white backdrop-blur transition-colors hover:border-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:text-base"
              >
                {cta.driverIsDashboard ? "Driver dashboard" : "Drive with Rajlo"}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </m.div>
          </m.div>

          {/* Closing brand sign-off — small, single line, all the
             page has to say after this is the footer. */}
          <m.p
            variants={reveal}
            transition={revealTransition}
            className={`mt-12 font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-white/65 md:text-[11px] ${
              reduce ? "" : "transition-opacity"
            }`}
          >
            Rajlo · Let&apos;s go!
          </m.p>
        </m.div>
      </div>
    </section>
  );
}
