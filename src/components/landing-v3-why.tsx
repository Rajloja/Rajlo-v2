"use client";

import Image from "next/image";
import { m, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./icons";
import { reveal, revealTransition, staggerParent } from "@/lib/animations";
import { PHOTOS, BRAND_FALLBACK_BG } from "./landing-assets";

/**
 * Landing v3 — §5 Why Rajlo.
 *
 * Four pillars rendered as a BENTO ASYMMETRIC GRID, deliberately
 * NOT a 4-card grid (banned per MASTER §6.2 and §8). Each tile has
 * a different size + a different content treatment so the grid
 * reads as composition, not as a feature dump:
 *
 *   desktop:
 *   ┌─────────────────────────┬─────────────┐
 *   │                         │             │
 *   │  SAFETY (large tile)    │  CASHLESS   │
 *   │  full-bleed photo +     │  text-      │
 *   │  text overlay           │  forward    │
 *   │                         │  panel      │
 *   ├─────────────┬───────────┴─────────────┤
 *   │  LOCAL      │  FAIR EARNINGS          │
 *   │  text-      │  full-bleed photo +     │
 *   │  forward    │  text overlay           │
 *   │  panel      │                         │
 *   └─────────────┴─────────────────────────┘
 *
 *   mobile: tiles stack 1-col. Aspect ratios collapse so each tile
 *   keeps its identity (full-bleed stays full-bleed, panels stay
 *   panels) but rhythm comes from spacing, not from columns.
 *
 * Sizes/aspect ratios are intentionally different across the four
 * tiles. There is no `repeat(4, 1fr)` anywhere in this section.
 */
/**
 * The July 2026 redesign replaced the 4-tile bento grid with a
 * single editorial intro block + a bulleted promises list. Simpler,
 * shorter, matches the design doc verbatim.
 *
 * The old PhotoTile / PanelTile primitives are kept below as unused
 * exports in case a future variant wants the bento shape back.
 * Marked internal-only via the `export function LandingV3Why`
 * signature — nothing else in the app imports the tile primitives.
 */

const PROMISES: { title: string; body: string; icon: IconName }[] = [
  {
    title: "More convenience.",
    body: "Precise pick-up and drop-off.",
    icon: "map-pin",
  },
  {
    title: "More choice.",
    body: "Private rides or shared route taxis.",
    icon: "car",
  },
  {
    title: "More for drivers.",
    body: "Fair, transparent commissions.",
    icon: "trending-up",
  },
  {
    title: "Less stress.",
    body: "No haggling. No cash.",
    icon: "wallet",
  },
  {
    title: "More peace of mind.",
    body: "Verified drivers. Secure payments.",
    icon: "shield-check",
  },
];

export function LandingV3Why() {
  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-6 lg:px-12">
        <m.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerParent}
        >
          <m.h2
            variants={reveal}
            transition={revealTransition}
            className="max-w-3xl text-[clamp(2rem,3vw+1rem,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]"
          >
            Rajlo is{" "}
            <span className="text-rajlo-red">modernising local transport</span>
            {" "}— it&apos;s a smarter way to move.
          </m.h2>
          <m.p
            variants={reveal}
            transition={revealTransition}
            className="mt-3 max-w-2xl text-base font-semibold leading-relaxed text-foreground [text-wrap:pretty] md:text-lg"
          >
            Built by Jamaicans, for Jamaica.
          </m.p>
          <m.p
            variants={reveal}
            transition={revealTransition}
            className="mt-5 max-w-2xl text-base leading-relaxed text-muted [text-wrap:pretty] md:text-lg"
          >
            From everyday trips to airport transfers, Rajlo brings
            Jamaica&apos;s trusted route taxis and private cars into one
            simpler, safer way to travel.
          </m.p>

          {/* Promises list — one row per promise. Icon + bold lead +
             short body, matches the design doc's bullet format. Gap
             is generous so each promise reads on its own line
             rather than blurring into a paragraph. */}
          <m.ul
            variants={reveal}
            transition={revealTransition}
            className="mt-12 grid gap-6 md:mt-16 md:gap-7"
          >
            {PROMISES.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rajlo-red/10 text-rajlo-red">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <p className="pt-1 text-lg leading-relaxed [text-wrap:pretty] md:text-xl">
                  <span className="font-extrabold text-foreground">
                    {p.title}
                  </span>{" "}
                  <span className="text-muted">{p.body}</span>
                </p>
              </li>
            ))}
          </m.ul>
        </m.div>
      </div>
    </section>
  );
}

