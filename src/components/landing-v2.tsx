"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Logo, LogoIcon } from "./logo";
import { ArcWatermark } from "./arc-pattern";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { PhoneMockup, RiderRequestScreen, DriverMatchScreen } from "./phone-mockup";
import { Icon } from "./icons";
import {
  FadeUp,
  Stagger,
  StaggerItem,
  FloatY,
  Typewriter,
} from "./anim";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Rajlo landing page — fresh rebuild (June 2026).
 *
 * Inspired by inDrive / Uber / Bolt landing pages: full-bleed
 * imagery, rotating hero photos, bold typography, multiple distinct
 * sections, heavy use of motion, brand-red on every interactive
 * surface.
 *
 * Sections:
 *   1. Hero — Ken-Burns photo carousel + dual CTA + trust strip
 *   2. Modes — Three branded cards: Private / Route Taxi / Drive
 *   3. Showcase — Phone mockup + value props + Play Store badge
 *   4. How it works — Three-step illustrated flow
 *   5. Why Rajlo — Four pillars with photo backgrounds + counters
 *   6. Driver recruitment — Full-bleed photo + earnings pitch
 *   7. Founding users — honest "be one of the first" panel
 *   8. Final CTA — Red panel with brand voice + dual CTA
 *
 * Imagery: Unsplash free-for-commercial-use photos referenced by
 * direct URL. Swap the URLs in PHOTOS at the top of this file to
 * use Rajlo-owned photography when the brand library is ready.
 */

/* ────────────────────────  Photo URLs ────────────────────────
 * All landing imagery now lives under `/public/landing/`. Reasons
 * for the switch away from Unsplash/Picsum CDN URLs:
 *   - VPN / corporate networks were blocking the external CDNs and
 *     leaving big dark blocks on the page.
 *   - Unsplash photo IDs aren't a stable contract — IDs that worked
 *     in dev had been removed by the time the page rendered for
 *     real users.
 *   - Local files cache, version with the repo, and load instantly.
 *
 * Drop replacement photography at the exact filenames below to swap
 * the hero/mode/pillar imagery without touching this file. Every
 * `<div style={{backgroundImage:url(...)}}>` also has a tinted brand
 * gradient fallback under it, so a missing file shows brand colour
 * instead of a blank rectangle. */
const PHOTOS = {
  hero: [
    "/landing/hero-1.jpg",
    "/landing/hero-2.jpg",
    "/landing/hero-3.jpg",
    "/landing/hero-4.jpg",
  ],
  modePrivate: "/landing/mode-private.jpg",
  modeRouteTaxi: "/landing/mode-route-taxi.jpg",
  modeDrive: "/landing/mode-drive.jpg",
  pillarSafety: "/landing/pillar-safety.jpg",
  pillarCashless: "/landing/pillar-cashless.jpg",
  pillarLocal: "/landing/pillar-local.jpg",
  pillarFair: "/landing/pillar-fair.jpg",
  driverHero: "/landing/driver-hero.jpg",
};

/** Single source of truth for the brand-tinted gradient that sits
 * behind every photo div. Means a missing file shows brand colour,
 * not a blank box. */
const BRAND_FALLBACK_BG =
  "linear-gradient(155deg, #1a1d10 0%, rgba(241,1,0,0.35) 55%, #07090a 100%)";

export function LandingV2({ cta }: { cta: LandingCtaTargets }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader
        bookHref={cta.riderHref}
        bookLabel={cta.riderIsDashboard ? "Open dashboard" : "Book a ride"}
        transparentOverDark
      />
      <Hero cta={cta} />
      <Modes cta={cta} />
      <Showcase cta={cta} />
      <HowItWorks />
      <WhyRajlo />
      <DriverRecruit cta={cta} />
      <FoundingUsers cta={cta} />
      <FinalCta cta={cta} />
      <SiteFooter />
    </div>
  );
}

/* ────────────────────────  1. Hero ──────────────────────── */

