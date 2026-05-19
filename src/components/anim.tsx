"use client";

import {
  m,
  useInView,
  useMotionValue,
  useSpring,
  animate,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isNativeApp } from "@/lib/native";

/* ────────────────────────────────────────────────
 * Performance discipline:
 *   - All animations animate only `transform` and `opacity` (GPU-accelerated).
 *   - Every scroll-triggered animation uses `viewport={{ once: true }}` so
 *     they run exactly once per page load.
 *   - `useReducedMotion()` from motion/react returns true if the user has
 *     `prefers-reduced-motion: reduce` — we shorten/omit motion in that case.
 *   - We keep durations under 800ms.
 * ──────────────────────────────────────────────── */

const easing = [0.22, 1, 0.36, 1] as const; // smooth easeOutCubic

/**
 * True when entrance animations should be SKIPPED entirely — content
 * just appears at its final state.
 *
 * Two cases:
 *   - the user asked for reduced motion, or
 *   - we're inside the Capacitor native app.
 *
 * The native case is the important one: a native app's screens appear
 * instantly. Replaying a 0.6s fade-and-slide (staggered across every
 * section) on every single tab switch makes a fully-loaded page read
 * as "still loading" for over a second. On the web the entrance
 * animation stays — it's a marketing/portal nicety there.
 */
function useInstantMotion(): boolean {
  const reduced = useReducedMotion();
  const native = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );
  return !!reduced || native;
}

/* ─────────── FadeUp ─────────── */

type FadeUpProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Pixels to translate from. Defaults to 24. */
  y?: number;
  as?: "div" | "section" | "header" | "p" | "h1" | "h2" | "h3" | "li" | "span";
};

/** Fades and slides up on mount.
 *
 * Switched from `whileInView` → `animate` so animations fire regardless of
 * scroll context. `whileInView` uses IntersectionObserver, which only fires
 * predictably when the scroll container is the document; inside a portal
 * layout where main has its own `overflow-y-auto`, the observer can fail to
 * trigger and leave everything stuck at opacity 0. */
export function FadeUp({
  children,
  delay = 0,
  className,
  y = 24,
  as = "div",
}: FadeUpProps) {
  const instant = useInstantMotion();
  const Tag = m[as];
  return (
    <Tag
      className={className}
      // `initial={false}` tells motion to render straight at the
      // final state — no entrance animation at all. That's what makes
      // native-app navigation feel instant.
      initial={instant ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={instant ? { duration: 0 } : { duration: 0.6, delay, ease: easing }}
    >
      {children}
    </Tag>
  );
}

/* ─────────── Stagger ─────────── */

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easing } },
};

/** Parent that triggers staggered children on mount.
 *
 * Same migration as FadeUp — switched from `whileInView` to `animate` so
 * the stagger always plays, even when the parent scroll container isn't
 * the document. `amount` is ignored under the new model (kept in the
 * signature so callers don't need to change). */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
}) {
  const instant = useInstantMotion();
  return (
    <m.div
      className={className}
      variants={staggerContainer}
      // `initial={false}` skips the staggered entrance — it also
      // propagates to the StaggerItem children, so they render at
      // their final state immediately in the native app.
      initial={instant ? false : "hidden"}
      animate="show"
    >
      {children}
    </m.div>
  );
}

/** Direct child of Stagger — animates as part of the stagger. */
export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "p" | "span";
}) {
  const Tag = m[as];
  return (
    <Tag className={className} variants={staggerItem}>
      {children}
    </Tag>
  );
}

/* ─────────── CountUp ─────────── */

/**
 * Animated number counter — when scrolled into view, eases from 0 to `to`.
 * Pass `prefix`/`suffix` for things like "JMD" or "+", and `decimals` for floats.
 * Plain text like "100%" or "1–4" should bypass this and just be rendered as-is.
 */
