"use client";

import Link from "next/link";
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
  CountUp,
  FloatY,
  WordReveal,
  HoverLift,
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
 *   7. Testimonials — Auto-rotating quote carousel
 *   8. Final CTA — Red panel with brand voice + dual CTA
 *
 * Imagery: Unsplash free-for-commercial-use photos referenced by
 * direct URL. Swap the URLs in PHOTOS at the top of this file to
 * use Rajlo-owned photography when the brand library is ready.
 */

/* ────────────────────────  Photo URLs ────────────────────────
 * All photos sourced from Unsplash (free, commercial use OK). One
 * place to swap them when Rajlo's own photography is ready. */
const PHOTOS = {
  hero: [
    // Winding coastal road — opens the carousel.
    "https://images.unsplash.com/photo-1469041797191-50ace28483c3?w=2000&q=85&auto=format&fit=crop",
    // City at night with car light trails — "Rajlo moves Jamaica".
    "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=2000&q=85&auto=format&fit=crop",
    // Hands on steering wheel — driver's perspective.
    "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=2000&q=85&auto=format&fit=crop",
    // Sunlit road through palms — Caribbean lifestyle.
    "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=2000&q=85&auto=format&fit=crop",
  ],
  modePrivate:
    "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&q=80&auto=format&fit=crop",
  modeRouteTaxi:
    "https://images.unsplash.com/photo-1494522358652-f30e61a60313?w=1200&q=80&auto=format&fit=crop",
  modeDrive:
    "https://images.unsplash.com/photo-1556800572-1b8aedf82db3?w=1200&q=80&auto=format&fit=crop",
  pillarSafety:
    "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&q=80&auto=format&fit=crop",
  pillarCashless:
    "https://images.unsplash.com/photo-1556656793-08538906a9f8?w=1200&q=80&auto=format&fit=crop",
  pillarLocal:
    "https://images.unsplash.com/photo-1517760444937-f6397edcbbcd?w=1200&q=80&auto=format&fit=crop",
  pillarFair:
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=80&auto=format&fit=crop",
  driverHero:
    "https://images.unsplash.com/photo-1532974297617-c0f05fe48bff?w=2000&q=85&auto=format&fit=crop",
  testimonialA:
    "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=300&q=80&auto=format&fit=crop",
  testimonialB:
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&q=80&auto=format&fit=crop",
  testimonialC:
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&q=80&auto=format&fit=crop",
};

export function LandingV2({ cta }: { cta: LandingCtaTargets }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader
        bookHref={cta.riderHref}
        bookLabel={cta.riderIsDashboard ? "Open dashboard" : "Book a ride"}
      />
      <Hero cta={cta} />
      <Modes cta={cta} />
      <Showcase cta={cta} />
      <HowItWorks />
      <WhyRajlo />
      <DriverRecruit cta={cta} />
      <Testimonials />
      <FinalCta cta={cta} />
      <SiteFooter />
    </div>
  );
}

/* ────────────────────────  1. Hero ──────────────────────── */

