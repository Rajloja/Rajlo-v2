"use client";

import Link from "next/link";
import { m, useReducedMotion } from "motion/react";
import { Icon } from "./icons";
import { reveal, revealTransition, staggerParent } from "@/lib/animations";
import {
  calculateRouteFare,
  calculateRouteFareDetailed,
  getRouteTaxiTariff,
} from "@/lib/fare-engine";
import { formatJMD } from "@/lib/jamaica";

/**
 * Landing v3 — §3 TA tariff editorial moment.
 *
 * Pulls the regulation story OUT of the footer fine-print and gives
 * it page weight. PRODUCT.md design principle #2 says "show the
 * regulation, don't whisper it" — this is where we make good on that.
 *
 * Composition (intentionally NOT a card, NOT a chart, NOT a table):
 *
 *   [section header — one sentence]
 *
 *   ─────────── horizontal rule ───────────
 *
 *        BASE              PER KM
 *        $132.00           $8.64        <- huge display numbers in brand red
 *
 *   ─────────── horizontal rule ───────────
 *
 *   [editorial paragraph explaining the formula]
 *
 *   [worked example — real route, real math, computed live from the
 *    fare engine so the answer is verifiable, not invented]
 *
 *   [tertiary link to the full TA schedule]
 *
 * Tone: magazine pull-quote. The numbers carry the visual weight; the
 * surrounding prose is quiet and direct. Background is `--background`
 * (pure white in light theme, deep neutral in dark) — deliberately
 * the calmest tonal moment on the page, sitting between the colored
 * mode panels above and the visual density that comes after.
 *
 * No counter animation on the numbers — they're real, they don't
 * need theatre. PRODUCT.md day-one-honest principle.
 */
export function LandingV3Tariff() {
  const reduce = useReducedMotion();
  const tariff = getRouteTaxiTariff();

  // Worked-example distance — 12 km is a realistic mid-island corridor
  // (Half-Way Tree → NMIA is ~14.7 km; Half-Way Tree → Papine is 8.6).
  // Using a clean integer keeps the math easy to follow visually.
  const EXAMPLE_KM = 12;
  const example = calculateRouteFareDetailed(EXAMPLE_KM);
  const exampleFare = calculateRouteFare(EXAMPLE_KM);

  return (
    <section
      aria-labelledby="tariff-heading"
      className="relative bg-background py-24 md:py-32 lg:py-40"
    >
      <div className="mx-auto max-w-3xl px-6 lg:max-w-4xl lg:px-12">
        <m.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerParent}
        >
          {/* Section headline — direct sentence, no eyebrow. The
             "regulation" word does heavy lifting; we don't need a
             tracked-uppercase scaffold above it. */}
          <m.h2
            id="tariff-heading"
            variants={reveal}
            transition={revealTransition}
            className="text-[clamp(2rem,3vw+1rem,3.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground [text-wrap:balance]"
          >
            What you pay is what the
            <br className="hidden md:block" /> <span className="text-rajlo-red">law says.</span>
          </m.h2>

          {/* Pull-quote rule line above the numbers. A 1-pixel
             horizontal line is the editorial-magazine signal that
             "the next block is the quote pulled out of the
             paragraph". */}
          <m.div
            variants={reveal}
            transition={revealTransition}
            className="mt-14 border-t border-line pt-10 md:mt-20 md:pt-14"
          >
            {/* The numbers. Real, computed live from the fare engine
               so a tariff-phase rollover automatically refreshes
               this display. */}
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 md:gap-x-16">
              <div>
                <dt className="font-secondary text-xs font-extrabold uppercase tracking-[0.3em] text-muted">
                  Base fare
                </dt>
                <dd className="mt-3 text-[clamp(3rem,5vw+1rem,5.5rem)] font-extrabold leading-none tracking-[-0.04em] text-rajlo-red tabular-nums">
                  ${tariff.baseRateJmd.toFixed(0)}
                </dd>
              </div>
              <div>
                <dt className="font-secondary text-xs font-extrabold uppercase tracking-[0.3em] text-muted">
                  Per kilometre
                </dt>
                <dd className="mt-3 text-[clamp(3rem,5vw+1rem,5.5rem)] font-extrabold leading-none tracking-[-0.04em] text-rajlo-red tabular-nums">
                  ${tariff.perKmRateJmd.toFixed(2)}
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-sm text-muted">
              {tariff.label}. Effective from{" "}
              <span className="font-semibold text-foreground">
                {formatEffectiveDate(tariff.effectiveFrom)}
              </span>
              .
            </p>
          </m.div>

          {/* Editorial paragraph + worked example. */}
          <m.div
            variants={reveal}
            transition={revealTransition}
            className="mt-12 border-t border-line pt-10 md:mt-16 md:pt-14"
          >
            <p className="max-w-2xl text-base leading-relaxed text-foreground [text-wrap:pretty] md:text-lg">
              Rajlo&apos;s route-taxi fares are anchored to the official
              Transport Authority of Jamaica tariff. Every fare is the
              same formula every time: base, plus kilometres at the
              per-km rate, rounded to the nearest{" "}
              <span className="font-bold text-rajlo-red">$10</span>.
            </p>

            {/* Worked example block. Renders as inline math, NOT a
               table. The intermediate (`unrounded`) result and the
               final (`rounded`) result both come from the engine so
               the page is provably correct. */}
            <div className="mt-8 rounded-2xl border border-line bg-surface-soft p-6 md:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
                A {EXAMPLE_KM} km trip from Half-Way Tree to NMIA
              </p>
              <p className="mt-5 break-words font-mono text-base font-semibold text-foreground tabular-nums md:text-lg">
                <span className="text-rajlo-red">
                  ${tariff.baseRateJmd.toFixed(0)}
                </span>{" "}
                +{" "}
                <span className="text-rajlo-red">
                  ({EXAMPLE_KM} × ${tariff.perKmRateJmd.toFixed(2)})
                </span>{" "}
                = ${example.rawFareJmd.toFixed(2)}
              </p>
              <p className="mt-3 text-sm text-muted">
                rounded to the nearest $10 →{" "}
                <span className="text-base font-extrabold text-rajlo-red">
                  {formatJMD(exampleFare)}
                </span>
              </p>
            </div>

            <p className="mt-8 max-w-2xl text-base leading-relaxed text-foreground [text-wrap:pretty] md:text-lg">
              No surge pricing. No haggling. No &ldquo;for-you&rdquo;
              experiments. The math is published.{" "}
              <Link
                href="/fare-estimator"
                className={`inline-flex items-center gap-1 rounded-sm font-bold text-rajlo-red transition-colors hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rajlo-red ${
                  reduce ? "" : "underline-offset-4 hover:underline"
                }`}
              >
                See the full fare estimator
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </p>
          </m.div>
        </m.div>
      </div>
    </section>
  );
}

/**
 * Format the ISO effective-from date into something a reader can
 * understand at a glance (e.g. "June 2, 2026"). Keeps the date
 * formatting local to this section so the fare engine stays UI-free.
 */
function formatEffectiveDate(iso: string): string {
  const [year, month, day] = iso.split("-").map((s) => parseInt(s, 10));
  if (!year || !month || !day) return iso;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[month - 1]} ${day}, ${year}`;
}