function Hero({ cta }: { cta: LandingCtaTargets }) {
  // Photo carousel for the right-side framed visual. Auto-advances
  // every 5s — pausing on hover isn't wired (the user explicitly
  // wants things to keep moving). The Ken Burns zoom lives in a
  // local @keyframes so the SSR bundle doesn't ship it.
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % PHOTOS.hero.length),
      5000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative isolate overflow-hidden bg-rajlo-black text-white">
      {/* Layered atmosphere: brand-red radial bloom from the top-left,
         deep-shade gradient sweep, ArcWatermark x2. Gives the panel
         depth + brand presence even before any content renders. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% -10%, rgba(241,1,0,0.35) 0%, rgba(241,1,0,0) 45%), radial-gradient(circle at 80% 110%, rgba(241,1,0,0.18) 0%, rgba(241,1,0,0) 50%), linear-gradient(155deg, #1a1d10 0%, #111906 55%, #07090a 100%)",
        }}
      />
      <ArcWatermark
        variant="red"
        size={620}
        className="pointer-events-none absolute -left-32 -top-40 opacity-30"
      />
      <ArcWatermark
        variant="white"
        size={420}
        className="pointer-events-none absolute -bottom-32 right-1/4 opacity-10"
      />

      <style jsx>{`
        @keyframes kenBurns {
          0% {
            transform: scale(1) translate3d(0, 0, 0);
          }
          100% {
            transform: scale(1.12) translate3d(-1%, -1%, 0);
          }
        }
        @keyframes floatGlow {
          0%, 100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, -10px, 0);
          }
        }
      `}</style>

      {/* Top padding mirrors the fixed header height (≈68 px) so the
         "Now live across Jamaica" pill never sits under the glass
         strip. Use scroll-padding-style spacing rather than a margin
         so the section background still extends to the page top. */}
      <div className="relative mx-auto grid min-h-[92vh] max-w-7xl items-center gap-12 px-6 pb-16 pt-28 md:pb-24 md:pt-32 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-36">
        {/* ─────── LEFT: brand panel + content ─────── */}
        <div className="relative">
          {/* Giant ghost wordmark behind the content — adds brand
             dominance without competing with the headline copy. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-2 -top-16 select-none text-[18vw] font-extrabold leading-none tracking-tighter text-white/[0.045] md:text-[10rem]"
          >
            Rajlo
          </div>

          <FadeUp>
            <div className="inline-flex items-center gap-2 rounded-full border border-rajlo-red/40 bg-rajlo-red/10 px-4 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rajlo-red" />
              <span className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-[11px]">
                Made for Jamaica
              </span>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <h1 className="relative mt-7 text-5xl font-extrabold leading-[0.92] tracking-tight md:text-7xl lg:text-[5.5rem]">
              <Typewriter
                texts={["Ride.", "Drive.", "Move.", "Earn."]}
                typingSpeed={70}
                deletingSpeed={35}
                holdMs={2000}
                className="block text-rajlo-red"
                cursorClassName="ml-[3px] inline-block h-[0.85em] w-[6px] translate-y-[2px] bg-rajlo-red align-middle"
              />
              <span className="block">Jamaica,</span>
              <span className="block text-white/85">your way.</span>
            </h1>
          </FadeUp>

          <FadeUp delay={0.3}>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/80 md:text-lg">
              Private cars + shared route taxis, paid from a single
              wallet. TA-tariff fares, verified drivers, island-wide.
            </p>
          </FadeUp>

          <FadeUp delay={0.4}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href={cta.riderHref}
                className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-7 py-4 text-sm font-extrabold text-white shadow-2xl shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-rajlo-red/60 md:text-base"
              >
                {cta.riderIsDashboard
                  ? "Open my dashboard"
                  : "Ride with Rajlo"}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href={cta.driverHref}
                className="group inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-4 text-sm font-extrabold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white hover:bg-white/20 md:text-base"
              >
                {cta.driverIsDashboard
                  ? "Driver dashboard"
                  : "Drive with Rajlo"}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </FadeUp>

          {/* What Rajlo stands on — facts that hold regardless of
             traction. No counters until the numbers are real. */}
          <FadeUp delay={0.55}>
            <div className="mt-12 grid gap-x-9 gap-y-4 border-t border-white/10 pt-7 sm:grid-cols-3">
              <HeroFact title="TA-tariff fares" body="Route taxi fares match the official Transport Authority schedule, every trip." />
              <HeroFact title="Wallet-only" body="Top up, ride, pay — no cash exchanged between rider and driver." />
              <HeroFact title="Verified drivers" body="Every driver is ID-checked, document-verified, and TA-licensed before their first trip." />
            </div>
          </FadeUp>
        </div>

        {/* ─────── RIGHT: framed photo carousel + phone overlap ─────── */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <FadeUp delay={0.2} className="block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_30px_80px_-30px_rgba(241,1,0,0.55)]">
              {/* Photo carousel — cross-fading layered <div>s with
                 the Ken Burns zoom on the active slide. */}
              {/* Brand-gradient base so the frame is never empty if a
                 hero photo file is missing. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: BRAND_FALLBACK_BG }}
              />
              {PHOTOS.hero.map((url, i) => (
                <div
                  key={url}
                  aria-hidden
                  className="absolute inset-0 transition-opacity duration-[1400ms] ease-in-out"
                  style={{
                    opacity: i === idx ? 1 : 0,
                    animation:
                      i === idx ? "kenBurns 11s ease-out forwards" : undefined,
                  }}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 45vw, 90vw"
                    className="object-cover"
                    /* First hero photo is the LCP candidate — eager
                       load it. The other three crossfade in later, so
                       lazy is fine. */
                    priority={i === 0}
                  />
                </div>
              ))}
              {/* Subtle dark gradient at the bottom so the photo
                 frame meshes with the phone mockup overlap. */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-rajlo-black/55 via-transparent to-transparent"
              />
              {/* Floating "Live" indicator chip on the photo for
                 product-page polish. */}
              <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-rajlo-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live · Kingston
              </div>
              {/* Photo carousel dots stacked vertically along the
                 photo's left edge. */}
              <div className="absolute bottom-6 left-6 flex flex-col items-start gap-2">
                {PHOTOS.hero.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Show photo ${i + 1}`}
                    onClick={() => setIdx(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === idx
                        ? "w-10 bg-rajlo-red"
                        : "w-2 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>
            </div>
          </FadeUp>

          {/* Phone mockup floats at the bottom-left, overlapping the
             photo. Subtle continuous Y-float adds the "product is
             alive" quality. */}
          <div
            className="absolute -bottom-10 -left-6 hidden md:block lg:-left-12"
            style={{ animation: "floatGlow 5s ease-in-out infinite" }}
          >
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 -z-10 scale-110 rounded-[3rem] bg-rajlo-red/40 blur-3xl"
              />
              <PhoneMockup>
                <RiderRequestScreen />
              </PhoneMockup>
            </div>
          </div>

        </div>
      </div>

      {/* Trust strip pinned to the bottom of the hero. Sits BELOW the
         grid so it doesn't fight with the phone overlap. */}
      <div className="relative border-t border-white/10 bg-rajlo-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 md:text-[11px] md:tracking-[0.3em] lg:justify-between lg:px-12">
          <span className="flex items-center gap-2">
            <Icon name="shield-check" className="h-3.5 w-3.5 text-rajlo-red" />
            TA-verified PPV fleet
          </span>
          <span className="flex items-center gap-2">
            <Icon name="wallet" className="h-3.5 w-3.5 text-rajlo-red" />
            JMD wallet — no cash
          </span>
          <span className="flex items-center gap-2">
            <Icon name="map-pin" className="h-3.5 w-3.5 text-rajlo-red" />
            Island-wide coverage
          </span>
          <span className="flex items-center gap-2">
            <Icon name="phone" className="h-3.5 w-3.5 text-rajlo-red" />
            24/7 in-app safety line
          </span>
        </div>
      </div>
    </section>
  );
}

function HeroFact({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red">
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-white/80">{body}</p>
    </div>
  );
}

/* ────────────────────────  2. Modes ──────────────────────── */

function Modes({ cta }: { cta: LandingCtaTargets }) {
  // Alternating "magazine spread" rows — image on one side, story on
  // the other, swapping sides per row. Each row has its own personality
  // (light, brand-red, dark) so scrolling through them doesn't feel
  // like three copies of the same card. Big numbered eyebrows + giant
  // headlines keep the brand voice loud.
  return (
    <section className="relative bg-surface py-20 md:py-28">
      <ArcWatermark
        variant="muted"
        size={420}
        className="pointer-events-none absolute -left-24 top-8 opacity-30"
      />

      <div className="relative mx-auto max-w-7xl px-6 md:px-12">
        <FadeUp>
          <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
            Pick how you move
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
            Three ways to make Rajlo{" "}
            <span className="text-rajlo-red">work for you</span>.
          </h2>
        </FadeUp>
      </div>

      {/* Row 1 — Private ride. Image LEFT, content RIGHT. Light tone. */}
      <ModeRow
        index="01"
        eyebrow="Private ride"
        title="Door-to-door, just you."
        copy="Pin your pickup and dropoff, see the upfront fare, pay from your wallet. Add stops mid-trip without paying twice."
        bullets={[
          "Upfront JMD fare before you book",
          "Add stops without re-quoting",
          "PIN-verify your driver every trip",
        ]}
        image={PHOTOS.modePrivate}
        href={cta.riderHref}
        ctaLabel="Book a private ride"
        side="left"
        tone="light"
      />

      {/* Row 2 — Route Taxi. Image RIGHT, content LEFT. Brand-red tone. */}
      <ModeRow
        index="02"
        eyebrow="Route Taxi"
        title="Hop the corridor."
        copy="Pick a corridor (Half-Way Tree → Papine, Mandeville → May Pen…). Pay the official TA fare. Share the ride, save the cost."
        bullets={[
          "Official TA tariff — no haggling",
          "Boarding + alighting points pre-planned",
          "Pay per leg, only what you use",
        ]}
        image={PHOTOS.modeRouteTaxi}
        href={cta.riderHref}
        ctaLabel="Find a route"
        side="right"
        tone="brand"
      />

      {/* Row 3 — Drive. Image LEFT, content RIGHT. Dark panel. */}
      <ModeRow
        index="03"
        eyebrow="Drive"
        title="Earn on your schedule."
        copy="Verified once, drive whenever. Top-tier Rajlo drivers clear over JMD 30,000 a week — paid straight to their bank, every Friday."
        bullets={[
          "Weekly payouts to any JM bank",
          "Built-in turn-by-turn navigation",
          "Full earnings dashboard",
        ]}
        image={PHOTOS.modeDrive}
        href={cta.driverHref}
        ctaLabel="Start earning"
        side="left"
        tone="dark"
      />
    </section>
  );
}

function ModeRow({
  index,
  eyebrow,
  title,
  copy,
  bullets,
  image,
  href,
  ctaLabel,
  side,
  tone,
}: {
  index: string;
  eyebrow: string;
  title: string;
  copy: string;
  bullets: string[];
  image: string;
  href: string;
  ctaLabel: string;
  /** Which side the IMAGE lives on. */
  side: "left" | "right";
  tone: "light" | "brand" | "dark";
}) {
  const toneStyles =
    tone === "brand"
      ? "bg-gradient-to-br from-rajlo-red via-rajlo-red to-[#b00000] text-white"
      : tone === "dark"
        ? "bg-rajlo-black text-white"
        : "bg-surface text-foreground";
  const copyTone = tone === "light" ? "text-muted" : "text-white/85";
  const bulletDot =
    tone === "brand"
      ? "bg-white text-rajlo-red"
      : tone === "dark"
        ? "bg-rajlo-red text-white"
        : "bg-rajlo-red text-white";
  const ctaCls =
    tone === "brand"
      ? "bg-white text-rajlo-red hover:bg-white/95"
      : tone === "dark"
        ? "bg-rajlo-red text-white shadow-rajlo-red/40 hover:bg-primary-hover"
        : "bg-rajlo-red text-white shadow-rajlo-red/40 hover:bg-primary-hover";
  const indexTone =
    tone === "light" ? "text-rajlo-red/70" : "text-white/30";

  return (
    <div className="relative mt-16 md:mt-24">
      <div className="mx-auto grid max-w-7xl items-stretch gap-0 px-6 md:px-12 lg:grid-cols-2 lg:gap-0">
        {/* Image side */}
        <div
          className={`relative aspect-[4/3] overflow-hidden md:aspect-[5/4] ${
            side === "right" ? "lg:order-2" : ""
          }`}
        >
          {/* `h-full w-full` on the FadeUp wrapper is required —
             without it the motion <div> collapses to 0 height and
             the absolutely-positioned image inside renders as a
             zero-size box (i.e. invisible). */}
          <FadeUp className="block h-full w-full">
            <div
              className="group relative h-full w-full overflow-hidden rounded-[2rem] shadow-2xl"
              style={{ background: BRAND_FALLBACK_BG }}
            >
              <div className="absolute inset-0 transition-transform duration-[1200ms] ease-out group-hover:scale-105">
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              {/* Subtle gradient overlay tinted to match the tone of
                 the adjacent panel — visually ties the photo to the
                 content side without darkening it too much. */}
              <div
                className={`absolute inset-0 ${
                  tone === "brand"
                    ? "bg-gradient-to-tr from-rajlo-red/40 via-transparent to-transparent"
                    : tone === "dark"
                      ? "bg-gradient-to-tr from-rajlo-black/50 via-transparent to-transparent"
                      : "bg-gradient-to-tr from-rajlo-black/20 via-transparent to-transparent"
                }`}
              />
              {/* Magazine-style number watermark over the photo. */}
              <span
                className={`absolute right-5 top-5 font-secondary text-7xl font-extrabold leading-none tracking-tight text-white/85 drop-shadow-lg md:text-8xl`}
              >
                {index}
              </span>
            </div>
          </FadeUp>
        </div>

        {/* Content side — tone-aware panel. */}
        <div
          className={`relative flex items-center ${
            side === "right" ? "lg:order-1 lg:pr-12" : "lg:pl-12"
          }`}
        >
          <div
            className={`relative -mt-8 w-full overflow-hidden rounded-[2rem] p-8 shadow-xl md:p-12 lg:mt-0 ${toneStyles}`}
          >
            {tone === "brand" && (
              <ArcWatermark
                variant="white"
                size={320}
                className="pointer-events-none absolute -bottom-20 -right-20 opacity-25"
              />
            )}
            {tone === "dark" && (
              <ArcWatermark
                variant="red"
                size={320}
                className="pointer-events-none absolute -bottom-20 -right-20 opacity-30"
              />
            )}
            <div className="relative">
              <p
                className={`font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] md:text-[11px] ${
                  tone === "light" ? "text-rajlo-red" : "text-white/85"
                }`}
              >
                {eyebrow}
              </p>
              <FadeUp>
                <h3 className="mt-4 text-3xl font-extrabold leading-[1.02] tracking-tight md:text-5xl">
                  {title}
                </h3>
              </FadeUp>
              <FadeUp delay={0.1}>
                <p
                  className={`mt-5 max-w-md text-base leading-relaxed md:text-lg ${copyTone}`}
                >
                  {copy}
                </p>
              </FadeUp>
              <Stagger className="mt-6 space-y-2.5">
                {bullets.map((b) => (
                  <StaggerItem key={b}>
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${bulletDot}`}
                      >
                        <Icon name="check-circle" className="h-3 w-3" />
                      </span>
                      <span
                        className={`text-sm ${
                          tone === "light" ? "text-foreground" : "text-white/90"
                        }`}
                      >
                        {b}
                      </span>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>

              {/* Number echo at the bottom-left of the panel for
                 visual cohesion with the photo's giant number. */}
              <div className="mt-9 flex items-center gap-5">
                <span
                  className={`font-secondary text-5xl font-extrabold leading-none tracking-tighter ${indexTone}`}
                >
                  {index}
                </span>
                <Link
                  href={href}
                  className={`group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-extrabold shadow-lg transition-all hover:-translate-y-0.5 ${ctaCls}`}
                >
                  {ctaLabel}
                  <Icon
                    name="arrow-right"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────  3. App showcase ──────────────────────── */