function Hero({ cta }: { cta: LandingCtaTargets }) {
  // Carousel index — auto-advances every 6 seconds. Pausing on
  // hover is intentionally NOT implemented; the user said "don't
  // be too static" so we let it cycle even when hovered.
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % PHOTOS.hero.length),
      6000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative isolate min-h-[88vh] overflow-hidden bg-rajlo-black text-white md:min-h-[92vh]">
      {/* Photo carousel — layered <div>s with bg-image, fading via
         opacity transition. The active slide also has a slow Ken
         Burns zoom (CSS animation defined inline below). */}
      {PHOTOS.hero.map((url, i) => (
        <div
          key={url}
          aria-hidden
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-[1500ms] ease-in-out"
          style={{
            backgroundImage: `url(${url})`,
            opacity: i === idx ? 1 : 0,
            animation:
              i === idx ? "kenBurns 12s ease-out forwards" : undefined,
          }}
        />
      ))}
      {/* Dark gradient overlay so the white text reads on any photo. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-rajlo-black/85 via-rajlo-black/55 to-rajlo-black/85"
      />
      {/* Brand watermark — faint, top-right, ties every photo to the
         Rajlo identity. */}
      <ArcWatermark
        variant="red"
        size={520}
        className="pointer-events-none absolute -right-32 -top-32 opacity-25"
      />

      {/* Inline keyframes for the Ken Burns zoom — kept here so the
         animation only ships when this section renders. */}
      <style jsx>{`
        @keyframes kenBurns {
          0% {
            transform: scale(1) translate3d(0, 0, 0);
          }
          100% {
            transform: scale(1.12) translate3d(-1%, -1%, 0);
          }
        }
      `}</style>

      <div className="relative mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-center px-6 py-24 md:min-h-[92vh] md:px-12 md:py-32">
        <FadeUp>
          <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-xs">
            Rajlo · Let&apos;s go!
          </p>
        </FadeUp>
        <WordReveal
          as="h1"
          className="mt-6 font-extrabold leading-[0.95] tracking-tight"
          text="Move Jamaica."
        />
        <FadeUp delay={0.2}>
          <h2 className="mt-4 max-w-2xl text-2xl font-extrabold leading-[1.05] tracking-tight md:text-4xl">
            Private rides + shared route taxis —{" "}
            <span className="text-rajlo-red">cashless</span>, transparent,
            and built right here.
          </h2>
        </FadeUp>
        <FadeUp delay={0.35}>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 md:text-lg">
            Book a private car or hop a route taxi anywhere across the
            island — fares match the official TA tariff, drivers are
            verified, and your wallet does the paying.
          </p>
        </FadeUp>

        <FadeUp delay={0.5}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={cta.riderHref}
              className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-7 py-4 text-sm font-extrabold text-white shadow-2xl shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-rajlo-red/60 md:text-base"
            >
              {cta.riderIsDashboard ? "Open my dashboard" : "Ride with Rajlo"}
              <Icon
                name="arrow-right"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href={cta.driverHref}
              className="group inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-4 text-sm font-extrabold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white hover:bg-white/20 md:text-base"
            >
              {cta.driverIsDashboard ? "Driver dashboard" : "Drive with Rajlo"}
              <Icon
                name="arrow-right"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </FadeUp>

        {/* Carousel dots — visible cue that the hero is cycling. */}
        <FadeUp delay={0.65}>
          <div className="mt-10 flex items-center gap-2.5">
            {PHOTOS.hero.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show hero ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-10 bg-rajlo-red" : "w-2 bg-white/30"
                }`}
              />
            ))}
          </div>
        </FadeUp>

        {/* Trust strip pinned to the bottom of the hero. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 px-6 md:bottom-10 md:px-12">
          <FadeUp delay={0.8}>
            <div className="pointer-events-auto flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold uppercase tracking-wider text-white/70">
              <span className="flex items-center gap-2">
                <Icon name="shield-check" className="h-3.5 w-3.5 text-rajlo-red" />
                TA-verified drivers
              </span>
              <span className="flex items-center gap-2">
                <Icon name="wallet" className="h-3.5 w-3.5 text-rajlo-red" />
                JMD wallet — no cash
              </span>
              <span className="flex items-center gap-2">
                <Icon name="map-pin" className="h-3.5 w-3.5 text-rajlo-red" />
                Island-wide coverage
              </span>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────  2. Modes ──────────────────────── */

function Modes({ cta }: { cta: LandingCtaTargets }) {
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
          <h2 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
            Three ways to make Rajlo work for you.
          </h2>
        </FadeUp>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
          <StaggerItem>
            <ModeCard
              eyebrow="Private ride"
              title="Door-to-door, just you"
              copy="Pin pickup + dropoff, see the fare upfront, pay from your wallet. Add stops mid-trip without paying twice."
              image={PHOTOS.modePrivate}
              href={cta.riderHref}
              cta="Book a private ride"
            />
          </StaggerItem>
          <StaggerItem>
            <ModeCard
              eyebrow="Route Taxi"
              title="Hop the corridor"
              copy="Pick a corridor (Half-Way Tree → Papine, Mandeville → May Pen…). Pay the official TA fare, share the ride."
              image={PHOTOS.modeRouteTaxi}
              href={cta.riderHref}
              cta="Find a route"
              accent
            />
          </StaggerItem>
          <StaggerItem>
            <ModeCard
              eyebrow="Drive"
              title="Earn on your schedule"
              copy="Verified once, drive whenever. Weekly payouts straight to your bank account."
              image={PHOTOS.modeDrive}
              href={cta.driverHref}
              cta="Start earning"
              dark
            />
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}

function ModeCard({
  eyebrow,
  title,
  copy,
  image,
  href,
  cta,
  accent,
  dark,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  image: string;
  href: string;
  cta: string;
  accent?: boolean;
  dark?: boolean;
}) {
  // Three card flavours — accent = brand-red ribbon, dark = black
  // panel with white text. Default = surface card.
  const ribbon = accent
    ? "after:absolute after:left-0 after:top-0 after:h-1 after:w-full after:bg-rajlo-red"
    : "";
  const bodyTone = dark
    ? "bg-rajlo-black text-white"
    : "bg-surface text-foreground";
  const ctaCls = dark
    ? "text-white hover:text-rajlo-red"
    : "text-rajlo-red hover:text-primary-hover";
  return (
    <HoverLift>
      <div
        className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl ${ribbon}`}
      >
        <div className="relative h-56 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
            style={{ backgroundImage: `url(${image})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-rajlo-black/70 via-rajlo-black/10 to-transparent" />
          <p className="absolute left-5 top-5 font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/90">
            {eyebrow}
          </p>
        </div>
        <div className={`flex flex-1 flex-col p-6 ${bodyTone}`}>
          <h3 className="text-xl font-extrabold leading-tight tracking-tight">
            {title}
          </h3>
          <p
            className={`mt-2 flex-1 text-sm leading-relaxed ${
              dark ? "text-white/75" : "text-muted"
            }`}
          >
            {copy}
          </p>
          <Link
            href={href}
            className={`mt-5 inline-flex items-center gap-2 text-sm font-extrabold transition-colors ${ctaCls}`}
          >
            {cta}
            <Icon
              name="arrow-right"
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>
    </HoverLift>
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
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href={cta.riderHref}
                className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                Get started free
                <Icon name="arrow-right" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {/* Google Play badge — assets in /public/playstore. */}
              <a
                href="#"
                aria-label="Get it on Google Play"
                className="inline-flex items-center gap-3 rounded-2xl border border-white/30 bg-black/60 px-5 py-3 text-left text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white"
              >
                {/* Inline Play-store glyph — no need for a new icon
                   entry just for the badge. */}
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-6 w-6 text-rajlo-red"
                  aria-hidden
                >
                  <path d="M3 2.5a1 1 0 0 1 1.5-.87l15 8.66a1 1 0 0 1 0 1.74l-15 8.66A1 1 0 0 1 3 19.83V2.5z" />
                </svg>
                <span className="leading-tight">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-white/70">
                    Get it on
                  </span>
                  <span className="block text-base font-extrabold">
                    Google Play
                  </span>
                </span>
              </a>
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
              <div className="group relative h-72 overflow-hidden rounded-3xl">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                  style={{ backgroundImage: `url(${p.image})` }}
                />
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

        {/* Counter strip — animated on first scroll into view. */}
        <FadeUp delay={0.4}>
          <div className="mt-14 grid grid-cols-2 gap-4 rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur md:grid-cols-4 md:gap-6 md:p-10">
            <CounterCell value={1500} suffix="+" label="Verified drivers" />
            <CounterCell value={50} suffix="+" label="Active route corridors" />
            {/* `4.8` is decimal — the CountUp helper rounds to integers,
               so render it as a static value. The visual rhythm of the
               row is identical. */}
            <StaticStat value="4.8" label="Average rating" />
            <CounterCell value={99} suffix="%" label="Cashless trips" />
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function CounterCell({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="text-center md:text-left">
      <p className="text-3xl font-extrabold leading-none tracking-tight text-white md:text-5xl">
        <CountUp to={value} />
        {suffix ?? ""}
      </p>
      <p className="mt-2 font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/60 md:text-[11px]">
        {label}
      </p>
    </div>
  );
}

function StaticStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center md:text-left">
      <p className="text-3xl font-extrabold leading-none tracking-tight text-white md:text-5xl">
        {value}
      </p>
      <p className="mt-2 font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/60 md:text-[11px]">
        {label}
      </p>
    </div>
  );
}

/* ────────────────────────  6. Driver recruitment ──────────────────────── */

function DriverRecruit({ cta }: { cta: LandingCtaTargets }) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${PHOTOS.driverHero})` }}
      />
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
              Top-tier Rajlo drivers clear over JMD 30,000 a week on private
              rides + route taxi combined. No quotas, no take-rates that
              creep up — just transparent earnings paid weekly to your bank.
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

