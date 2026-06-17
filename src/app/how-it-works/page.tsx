"use client";

import Image from "next/image";
import Link from "next/link";
import { m, useReducedMotion } from "motion/react";
import { MarketingShell } from "@/components/marketing-shell";
import { Icon, type IconName } from "@/components/icons";
import { PHOTOS, BRAND_FALLBACK_BG } from "@/components/landing-assets";
import { getRouteTaxiTariff } from "@/lib/fare-engine";
import {
  reveal,
  revealTransition,
  staggerParent,
  hoverLift,
  hoverLiftTransition,
  tapDown,
} from "@/lib/animations";

/**
 * Public "How it works" page — built on the landing-v3 design language.
 *
 * Section shape:
 *   1. Hero — full-bleed photo + dark overlay + headline
 *   2. Two modes — alternating magazine spreads (Private + Route taxi)
 *   3. Trip flow — 4-step horizontal flow with arrow connectors
 *      (no 01/02/03 numbered chrome — banned per design-system §8)
 *   4. Why it's different — 4-tile bento (asymmetric, not 2x2)
 *   5. Closer — brand-red drench panel + dual CTA
 *
 * Anti-patterns deliberately avoided:
 *   - No ArcWatermark anywhere
 *   - No identical card grids (modes section uses alternating spreads,
 *     why-section uses asymmetric bento)
 *   - No 01/02/03 step chrome
 *   - No mock/fake stats — every claim is a real product constraint
 */

