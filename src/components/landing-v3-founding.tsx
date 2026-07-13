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
 * Landing v3 — §7 Founding users.
 *
 * Replaces the testimonial carousel pattern (which would require
 * inventing quotes pre-launch — banned per PRODUCT.md day-one-honest
 * principle). Instead, two NON-IDENTICAL panels frame the moment
 * honestly: "we are brand new; help us shape this."
 *
 * Why non-identical, not a two-card grid:
 *   - Left panel ("For riders") is light-surface, large headline
 *     leads, body sits beneath, CTA at the bottom.
 *   - Right panel ("For drivers") is brand-black with a red bloom
 *     in the top-right corner, mirrors the hero treatment so the
 *     section closes the page with the same visual vocabulary it
 *     opened in.
 *
 * Same eye level, two different shapes, two different palettes.
 * Carries the "Two modes are equals" principle (PRODUCT.md #3) by
 * giving both audiences a real entry-point rather than burying the
 * driver CTA under the rider one.
 */
export function LandingV3Founding({ cta }: { cta: LandingCtaTargets }) {
  const reduce = useReducedMotion();

  return (
    <section className="relative bg-background py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <m.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerParent}
        >
          {/* Section framing — no eyebrow. Two short, declarative
             sentences. Centered on lg+ so the panels below balance
             around the same axis. */}
          <m.div
            variants={reveal}
            transition={revealTransition}
            className="mx-auto max-w-3xl text-center"
          >
            <h2 className="text-[clamp(2rem,3vw+1rem,3.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground [text-wrap:balance]">
              Be part of building{" "}
              <span className="text-rajlo-red">Jamaica&apos;s future</span>
            </h2>
          </m.div>

          {/* Two non-identical panels. Grid sizes differ on lg+ —
             rider panel takes 0.9fr, driver panel takes 1.1fr —
             so neither feels like a copy of the other. On mobile
             they stack 1-col, full-width. */}
          <div className="mt-14 grid gap-5 md:mt-16 md:gap-6 lg:grid-cols-2">
            {/* RIDER panel — light surface, simple typography lead */}
            <m.div
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 24, filter: "blur(6px)" }
              }
              whileInView={
                reduce
                  ? undefined
                  : { opacity: 1, y: 0, filter: "blur(0px)" }
              }
              viewport={{ once: true, amount: 0.3 }}
              transition={{ type: "spring", duration: 0.6, bounce: 0 }}
              className="relative flex flex-col rounded-3xl border border-line bg-surface p-8 shadow-sm md:p-10 lg:p-12"
            >
              <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red md:text-xs">
                Private ride
              </p>
              <h3 className="mt-3 text-[clamp(1.75rem,2vw+1rem,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]">
                Door-to-door, just you.
              </h3>
              <p className="mt-4 flex-1 text-base leading-relaxed text-muted [text-wrap:pretty]">
                Choose your pickup and drop-off, see your fare upfront, and
                ride with secure wallet payments and PIN verification.
              </p>
              <m.div
                whileHover={hoverLift}
                whileTap={tapDown}
                transition={hoverLiftTransition}
                className="mt-8 inline-block"
              >
                <Link
                  href={cta.riderHref}
                  className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-extrabold text-white shadow-md shadow-rajlo-red/30 transition-colors hover:bg-primary-hover hover:shadow-rajlo-red/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rajlo-red"
                >
                  Book a ride
                  <Icon
                    name="arrow-right"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </m.div>
            </m.div>

            {/* DRIVER panel — brand-black with red bloom, taller via
               the 1.1fr column and bigger inner padding so the size
               difference reads at a glance. */}
            <m.div
              initial={
                reduce
                  ? false
                  : { opacity: 0, y: 24, filter: "blur(6px)" }
              }
              whileInView={
                reduce
                  ? undefined
                  : { opacity: 1, y: 0, filter: "blur(0px)" }
              }
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                type: "spring",
                duration: 0.6,
                bounce: 0,
                delay: 0.08,
              }}
              className="relative flex flex-col overflow-hidden rounded-3xl p-8 text-white shadow-2xl md:p-10 lg:p-14"
              style={{
                background:
                  "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.35) 0%, rgba(241,1,0,0) 50%), linear-gradient(165deg, #1a1d10 0%, #111906 60%, #07090a 100%)",
              }}
            >
              <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red md:text-xs">
                Route taxi
              </p>
              <h3 className="mt-3 text-[clamp(1.75rem,2vw+1rem,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] [text-wrap:balance]">
                Hop the corridor.
              </h3>
              <p className="mt-4 flex-1 text-base leading-relaxed text-white/80 [text-wrap:pretty]">
                Same local fare. No waiting at stops, your next route taxi
                comes to you, and drops you off at your exact location along
                the route. Cashless.
              </p>
              <m.div
                whileHover={hoverLift}
                whileTap={tapDown}
                transition={hoverLiftTransition}
                className="mt-8 inline-block"
              >
                <Link
                  href={`${cta.riderHref}?mode=route_taxi`}
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-rajlo-red shadow-md shadow-black/30 transition-all hover:bg-white/95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Find a route
                  <Icon
                    name="arrow-right"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </m.div>
            </m.div>
          </div>

          {/* Honest trust strip — small horizontal line of factual
             claims under the panels. NOT a counter strip, NOT
             "trusted by X" badges. Each line is a real product
             constraint that holds on day one. */}
          <m.div
            variants={reveal}
            transition={revealTransition}
            className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-line pt-8 text-[11px] font-bold uppercase tracking-[0.2em] text-muted md:text-xs md:tracking-[0.3em]"
          >
            <span>TA-licensed PPV fleet</span>
            <span aria-hidden>·</span>
            <span>Wallet-only · no cash</span>
            <span aria-hidden>·</span>
            <span>End-to-end encrypted chats</span>
            <span aria-hidden>·</span>
            <span>24/7 in-app safety line</span>
          </m.div>
        </m.div>
      </div>
    </section>
  );
}