/* ────────────────────────  7. Testimonials ──────────────────────── */

const TESTIMONIALS = [
  {
    quote:
      "I used to wait 20 minutes flagging down a taxi on Hope Road. Rajlo gets me one in three. Plus the fare's the fare — no debate.",
    name: "Tanesha",
    role: "Rider · Kingston",
    photo: PHOTOS.testimonialA,
  },
  {
    quote:
      "First week I made more on Rajlo than two weeks running a normal route. Payouts hit my bank every Friday like clockwork.",
    name: "Marlon",
    role: "Driver · St. Catherine",
    photo: PHOTOS.testimonialB,
  },
  {
    quote:
      "The route taxi mode is what sold me. Same fare as the official TA tariff, but I know which corridor and when. No more guessing.",
    name: "Keisha",
    role: "Rider · Mandeville",
    photo: PHOTOS.testimonialC,
  },
];

function Testimonials() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % TESTIMONIALS.length),
      5500,
    );
    return () => clearInterval(t);
  }, []);

  const active = TESTIMONIALS[idx];
  return (
    <section className="relative bg-surface py-20 md:py-28">
      <ArcWatermark
        variant="red"
        size={360}
        className="pointer-events-none absolute -right-24 top-8 opacity-25"
      />
      <div className="relative mx-auto max-w-5xl px-6 text-center md:px-12">
        <FadeUp>
          <p className="font-secondary text-[11px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red">
            Riders + drivers
          </p>
          <h2 className="mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
            Why Jamaica picks Rajlo.
          </h2>
        </FadeUp>

        <div className="relative mt-12 min-h-[280px]">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className={`absolute inset-0 flex flex-col items-center transition-all duration-700 ${
                i === idx
                  ? "opacity-100 translate-y-0"
                  : "pointer-events-none opacity-0 translate-y-4"
              }`}
            >
              <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-primary-soft shadow-xl ring-4 ring-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.photo}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
              <p className="mt-6 max-w-3xl text-xl font-extrabold leading-snug text-foreground md:text-2xl">
                &ldquo;{t.quote}&rdquo;
              </p>
              <p className="mt-4 font-secondary text-[11px] font-extrabold uppercase tracking-[0.3em] text-rajlo-red">
                {t.name} · {t.role}
              </p>
            </div>
          ))}
        </div>

        {/* Live cue: the active testimonial id matches the dot. */}
        <div className="mt-8 flex justify-center gap-2">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show testimonial ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-10 bg-rajlo-red" : "w-2 bg-muted/40"
              }`}
            />
          ))}
        </div>

        {/* Tiny trust badge strip beneath. */}
        <FadeUp delay={0.2}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-line pt-8 text-[11px] font-bold uppercase tracking-wider text-muted">
            <span>★ 4.8 average rating</span>
            <span>·</span>
            <span>TA-licensed PPV fleet</span>
            <span>·</span>
            <span>End-to-end encrypted chats</span>
            <span>·</span>
            <span>24/7 safety line</span>
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