export default function HowItWorksPage() {
  const reduce = useReducedMotion();
  const tariff = getRouteTaxiTariff();

  return (
    <MarketingShell>
      {/* ─── HERO ─── */}
      <section className="relative isolate overflow-hidden">
        <div className="relative min-h-[460px] md:min-h-[520px]">
          <div
            className="absolute inset-0"
            style={{ background: BRAND_FALLBACK_BG }}
          >
            <Image
              src={PHOTOS.hero[1]}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
          </div>
          <div aria-hidden className="absolute inset-0 bg-rajlo-black/80" />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 12% -6%, rgba(241,1,0,0.32) 0%, rgba(241,1,0,0) 50%)",
            }}
          />

          <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-16 pt-32 text-white md:pb-20 md:pt-40 lg:px-12 lg:pb-24">
            <m.div
              initial="initial"
              animate="animate"
              variants={staggerParent}
              className="max-w-3xl"
            >
              <m.p
                variants={reveal}
                transition={revealTransition}
                className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-[11px]"
              >
                How Rajlo works
              </m.p>
              <m.h1
                variants={reveal}
                transition={revealTransition}
                className="mt-4 text-[clamp(2.25rem,3.5vw+1rem,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]"
              >
                Two modes.{" "}
                <span className="inline-block rounded-2xl bg-rajlo-red px-3 py-0.5 text-white md:px-4">
                  One app.
                </span>{" "}
                One wallet.
              </m.h1>
              <m.p
                variants={reveal}
                transition={revealTransition}
                className="mt-5 max-w-xl text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base"
              >
                Pick the trip that fits the run. Top up once, pay zero at the
                curb. Every fare locked at booking, every driver TA-licensed,
                every receipt itemised down to the kilometre.
              </m.p>
            </m.div>
          </div>
        </div>
      </section>

      {/* ─── TWO MODES ─── Alternating magazine spreads. */}
      <section className="bg-background py-20 md:py-28 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <m.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerParent}
            className="mb-12 max-w-3xl md:mb-16"
          >
            <m.h2
              variants={reveal}
              transition={revealTransition}
              className="text-[clamp(2rem,3vw+1rem,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]"
            >
              Two ways to ride.
            </m.h2>
            <m.p
              variants={reveal}
              transition={revealTransition}
              className="mt-4 max-w-xl text-base leading-relaxed text-muted [text-wrap:pretty] md:text-lg"
            >
              Both settle from your wallet at trip end. Both run on TA-licensed
              red plates. They differ in route, in pricing, and in when you
              should pick each one.
            </m.p>
          </m.div>

          {/* Private — photo right, text left */}
          <ModeSpread
            eyebrow="Private ride"
            headline="Door to door, on your schedule."
            body="Pick a destination anywhere in Jamaica. A single driver picks you up where you are and drops you exactly where you're going. Stops, extra passengers, late-night, airport — all routine. Fare is base plus per kilometre plus any stops, settled when the driver completes the trip."
            bullets={[
              "Anywhere in Jamaica, any time",
              "1–4 passengers per booking",
              "Add stops mid-route",
              "Live tracking + share with a contact",
            ]}
            imageSrc={PHOTOS.modePrivate}
            imageAlt="A private rideshare car arriving at a pickup point"
            imageSide="right"
            tone="light"
            reduce={reduce}
          />

          {/* Route taxi — photo left, text right, dark tone */}
          <ModeSpread
            eyebrow="Route taxi"
            headline="The route taxi, properly digitised."
            body="Hail any of Jamaica's licensed route-taxi corridors from the app. Fare is the Transport Authority's published tariff, no negotiation. Half-fare for students in uniform, children, seniors, and physically disabled riders — declared in-app, verified at pickup."
            bullets={[
              `Current TA tariff: $${tariff.baseRateJmd.toFixed(2)} base · $${tariff.perKmRateJmd.toFixed(2)}/km`,
              "Multi-leg routes when no single corridor covers it",
              "Half-fare concession for eligible riders",
              "Locked at booking — no surprise increase",
            ]}
            imageSrc={PHOTOS.modeRouteTaxi}
            imageAlt="A red-plate route taxi on a Jamaican corridor"
            imageSide="left"
            tone="dark"
            reduce={reduce}
          />
        </div>
      </section>

      {/* ─── TRIP FLOW ─── Four steps, arrow connectors, no numbered chrome. */}
      <section
        className="relative overflow-hidden bg-rajlo-black py-20 text-white md:py-28 lg:py-32"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(241,1,0,0.28) 0%, rgba(241,1,0,0) 50%), linear-gradient(165deg, #1a1d10 0%, #111906 60%, #07090a 100%)",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <m.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerParent}
            className="mb-12 max-w-3xl md:mb-16"
          >
            <m.h2
              variants={reveal}
              transition={revealTransition}
              className="text-[clamp(2rem,3vw+1rem,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] [text-wrap:balance]"
            >
              From tap to door, in four moves.
            </m.h2>
            <m.p
              variants={reveal}
              transition={revealTransition}
              className="mt-4 max-w-xl text-base leading-relaxed text-white/75 [text-wrap:pretty] md:text-lg"
            >
              Same shape for both modes. The driver you see is the driver you
              get; the fare you see is the fare you pay.
            </m.p>
          </m.div>

          <div className="grid gap-8 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            <FlowStep
              icon="wallet"
              title="Top up your wallet"
              body="Add JMD to your Rajlo wallet from your bank. Cashless from the first tap — drivers carry no change and you carry no risk."
              reduce={reduce}
              delay={0}
            />
            <FlowArrow reduce={reduce} delay={0.05} />
            <FlowStep
              icon="search"
              title="Pick your trip"
              body="Type your destination. The app picks a route-taxi corridor if one covers you; otherwise you book a private ride from the same screen."
              reduce={reduce}
              delay={0.1}
            />
            <FlowArrow reduce={reduce} delay={0.15} />
            <FlowStep
              icon="navigation"
              title="Track the driver"
              body="Watch a verified TA-licensed driver approach in real time. Their plate, photo, and rating are on screen before they arrive."
              reduce={reduce}
              delay={0.2}
            />
            <FlowArrow reduce={reduce} delay={0.25} />
            <FlowStep
              icon="check-circle"
              title="Pay nothing at the curb"
              body="The fare you saw at booking auto-debits when the trip ends. Itemised receipt in your history, every kilometre, no surge."
              reduce={reduce}
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ─── WHY IT'S DIFFERENT ─── 4-tile bento, asymmetric. */}
      <section className="bg-background py-20 md:py-28 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <m.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerParent}
            className="mb-12 max-w-3xl md:mb-16"
          >
            <m.h2
              variants={reveal}
              transition={revealTransition}
              className="text-[clamp(2rem,3vw+1rem,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]"
            >
              Why this is different.
            </m.h2>
          </m.div>

          {/* Bento — 2 large photo tiles + 2 small panel tiles. */}
          <div className="grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:grid-rows-2">
            <BentoPhotoTile
              eyebrow="TA-licensed only"
              headline="Every driver is on the public record."
              body="Franchise certificate, badge, COF, PPV insurance — all valid, all checked, all the time."
              imageSrc={PHOTOS.pillarSafety}
              imageAlt="A driver showing TA-licensed credentials"
              className="lg:col-span-2"
              reduce={reduce}
            />
            <BentoPanelTile
              icon="wallet"
              eyebrow="Cashless"
              headline="No cash. Anywhere."
              body="Your wallet pays the driver, the driver gets paid weekly to their bank. Drivers carry no change; riders carry no risk."
              reduce={reduce}
            />
            <BentoPanelTile
              icon="shield-check"
              eyebrow="Transparent fare"
              headline="Same math, every trip."
              body="Published formula, locked at booking. No surge. No haggling. No 'for-you' experiments."
              reduce={reduce}
            />
            <BentoPhotoTile
              eyebrow="Made for Jamaica"
              headline="Built by people who live the routes."
              body="Half-fare concession for students in uniform, seniors, children, and physically disabled riders — coded in, not bolted on."
              imageSrc={PHOTOS.pillarLocal}
              imageAlt="A bustling Jamaican street scene"
              className="lg:col-span-2"
              reduce={reduce}
            />
          </div>
        </div>
      </section>

      {/* ─── CLOSER ─── Brand-red drench. */}
      <section
        className="relative overflow-hidden py-24 text-white md:py-32"
        style={{
          background:
            "radial-gradient(circle at 10% -10%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%), radial-gradient(circle at 100% 110%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 50%), linear-gradient(160deg, #f10100 0%, #d40100 55%, #a30000 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <m.h2
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            className="text-[clamp(2rem,3vw+1rem,3.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]"
          >
            Top up. Pick a route.
            <br />
            <span className="text-white/80">Pay nothing at the curb.</span>
          </m.h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base">
            The same wallet. The same fare every time. The same drivers, all
            verified. The way Jamaica should move.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <m.div
              whileHover={hoverLift}
              whileTap={tapDown}
              transition={hoverLiftTransition}
            >
              <Link
                href="/auth/rider/login?next=/rider/request"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-extrabold text-rajlo-red shadow-2xl shadow-black/30 transition-colors hover:bg-white/95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:text-base"
              >
                Start riding
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </m.div>
            <m.div
              whileHover={hoverLift}
              whileTap={tapDown}
              transition={hoverLiftTransition}
            >
              <Link
                href="/fare-estimator"
                className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/10 px-7 py-3.5 text-sm font-extrabold text-white backdrop-blur transition-colors hover:border-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:text-base"
              >
                Estimate a fare first
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </m.div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/* ───────── Mode spread (magazine alternating block) ───────── */

function ModeSpread({
  eyebrow,
  headline,
  body,
  bullets,
  imageSrc,
  imageAlt,
  imageSide,
  tone,
  reduce,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  imageSrc: string;
  imageAlt: string;
  imageSide: "left" | "right";
  tone: "light" | "dark";
  reduce: boolean | null;
}) {
  const photoFirst = imageSide === "left";
  const surfaceClasses =
    tone === "dark"
      ? "bg-rajlo-black text-white"
      : "bg-surface text-foreground";
  const bodyTone = tone === "dark" ? "text-white/80" : "text-muted";
  const eyebrowTone = "text-rajlo-red";

  return (
    <m.div
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, amount: 0.25 }}
      variants={staggerParent}
      className={`mt-8 grid items-stretch overflow-hidden rounded-3xl border border-line md:mt-12 md:grid-cols-2 ${surfaceClasses}`}
    >
      {/* Photo block — magazine overlap on lg+ via negative margin. */}
      <div
        className={`relative min-h-[280px] md:min-h-[420px] ${
          photoFirst ? "md:order-1" : "md:order-2"
        }`}
      >
        <div
          className="absolute inset-0"
          style={{ background: BRAND_FALLBACK_BG }}
        >
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover object-center"
          />
        </div>
      </div>

      {/* Content block */}
      <div
        className={`flex flex-col justify-center p-8 md:p-10 lg:p-14 ${
          photoFirst ? "md:order-2" : "md:order-1"
        }`}
      >
        <m.p
          variants={reveal}
          transition={revealTransition}
          className={`font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] md:text-[11px] ${eyebrowTone}`}
        >
          {eyebrow}
        </m.p>
        <m.h3
          variants={reveal}
          transition={revealTransition}
          className="mt-3 text-[clamp(1.5rem,2vw+1rem,2.25rem)] font-extrabold leading-[1.1] tracking-[-0.025em] [text-wrap:balance]"
        >
          {headline}
        </m.h3>
        <m.p
          variants={reveal}
          transition={revealTransition}
          className={`mt-4 max-w-md text-sm leading-relaxed [text-wrap:pretty] md:text-base ${bodyTone}`}
        >
          {body}
        </m.p>
        <m.ul
          variants={reveal}
          transition={revealTransition}
          className="mt-5 space-y-2 text-sm md:text-base"
        >
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 leading-relaxed">
              <span
                aria-hidden
                className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rajlo-red"
              />
              <span className={bodyTone}>{b}</span>
            </li>
          ))}
        </m.ul>
      </div>
    </m.div>
  );
}

