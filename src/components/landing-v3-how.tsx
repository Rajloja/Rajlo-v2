"use client";

import { m, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./icons";
import { reveal, revealTransition, staggerParent } from "@/lib/animations";

/**
 * Landing v3 — §4 How it works.
 *
 * Three-step horizontal flow on lg+, vertical stack on mobile.
 *
 * Critically: NO 01/02/03 numbered chrome (banned per MASTER §8).
 * The sequence is carried by:
 *   - left-aligned scale shift (each step's icon block is the same
 *     size but each title slightly de-emphasises through the row)
 *   - horizontal arrow connectors on lg+ (the actual visual sequence
 *     primitive — points the eye from step to step)
 *   - vertical line on mobile (same purpose, rotated)
 *
 * This is an EARNED sequence (a real three-step user flow), so the
 * connectors are voice, not AI scaffold. We just don't need numbers
 * on top of the connectors.
 *
 * Tonal pick: dark panel mirrors the hero bottom so the rhythm of
 * the page reads as `dark → light/colored → light → dark → light…`
 * rather than monotonous. Brand-black surface + light ink.
 */
export function LandingV3How() {
  const reduce = useReducedMotion();

  const STEPS: Array<{
    icon: IconName;
    title: string;
    body: string;
  }> = [
    {
      icon: "wallet",
      title: "Top up your wallet",
      body: "Fund your Rajlo balance with a card or QR top-up from any partner retailer. Every trip settles from this balance.",
    },
    {
      icon: "search",
      title: "Pick your trip",
      body: "Door-to-door private ride, or hop the next route-taxi corridor going your way. Fare is shown before you confirm.",
    },
    {
      icon: "check-circle",
      title: "Pay nothing at the curb",
      body: "Trip ends, fare auto-settles from your wallet. No cash, no tipping math, no haggling. Receipt lands in your history instantly.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-rajlo-black py-24 text-white md:py-32 lg:py-40">
      {/* Subtle red bloom on the right so the dark panel doesn't read
         as flat. Different position from the hero's bloom so the two
         dark moments don't look identical at a glance. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 90% 10%, rgba(241,1,0,0.18) 0%, rgba(241,1,0,0) 45%), radial-gradient(circle at 10% 110%, rgba(241,1,0,0.10) 0%, rgba(241,1,0,0) 40%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-12">
        <m.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerParent}
        >
          {/* Section headline — direct, no eyebrow above. */}
          <m.h2
            variants={reveal}
            transition={revealTransition}
            className="max-w-3xl text-[clamp(2rem,3vw+1rem,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] [text-wrap:balance]"
          >
            Three steps from{" "}
            <span className="text-rajlo-red">install</span> to riding.
          </m.h2>
          <m.p
            variants={reveal}
            transition={revealTransition}
            className="mt-5 max-w-xl text-base leading-relaxed text-white/70 [text-wrap:pretty] md:text-lg"
          >
            No phone numbers to verify off-platform. No cash in the door.
            No driver bargaining for the meter.
          </m.p>

          {/* Steps grid. lg+: 3 columns with arrow connectors between
             them. Mobile: vertical stack with a left rule. */}
          <div className="relative mt-16 grid gap-12 md:mt-20 lg:grid-cols-3 lg:gap-8">
            {STEPS.map((step, i) => (
              <m.div
                key={step.title}
                initial={
                  reduce
                    ? false
                    : { opacity: 0, y: 16, filter: "blur(4px)" }
                }
                whileInView={
                  reduce
                    ? undefined
                    : { opacity: 1, y: 0, filter: "blur(0px)" }
                }
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  type: "spring",
                  duration: 0.5,
                  bounce: 0,
                  delay: i * 0.1,
                }}
                className="relative"
              >
                {/* Icon block — same size across all three so the
                   sequence is read by position (left → right), not by
                   visual hierarchy of the icons themselves. */}
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rajlo-red text-white shadow-lg shadow-rajlo-red/30">
                  <Icon name={step.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-6 text-2xl font-extrabold tracking-[-0.02em] md:text-[clamp(1.5rem,1.5vw+1rem,2rem)] [text-wrap:balance]">
                  {step.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-white/75 [text-wrap:pretty]">
                  {step.body}
                </p>

                {/* Horizontal arrow connector to the NEXT step on lg+.
                   Sits at the icon's vertical centre. Skipped on the
                   last step. Mobile: a small vertical line replaces it
                   below the body copy. */}
                {i < STEPS.length - 1 && (
                  <>
                    <span
                      aria-hidden
                      className="absolute right-0 top-7 hidden translate-x-1/2 items-center text-rajlo-red lg:flex"
                    >
                      <svg
                        viewBox="0 0 60 12"
                        className="h-3 w-12 fill-none stroke-current"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      >
                        <line x1="2" y1="6" x2="48" y2="6" />
                        <path d="M40 1 L52 6 L40 11" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span
                      aria-hidden
                      className="ml-7 mt-6 block h-8 w-px bg-rajlo-red/40 lg:hidden"
                    />
                  </>
                )}
              </m.div>
            ))}
          </div>
        </m.div>
      </div>
    </section>
  );
}
