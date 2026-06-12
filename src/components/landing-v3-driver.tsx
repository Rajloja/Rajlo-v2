"use client";

import Link from "next/link";
import Image from "next/image";
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
import { PHOTOS, BRAND_FALLBACK_BG } from "./landing-assets";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Landing v3 — §6 Driver recruitment.
 *
 * Full-bleed driver photo carries the section. Content sits in a
 * left-aligned content stack overlaid on the photo with a dark
 * gradient pulled in from the left edge for legibility. The right
 * side stays photographic so the driver IS the section, not an
 * abstract decoration.
 *
 * Tone: warm, direct, day-one-honest. No earnings claims with
 * specific numbers (PRODUCT.md rules that out — we're pre-traction).
 * The proof is the *mechanism*: dual-mode, transparent commission,
 * weekly bank payouts.
 *
 * Structurally different from every other dark section on the page:
 *   - §1 Hero is brand-black with bloom + search composition
 *   - §4 How-it-works is brand-black with bloom + three-step row
 *   - §6 Driver (this) is FULL-BLEED PHOTOGRAPHIC, not gradient
 *
 * One section, one job: get a TA-licensed PPV driver to tap
 * "Drive with Rajlo".
 */
export function LandingV3Driver({ cta }: { cta: LandingCtaTargets }) {
  const reduce = useReducedMotion();

  const BENEFITS = [
    "Both modes — private fares + route-taxi corridors",
    "Transparent commission, no hidden take-rates",
    "Weekly payouts to any Jamaican bank, OTP-verified",
    "Built-in turn-by-turn navigation + voice prompts",
  ];

  return (
    <section className="relative isolate overflow-hidden bg-rajlo-black text-white">
      {/* Photographic base layer */}
      <div
        className="absolute inset-0"
        style={{ background: BRAND_FALLBACK_BG }}
      >
        <Image
          src={PHOTOS.driverHero}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      {/* Left-anchored gradient — pulls the content side toward dark
         without darkening the photo on the right. The right edge
         keeps photographic detail so the driver remains the subject. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-rajlo-black via-rajlo-black/85 to-rajlo-black/15"
      />
      {/* Brand-red bloom from the bottom-left — same vocabulary as
         the hero/how panels so the section reads as part of the same
         family. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 0% 100%, rgba(241,1,0,0.30) 0%, rgba(241,1,0,0) 45%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32 lg:px-12 lg:py-40">
        <m.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerParent}
          className="max-w-2xl"
        >
          {/* Eyebrow used here is the SECOND of two on the entire
             page (MASTER §2.3 budgets two). Earned: it identifies
             the audience switch — the page has been talking to
             riders until this point, this section pivots to drivers. */}
          <m.div variants={reveal} transition={revealTransition}>
            <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-xs">
              Drive with Rajlo
            </p>
          </m.div>

          <m.h2
            variants={reveal}
            transition={revealTransition}
            className="mt-5 text-[clamp(2.25rem,3.5vw+1rem,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.03em] [text-wrap:balance]"
          >
            Your car. Your hours.
            <br />
            <span className="text-rajlo-red">Your money.</span>
          </m.h2>

          <m.p
            variants={reveal}
            transition={revealTransition}
            className="mt-6 max-w-xl text-base leading-relaxed text-white/85 [text-wrap:pretty] md:text-lg"
          >
            Use your own car, set your own hours, take both private rides
            and shared route-taxi trips from one app. The same wallet that
            pays your riders is the wallet that pays you, weekly, to your
            bank.
          </m.p>

          {/* Benefits list — flat list, NOT a checkbox grid (banned
             AI-grammar shape). Bullets are typographic dots, not
             icons; the eye reads the line, not the marker. */}
          <m.ul
            variants={reveal}
            transition={revealTransition}
            className="mt-8 space-y-3 text-base text-white/90 md:text-lg"
          >
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3 leading-relaxed">
                <span
                  aria-hidden
                  className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rajlo-red"
                />
                {b}
              </li>
            ))}
          </m.ul>

          <m.div
            variants={reveal}
            transition={revealTransition}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <m.div
              whileHover={hoverLift}
              whileTap={tapDown}
              transition={hoverLiftTransition}
            >
              <Link
                href={cta.driverHref}
                className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-7 py-4 text-sm font-extrabold text-white shadow-2xl shadow-rajlo-red/40 transition-colors hover:bg-primary-hover hover:shadow-rajlo-red/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:text-base"
              >
                {cta.driverIsDashboard
                  ? "Open driver dashboard"
                  : "Start the application"}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </m.div>
            <Link
              href="/driver-join"
              className={`inline-flex items-center gap-1 rounded-sm text-sm font-bold text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${
                reduce ? "" : "underline-offset-4 hover:underline"
              }`}
            >
              See requirements →
            </Link>
          </m.div>
        </m.div>
      </div>
    </section>
  );
}
