/**
 * Single source of truth for landing-v3 motion variants.
 *
 * Per design-system/MASTER.md §5: every reveal across landing-v3 uses
 * the canonical "Jakub" recipe (opacity + tiny y-translate + blur). All
 * variants live here so a future tuning pass moves one number, not 20.
 *
 * Component code should NEVER define ad-hoc initial/animate inline —
 * import a variant from this file or add one here first.
 *
 * Reduced-motion handling: components that consume these variants are
 * responsible for either gating the animation behind
 * `useReducedMotion()` or wrapping the motion element in a primitive
 * (FadeUp, etc.) that already short-circuits to instant when the user
 * prefers reduced motion. Variants themselves stay live so the
 * one-line gate is easy to reason about per component.
 */

import type { Transition, Variants } from "motion/react";

/** Canonical entrance reveal — opacity + 8px lift + 4px blur,
 *  released with a fast non-bouncing spring. Approved in MASTER §5.2. */
export const reveal: Variants = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export const revealTransition: Transition = {
  type: "spring",
  duration: 0.45,
  bounce: 0,
};

/** Staggered children — set on a parent `motion.div` so child reveals
 *  fire in cadence. Default delay between siblings is intentionally
 *  short so a stagger feels like rhythm, not a slideshow. */
export const staggerParent: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

/** Wider lift — for big editorial moments like the hero photo frame or
 *  full-bleed pillar tiles. Same recipe, deeper translate. */
export const revealLarge: Variants = {
  initial: { opacity: 0, y: 24, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export const revealLargeTransition: Transition = {
  type: "spring",
  duration: 0.7,
  bounce: 0,
};

/** Float-Y loop — ambient idle motion for the hero phone overlap.
 *  Loop motion is disabled entirely under prefers-reduced-motion;
 *  the component using this is responsible for that guard. */
export const floatYLoop = {
  y: [-6, 6, -6],
  transition: {
    duration: 4.5,
    ease: "easeInOut" as const,
    repeat: Infinity,
    repeatType: "loop" as const,
  },
};

/** Hover lift for interactive surfaces — used via `whileHover` on
 *  CTAs, cards, and pillar tiles. Pure transform, never layout. */
export const hoverLift = { y: -2 };
export const hoverLiftTransition: Transition = {
  type: "spring",
  duration: 0.2,
  bounce: 0.2,
};

/** Tap-down for buttons — small inset so the press feels real
 *  without a layout jolt. */
export const tapDown = { scale: 0.97 };

/** Marquee — used by the trust strip if we ship one. NOT used by
 *  default per the "no AI scroller" rule; kept here for future use. */
export const marqueeTransition: Transition = {
  duration: 30,
  ease: "linear",
  repeat: Infinity,
};