/* ─────────── Tile primitives — two distinct shapes ─────────── */

type PhotoTileProps = {
  image: string;
  imageAlt: string;
  kicker: string;
  title: string;
  body: string;
  className?: string;
  aspectClass?: string;
};

/** Full-bleed photo with text overlaid bottom-left. The dark gradient
 *  at the bottom is what gives the white text its 4.5:1 against the
 *  photo regardless of what the photo's actual luminance is. */
function PhotoTile({
  image,
  imageAlt,
  kicker,
  title,
  body,
  className = "",
  aspectClass = "aspect-[4/3]",
}: PhotoTileProps) {
  const reduce = useReducedMotion();
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={
        reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.3 }}
      transition={{ type: "spring", duration: 0.6, bounce: 0 }}
      className={`group relative overflow-hidden rounded-3xl shadow-2xl ${aspectClass} ${className}`}
      style={{ background: BRAND_FALLBACK_BG }}
    >
      <Image
        src={image}
        alt={imageAlt}
        fill
        sizes="(min-width: 1024px) 66vw, 100vw"
        className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
      />
      {/* Bottom-anchored gradient — gives the white copy enough
         contrast against any photo without darkening the whole tile. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-rajlo-black/85 via-rajlo-black/30 to-transparent"
      />
      <div className="relative flex h-full flex-col justify-end p-8 md:p-10 lg:p-12">
        <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red md:text-xs">
          {kicker}
        </p>
        <h3 className="mt-3 text-[clamp(1.5rem,2vw+0.5rem,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.02em] text-white [text-wrap:balance]">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base">
          {body}
        </p>
      </div>
    </m.div>
  );
}

type PanelTileProps = {
  /** Tonal flavour for the panel. Brand-red and brand-black give
   *  the bento its color rhythm without falling into pastel-tile
   *  territory. */
  tone: "brand" | "dark";
  kicker: string;
  title: string;
  body: string;
  icon: IconName;
  className?: string;
};

/** Text-forward panel with a big icon block at the top. Smaller and
 *  visually quieter than the photo tiles so the bento has rhythm
 *  rather than four equal screams. */
function PanelTile({
  tone,
  kicker,
  title,
  body,
  icon,
  className = "",
}: PanelTileProps) {
  const reduce = useReducedMotion();
  const panelStyle: React.CSSProperties =
    tone === "brand"
      ? {
          background:
            "linear-gradient(155deg, #f10100 0%, #d40100 60%, #a30000 100%)",
        }
      : {
          background:
            "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.28) 0%, rgba(241,1,0,0) 50%), linear-gradient(165deg, #1a1d10 0%, #111906 60%, #07090a 100%)",
        };
  const iconBg =
    tone === "brand" ? "bg-white text-rajlo-red" : "bg-rajlo-red text-white";

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={
        reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.3 }}
      transition={{ type: "spring", duration: 0.6, bounce: 0 }}
      className={`relative flex flex-col overflow-hidden rounded-3xl p-8 text-white shadow-2xl md:p-10 ${className}`}
      style={panelStyle}
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-lg ${iconBg}`}
      >
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-6 font-secondary text-[11px] font-extrabold uppercase tracking-[0.3em] md:text-xs">
        {kicker}
      </p>
      <h3 className="mt-2 text-[clamp(1.5rem,1.8vw+0.5rem,2.25rem)] font-extrabold leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base">
        {body}
      </p>
    </m.div>
  );
}