export function CountUp({
  to,
  duration = 1.4,
  prefix = "",
  suffix = "",
  className,
}: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const instant = useInstantMotion();
  const inView = useInView(ref, { once: true, margin: "0px 0px -100px 0px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (instant) {
      // Native app / reduced motion — snap straight to the final
      // number. Deferred off the synchronous effect body so React
      // 19's cascading-render lint passes.
      queueMicrotask(() => setDisplay(to));
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: easing,
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, to, duration, instant, easing]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ─────────── FloatY ─────────── */

/** Gentle continuous float for hero phone mockups. ~3s cycle, ±6px. */
export function FloatY({
  children,
  amplitude = 6,
  duration = 3.8,
  delay = 0,
  rotate = 0,
  className,
}: {
  children: ReactNode;
  amplitude?: number;
  duration?: number;
  delay?: number;
  rotate?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <div className={className} style={{ transform: `rotate(${rotate}deg)` }}>
        {children}
      </div>
    );
  }
  return (
    <m.div
      className={className}
      style={{ rotate, willChange: "transform" }}
      animate={{ y: [-amplitude, amplitude, -amplitude] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {children}
    </m.div>
  );
}

/* ─────────── WordReveal ─────────── */

/** Splits text by words and reveals each from below — used on hero headline. */
export function WordReveal({
  text,
  className,
  as = "span",
  delay = 0,
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "span" | "p";
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const Tag = m[as];
  const words = text.split(" ");

  if (reduced) {
    const Static = as as keyof React.JSX.IntrinsicElements;
    return <Static className={className}>{text}</Static>;
  }

  return (
    <Tag
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        show: { transition: { staggerChildren: 0.08, delayChildren: delay } },
      }}
    >
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <m.span
            className="inline-block"
            variants={{
              hidden: { y: "110%" },
              show: { y: 0, transition: { duration: 0.7, ease: easing } },
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </m.span>
        </span>
      ))}
    </Tag>
  );
}

/* ─────────── HoverLift ─────────── */

/** Hover wrapper — lifts + adds shadow. Drop-in replacement for plain divs in cards. */
export function HoverLift({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
    >
      {children}
    </m.div>
  );
}

/* ─────────── Typewriter ─────────── */

/**
 * Cycles through an array of texts with typing-in / pausing / deleting / typing-next
 * effect. Used on auth pages for the rotating brand statements.
 *
 * Performance: a single setTimeout per frame, no animation library overhead.
 * Accessibility: the visible text is `aria-hidden` (decorative); screen readers
 * read the joined `srText` if provided. Respects `prefers-reduced-motion` —
 * shows just the first text statically.
 */
export function Typewriter({
  texts,
  typingSpeed = 45,
  deletingSpeed = 25,
  holdMs = 2400,
  className,
  cursorClassName = "ml-[3px] inline-block h-[0.95em] w-[3px] translate-y-[2px] bg-current align-middle",
  srText,
}: {
  texts: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  holdMs?: number;
  className?: string;
  cursorClassName?: string;
  srText?: string;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");

  useEffect(() => {
    if (reduced) return;
    const target = texts[index];
    let t: ReturnType<typeof setTimeout> | undefined;

    if (phase === "typing") {
      if (text.length < target.length) {
        t = setTimeout(
          () => setText(target.slice(0, text.length + 1)),
          typingSpeed,
        );
      } else {
        // Phase transitions inside an effect body trip the React 19
        // cascading-render lint. Deferring to a microtask keeps the
        // typewriter sequencing intact (same tick of the event loop,
        // just after the current render commits) and satisfies the
        // rule.
        queueMicrotask(() => setPhase("holding"));
      }
    } else if (phase === "holding") {
      t = setTimeout(() => setPhase("deleting"), holdMs);
    } else {
      if (text.length > 0) {
        t = setTimeout(() => setText(text.slice(0, -1)), deletingSpeed);
      } else {
        queueMicrotask(() => {
          setIndex((i) => (i + 1) % texts.length);
          setPhase("typing");
        });
      }
    }

    return () => {
      if (t) clearTimeout(t);
    };
  }, [text, phase, index, texts, typingSpeed, deletingSpeed, holdMs, reduced]);

  if (reduced) {
    return <span className={className}>{texts[0]}</span>;
  }

  return (
    <span className={className}>
      <span className="sr-only">{srText ?? texts.join(". ")}</span>
      <span aria-hidden>{text}</span>
      <m.span
        aria-hidden
        className={cursorClassName}
        animate={{ opacity: [1, 1, 0, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear", times: [0, 0.5, 0.5, 1] }}
      />
    </span>
  );
}

/* ─────────── ParallaxFloat ─────────── */

/**
 * Subtle 3D-tilt effect for hero phone mockups — tilts based on cursor position.
 * Mobile / no-pointer devices fall back to a static render.
 */
export function ParallaxFloat({
  children,
  className,
  intensity = 8,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 120, damping: 20 });
  const sy = useSpring(y, { stiffness: 120, damping: 20 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(px * intensity);
    y.set(py * intensity);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <m.div
      ref={ref}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy }}
    >
      {children}
    </m.div>
  );
}