/* ───────── Flow step (no numbered chrome) ───────── */

function FlowStep({
  icon,
  title,
  body,
  reduce,
  delay,
}: {
  icon: IconName;
  title: string;
  body: string;
  reduce: boolean | null;
  delay: number;
}) {
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0, delay }}
      className="flex flex-col items-start"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/30">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-lg font-extrabold leading-tight tracking-[-0.02em] md:text-xl">
        {title}
      </h3>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75 [text-wrap:pretty]">
        {body}
      </p>
    </m.div>
  );
}

function FlowArrow({
  reduce,
  delay,
}: {
  reduce: boolean | null;
  delay: number;
}) {
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, scaleX: 0.6 }}
      whileInView={reduce ? undefined : { opacity: 1, scaleX: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.45, ease: "easeOut", delay }}
      aria-hidden
      className="hidden self-start pt-3 lg:flex"
      style={{ transformOrigin: "left center" }}
    >
      <span className="grid h-12 w-full place-items-center text-white/40">
        <svg
          viewBox="0 0 56 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="w-14"
          aria-hidden
        >
          <path d="M2 6 L52 6 M44 1 L52 6 L44 11" />
        </svg>
      </span>
    </m.div>
  );
}

/* ───────── Bento tiles ───────── */

function BentoPhotoTile({
  eyebrow,
  headline,
  body,
  imageSrc,
  imageAlt,
  className = "",
  reduce,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  className?: string;
  reduce: boolean | null;
}) {
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={
        reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.2 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0 }}
      className={`relative isolate overflow-hidden rounded-3xl border border-line bg-rajlo-black text-white shadow-md ${className}`}
    >
      <div className="absolute inset-0" style={{ background: BRAND_FALLBACK_BG }}>
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover object-center"
        />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-rajlo-black/90 via-rajlo-black/45 to-rajlo-black/20"
      />
      <div className="relative flex h-full min-h-[260px] flex-col justify-end p-7 md:min-h-[340px] md:p-10">
        <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-[11px]">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-[clamp(1.25rem,1.5vw+1rem,2rem)] font-extrabold leading-[1.1] tracking-[-0.025em] [text-wrap:balance]">
          {headline}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 [text-wrap:pretty]">
          {body}
        </p>
      </div>
    </m.div>
  );
}

function BentoPanelTile({
  icon,
  eyebrow,
  headline,
  body,
  reduce,
}: {
  icon: IconName;
  eyebrow: string;
  headline: string;
  body: string;
  reduce: boolean | null;
}) {
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={
        reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.2 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0 }}
      className="flex h-full flex-col justify-between rounded-3xl border border-line bg-surface p-7 shadow-sm md:p-9"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rajlo-red/10 text-rajlo-red">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="mt-8">
        <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-rajlo-red md:text-[11px]">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-[clamp(1.25rem,1.25vw+1rem,1.75rem)] font-extrabold leading-[1.15] tracking-[-0.025em] text-foreground [text-wrap:balance]">
          {headline}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted [text-wrap:pretty]">
          {body}
        </p>
      </div>
    </m.div>
  );
}