function Showcase({ cta }: { cta: LandingCtaTargets }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-rajlo-black via-rajlo-black to-[#1c0a0a] py-20 text-white md:py-28">
      <ArcWatermark
        variant="red"
        size={520}
        className="pointer-events-none absolute -right-40 -bottom-40 opacity-30"
      />
      <ArcWatermark
        variant="white"
        size={300}
        className="pointer-events-none absolute -left-12 top-12 opacity-15"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 md:grid-cols-[1.1fr_1fr] md:gap-16 md:px-12">
        <div>
          <FadeUp>
            <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
              All in your pocket
            </p>
            <h2 className="mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
              The whole island,{" "}
              <span className="text-rajlo-red">one tap away</span>.
            </h2>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p className="mt-5 max-w-md text-base text-white/80 md:text-lg">
              Track your driver in real time, top up your wallet at any
              QR-enabled spot, settle the fare without touching cash.
            </p>
          </FadeUp>

          <Stagger className="mt-7 space-y-3">
            <ShowcaseLine
              icon="map-pin"
              label="Live driver tracking — see them coming"
            />
            <ShowcaseLine
              icon="wallet"
              label="JMD wallet with QR top-up at retail partners"
            />
            <ShowcaseLine
              icon="shield-check"
              label="Verify Your Ride PIN — confirm it's your car"
            />
            <ShowcaseLine
              icon="phone"
              label="In-app voice + chat — driver and rider in sync"
            />
          </Stagger>

          <FadeUp delay={0.5}>
            <div className="mt-9">
              <Link
                href={cta.riderHref}
                className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                Get started free
                <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </FadeUp>
        </div>

        <div className="relative">
          <FloatY>
            <div className="relative mx-auto w-fit">
              {/* Glow under the phone for premium feel */}
              <div className="absolute inset-0 -z-10 scale-110 rounded-[3rem] bg-rajlo-red/30 blur-3xl" />
              <PhoneMockup>
                <RiderRequestScreen />
              </PhoneMockup>
            </div>
          </FloatY>
        </div>
      </div>
    </section>
  );
}

