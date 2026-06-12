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
export function LandingV3Why() {
  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
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
            Four promises that
            <br className="hidden md:block" /> <span className="text-rajlo-red">don&apos;t move.</span>
          </m.h2>
          <m.p
            variants={reveal}
            transition={revealTransition}
            className="mt-5 max-w-xl text-base leading-relaxed text-muted [text-wrap:pretty] md:text-lg"
          >
            Not pillars we made up to fill a slide. The four constraints we
            built the platform around — and won&apos;t trade off.
          </m.p>

          {/* Bento grid. Two rows on lg+. Top row: 2fr / 1fr.
             Bottom row: 1fr / 2fr. The aspect ratios + the
             content-treatment swap (photo-overlay vs text-panel)
             keep the four tiles from reading as identical. */}
          <div className="mt-14 grid gap-4 md:mt-16 md:gap-5 lg:grid-cols-3 lg:grid-rows-2">
            {/* Tile 1 — SAFETY (large, top-left, photo-overlay) */}
            <PhotoTile
              image={PHOTOS.pillarSafety}
              imageAlt="A driver showing their TA-issued PPV badge"
              kicker="Safety first"
              title="Every driver, verified."
              body="TA-issued PPV badge, government ID, vehicle inspection. We re-verify every six months — no exceptions."
              className="lg:col-span-2 lg:row-span-1"
              aspectClass="aspect-[16/10] md:aspect-[16/8]"
            />

            {/* Tile 2 — CASHLESS (small, top-right, text-forward panel) */}
            <PanelTile
              tone="brand"
              kicker="Cashless"
              title="Wallet does the paying."
              body="Top up via card or a partner QR. Fares auto-settle when the trip ends. No driver-side change. No bus-fare scramble."
              icon="wallet"
              className="lg:col-span-1 lg:row-span-1"
            />

            {/* Tile 3 — LOCAL (small, bottom-left, text-forward panel) */}
            <PanelTile
              tone="dark"
              kicker="Built right here"
              title="Made for Jamaica."
              body="Route corridors, TA fare schedule, JMD pricing. Rajlo is shaped around how the island actually moves — not a rebadged template."
              icon="map-pin"
              className="lg:col-span-1 lg:row-span-1"
            />

            {/* Tile 4 — FAIR EARNINGS (large, bottom-right, photo-overlay) */}
            <PhotoTile
              image={PHOTOS.pillarFair}
              imageAlt="A Rajlo driver checking their earnings on their phone"
              kicker="Fair earnings"
              title="Drivers keep more."
              body="Transparent commission. Weekly payouts to any Jamaican bank. What you earn is what you see — no creeping take-rates."
              className="lg:col-span-2 lg:row-span-1"
              aspectClass="aspect-[16/10] md:aspect-[16/8]"
            />
          </div>
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