function ShowcaseLine({
  icon,
  label,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
}) {
  return (
    <StaggerItem>
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rajlo-red/15 text-rajlo-red">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="text-sm text-white/90 md:text-base">{label}</span>
      </div>
    </StaggerItem>
  );
}

/* ────────────────────────  4. How it works ──────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Pin where you are + where you're going",
      copy: "Drop two pins (or type addresses). The app shows the upfront fare before you book.",
    },
    {
      n: "02",
      title: "Match with a verified driver",
      copy: "Rajlo finds the nearest available driver. Their photo, plate, and rating show before you confirm.",
    },
    {
      n: "03",
      title: "Ride, then pay from your wallet",
      copy: "Track them in real time. When you arrive, the fare settles automatically — no cash, no fumbling.",
    },
  ];
  return (
    <section className="relative bg-background py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 md:px-12">
        <FadeUp>
          <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
            How it works
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
            From the curb to your couch in three taps.
          </h2>
        </FadeUp>

        <Stagger className="mt-14 grid gap-6 md:grid-cols-3 md:gap-8">
          {steps.map((s, i) => (
            <StaggerItem key={s.n}>
              <div className="relative h-full overflow-hidden rounded-3xl border border-line bg-surface p-8 transition-all hover:-translate-y-1 hover:border-rajlo-red/40 hover:shadow-xl">
                {i === 0 && (
                  <ArcWatermark
                    variant="red"
                    size={180}
                    className="pointer-events-none absolute -right-12 -bottom-12 opacity-20"
                  />
                )}
                <span className="relative font-secondary text-5xl font-extrabold leading-none tracking-tight text-rajlo-red/80 md:text-6xl">
                  {s.n}
                </span>
                <h3 className="relative mt-4 text-xl font-extrabold tracking-tight md:text-2xl">
                  {s.title}
                </h3>
                <p className="relative mt-3 text-sm leading-relaxed text-muted">
                  {s.copy}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────────────────  5. Why Rajlo (pillars) ──────────────────────── */

function WhyRajlo() {
  const pillars = [
    {
      eyebrow: "Safety first",
      title: "Every driver, verified",
      copy:
        "TA-issued PPV badge + ID + vehicle inspection. We re-verify every six months.",
      image: PHOTOS.pillarSafety,
    },
    {
      eyebrow: "Cashless",
      title: "Wallet does the paying",
      copy:
        "Top up via card or at any QR-enabled retail partner. Fare auto-settles when the trip ends.",
      image: PHOTOS.pillarCashless,
    },
    {
      eyebrow: "Built right here",
      title: "Made for Jamaica",
      copy:
        "Route corridors, TA fare schedule, JMD pricing — Rajlo is shaped around how the island actually moves.",
      image: PHOTOS.pillarLocal,
    },
    {
      eyebrow: "Fair earnings",
      title: "Drivers keep more",
      copy:
        "Transparent commission, weekly bank transfers, no hidden deductions. What you earn is what you see.",
      image: PHOTOS.pillarFair,
    },
  ];

  return (
    <section className="relative bg-rajlo-black py-20 text-white md:py-28">
      <ArcWatermark
        variant="red"
        size={600}
        className="pointer-events-none absolute -left-40 -top-40 opacity-20"
      />
      <div className="relative mx-auto max-w-7xl px-6 md:px-12">
        <FadeUp>
          <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
            Why Rajlo
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
            Built on four promises that don&apos;t move.
          </h2>
        </FadeUp>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
          {pillars.map((p) => (
            <StaggerItem key={p.title}>
              <div
                className="group relative h-72 overflow-hidden rounded-3xl"
                style={{ background: BRAND_FALLBACK_BG }}
              >
                <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                  <Image
                    src={p.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 45vw, 90vw"
                    className="object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-tr from-rajlo-black via-rajlo-black/70 to-rajlo-black/10" />
                <div className="relative flex h-full flex-col justify-end p-7">
                  <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red">
                    {p.eyebrow}
                  </p>
                  <h3 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
                    {p.title}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-white/85">
                    {p.copy}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

      </div>
    </section>
  );
}

/* ────────────────────────  6. Driver recruitment ──────────────────────── */

function DriverRecruit({ cta }: { cta: LandingCtaTargets }) {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: BRAND_FALLBACK_BG }}
    >
      <div className="absolute inset-0">
        <Image
          src={PHOTOS.driverHero}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-rajlo-black via-rajlo-black/80 to-rajlo-black/30" />
      <ArcWatermark
        variant="red"
        size={420}
        className="pointer-events-none absolute -right-24 top-12 opacity-30"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-20 text-white md:px-12 md:py-32">
        <div className="max-w-2xl">
          <FadeUp>
            <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
              Drive with Rajlo
            </p>
            <h2 className="mt-3 text-4xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">
              Your car. Your hours.
              <br />
              <span className="text-rajlo-red">Your money.</span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85 md:text-lg">
              Use your own car, set your own hours, take both private rides
              and shared route-taxi trips from one app. Transparent commission,
              no surprise deductions, weekly payouts to your Jamaican bank.
            </p>
          </FadeUp>

          <Stagger className="mt-7 grid gap-3 sm:grid-cols-2">
            <DriverBenefit text="Weekly payouts to any Jamaican bank" />
            <DriverBenefit text="Verify once, drive whenever" />
            <DriverBenefit text="Built-in navigation + voice prompts" />
            <DriverBenefit text="Full earnings dashboard, no surprises" />
          </Stagger>

          <FadeUp delay={0.5}>
            <Link
              href={cta.driverHref}
              className="group mt-9 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-7 py-4 text-base font-extrabold text-white shadow-2xl shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-rajlo-red/60"
            >
              {cta.driverIsDashboard ? "Open driver dashboard" : "Start the application"}
              <Icon
                name="arrow-right"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </FadeUp>
        </div>

        {/* Right-side phone mockup overlapping the right edge for depth. */}
        <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 lg:block">
          <FloatY>
            <PhoneMockup>
              <DriverMatchScreen />
            </PhoneMockup>
          </FloatY>
        </div>
      </div>
    </section>
  );
}

function DriverBenefit({ text }: { text: string }) {
  return (
    <StaggerItem>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rajlo-red text-white">
          <Icon name="check-circle" className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm text-white/90">{text}</span>
      </div>
    </StaggerItem>
  );
}

/* ────────────────────────  7. Founding users ──────────────────────── *
 * Replaced the testimonial carousel — we are pre-traction, so quotes
 * would be fabricated. This section names the moment honestly and
 * invites people to be part of it. */
function FoundingUsers({ cta }: { cta: LandingCtaTargets }) {
  return (
    <section className="relative bg-surface py-20 md:py-28">
      <ArcWatermark
        variant="red"
        size={360}
        className="pointer-events-none absolute -right-24 top-8 opacity-25"
      />
      <ArcWatermark
        variant="muted"
        size={420}
        className="pointer-events-none absolute -left-32 bottom-0 opacity-30"
      />
      <div className="relative mx-auto max-w-5xl px-6 text-center md:px-12">
        <FadeUp>
          <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
            Day one
          </p>
          <h2 className="mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
            Be one of the first.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            Rajlo is brand new. Every rider who signs up and every driver who
            gets verified now shapes how this thing grows. The product, the
            corridors, the fare schedule — built with the people who use it.
          </p>
        </FadeUp>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2">
          <StaggerItem>
            <div className="relative flex h-full flex-col rounded-3xl border border-line bg-white p-8 text-left shadow-sm">
              <span className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red">
                For riders
              </span>
              <h3 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
                Sign up. Top up. Take your first trip.
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                It takes a minute to create an account and a few seconds to
                fund your wallet. Every booking helps us learn which corridors
                to staff next.
              </p>
              <Link
                href={cta.riderHref}
                className="group mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-rajlo-red px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                {cta.riderIsDashboard ? "Open my dashboard" : "Become a rider"}
                <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div
              className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-rajlo-black p-8 text-left text-white shadow-xl"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.30) 0%, rgba(241,1,0,0) 50%)",
              }}
            >
              <span className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red">
                For drivers
              </span>
              <h3 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
                Verify once. Drive on day one.
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-white/80">
                Submit your TA badge, ID, and vehicle docs. Once you&apos;re
                approved, both modes (private and route-taxi) are unlocked from
                the same dashboard.
              </p>
              <Link
                href={cta.driverHref}
                className="group mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-rajlo-red shadow-md shadow-black/30 transition-all hover:-translate-y-0.5"
              >
                {cta.driverIsDashboard ? "Driver dashboard" : "Become a driver"}
                <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </StaggerItem>
        </Stagger>

        {/* Honest trust strip — only claims that are true on day one. */}
        <FadeUp delay={0.2}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-line pt-8 text-[11px] font-bold uppercase tracking-wider text-muted">
            <span>TA-licensed PPV fleet</span>
            <span>·</span>
            <span>Wallet-only · no cash</span>
            <span>·</span>
            <span>End-to-end encrypted chats</span>
            <span>·</span>
            <span>24/7 in-app safety line</span>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ────────────────────────  8. Final CTA ──────────────────────── */

function FinalCta({ cta }: { cta: LandingCtaTargets }) {
  return (
    <section className="relative overflow-hidden bg-rajlo-red py-20 text-white md:py-28">
      <ArcWatermark
        variant="white"
        size={520}
        className="pointer-events-none absolute -right-40 -top-40 opacity-25"
      />
      <ArcWatermark
        variant="white"
        size={320}
        className="pointer-events-none absolute -left-12 bottom-0 opacity-15"
      />
      <div className="relative mx-auto max-w-5xl px-6 text-center md:px-12">
        <FadeUp>
          <LogoIcon
            height={56}
            className="mx-auto mb-6 text-white opacity-95"
          />
          <h2 className="text-4xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">
            Ready to move?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/90 md:text-lg">
            Whether you&apos;re riding tonight or earning tomorrow — Rajlo
            takes you both there. Cashless, transparent, Jamaican.
          </p>
        </FadeUp>

        <FadeUp delay={0.2}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={cta.riderHref}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-extrabold text-rajlo-red shadow-2xl transition-all hover:-translate-y-0.5 hover:bg-white/95"
            >
              {cta.riderIsDashboard ? "Open dashboard" : "Ride with Rajlo"}
              <Icon
                name="arrow-right"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href={cta.driverHref}
              className="group inline-flex items-center gap-2 rounded-full border-2 border-white bg-transparent px-7 py-4 text-base font-extrabold text-white transition-all hover:-translate-y-0.5 hover:bg-white hover:text-rajlo-red"
            >
              {cta.driverIsDashboard ? "Driver dashboard" : "Drive with Rajlo"}
              <Icon
                name="arrow-right"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </FadeUp>

        <FadeUp delay={0.4}>
          <p className="mt-10 font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-white/75">
            Rajlo — Let&apos;s go!
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
