"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { m, useReducedMotion, AnimatePresence } from "motion/react";
import { MarketingShell } from "@/components/marketing-shell";
import { Icon } from "@/components/icons";
import { PHOTOS, BRAND_FALLBACK_BG } from "@/components/landing-assets";
import {
  reveal,
  revealTransition,
  staggerParent,
  hoverLift,
  hoverLiftTransition,
  tapDown,
} from "@/lib/animations";
import {
  calculateRouteFare,
  calculateRouteFareDetailed,
  calculateConcessionFare,
  getRouteTaxiTariff,
  ROUTE_TAXI_ROUNDING_JMD,
} from "@/lib/fare-engine";
import { fareForDistance, formatJMD, FARE_CONFIG } from "@/lib/jamaica";

/**
 * Public fare estimator — built on the real fare engine, no mock math.
 *
 * Two modes mirror the booking flow:
 *
 *   Route Taxi   → `calculateRouteFare(km)` from the TA-anchored
 *                  time-aware tariff (2023 / June 2026 / July 2026
 *                  phases). Optional concession toggle halves the
 *                  fare for children, students in uniform, seniors,
 *                  and physically disabled riders.
 *
 *   Private Ride → `fareForDistance(...)` from FARE_CONFIG: base +
 *                  km*perKm + stops + extra seats, min-fare floor.
 *
 * Visual language inherits from landing-v3:
 *   - Tab-and-slider booking-widget shape
 *   - Editorial pull-quote treatment for the fare display (huge red
 *     number with horizontal rules above and below)
 *   - Live tariff strip (same numbers the rest of the public surface
 *     cites, computed from `getRouteTaxiTariff()`)
 *   - No ArcWatermark, no mock pricing, no surge.
 */

type Mode = "route_taxi" | "private";

const DISTANCE_MIN_KM = 1;
const DISTANCE_MAX_KM = 100;
const DISTANCE_DEFAULT_KM = 8;

export default function FareEstimatorPage() {
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>("route_taxi");
  const [distanceKm, setDistanceKm] = useState(DISTANCE_DEFAULT_KM);
  const [concession, setConcession] = useState(false);
  const [seats, setSeats] = useState(1);
  const [stops, setStops] = useState(0);

  // Hold the active tariff. Resolved per render so a phase rollover
  // (e.g. July 1 tariff bump) auto-refreshes the displayed numbers.
  const tariff = getRouteTaxiTariff();

  // Route-taxi math (live).
  const routeTaxi = useMemo(() => {
    const detailed = calculateRouteFareDetailed(distanceKm);
    const fareJmd = concession
      ? calculateConcessionFare(distanceKm)
      : detailed.roundedFareJmd;
    return { detailed, fareJmd };
  }, [distanceKm, concession]);

  // Private math (live).
  const privateFare = useMemo(() => {
    return fareForDistance({
      totalKm: distanceKm,
      etaMinutes: Math.round((distanceKm / 32) * 60), // ~32 km/h urban JM
      intermediateStops: stops,
      extraSeats: Math.max(0, seats - 1),
    });
  }, [distanceKm, stops, seats]);

  const displayedFareJmd =
    mode === "route_taxi" ? routeTaxi.fareJmd : privateFare.fareJMD;

  // Reset side controls when mode flips so leftover state doesn't bleed.
  useEffect(() => {
    if (mode === "route_taxi") {
      setSeats(1);
      setStops(0);
    } else {
      setConcession(false);
    }
  }, [mode]);

  return (
    <MarketingShell>
      {/* ─── HERO STRIP ─── Compact, dark, photo-backed. */}
      <section className="relative isolate overflow-hidden">
        <div className="relative min-h-[360px] md:min-h-[420px]">
          <div
            className="absolute inset-0"
            style={{ background: BRAND_FALLBACK_BG }}
          >
            <Image
              src={PHOTOS.hero[2]}
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
                "radial-gradient(circle at 88% 110%, rgba(241,1,0,0.32) 0%, rgba(241,1,0,0) 50%)",
            }}
          />

          <div className="relative mx-auto flex max-w-6xl flex-col justify-center px-6 pb-28 pt-28 text-white md:pb-36 md:pt-32 lg:px-12">
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
                Fare estimator
              </m.p>
              <m.h1
                variants={reveal}
                transition={revealTransition}
                className="mt-4 text-[clamp(2rem,3.5vw+1rem,3.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]"
              >
                What you pay is what the{" "}
                <span className="inline-block rounded-2xl bg-rajlo-red px-3 py-0.5 text-white md:px-4">
                  law says.
                </span>
              </m.h1>
              <m.p
                variants={reveal}
                transition={revealTransition}
                className="mt-4 max-w-xl text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base"
              >
                Slide the distance. Pick the mode. Real numbers from the
                official Transport Authority tariff for route taxis, or our
                published per-km rate for private rides. No surge.
              </m.p>
            </m.div>
          </div>
        </div>
      </section>

      {/* ─── CALCULATOR ─── Floating card that overlaps the hero edge. */}
      <section className="relative">
        <div className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 sm:px-6 md:-mt-14 lg:px-8">
          <m.div
            initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
            animate={
              reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
            }
            transition={{ type: "spring", duration: 0.6, bounce: 0, delay: 0.1 }}
            className="overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] md:p-7 lg:p-8"
          >
            {/* Mode tabs */}
            <div
              role="tablist"
              aria-label="Choose a fare mode"
              className="inline-flex rounded-full border border-line bg-surface-soft p-1 text-xs font-extrabold uppercase tracking-[0.18em] md:text-[13px]"
            >
              {(
                [
                  { id: "route_taxi", label: "Route taxi" },
                  { id: "private", label: "Private ride" },
                ] as const
              ).map((tab) => {
                const active = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setMode(tab.id)}
                    className={`relative rounded-full px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red md:px-5 ${
                      active
                        ? "bg-rajlo-red text-white shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Distance slider */}
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="distance"
                  className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted"
                >
                  Trip distance
                </label>
                <span className="font-secondary text-lg font-extrabold tracking-tight tabular-nums text-foreground md:text-xl">
                  {distanceKm.toFixed(1)} km
                </span>
              </div>
              <input
                id="distance"
                type="range"
                min={DISTANCE_MIN_KM}
                max={DISTANCE_MAX_KM}
                step={0.5}
                value={distanceKm}
                onChange={(e) => setDistanceKm(parseFloat(e.target.value))}
                className="mt-3 w-full accent-rajlo-red"
                aria-label="Trip distance in kilometres"
              />
              <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted">
                <span>{DISTANCE_MIN_KM} km</span>
                <span>{DISTANCE_MAX_KM} km</span>
              </div>
            </div>

            {/* Mode-specific controls */}
            <div className="mt-5">
              {mode === "route_taxi" ? (
                <RouteTaxiControls
                  concession={concession}
                  onToggleConcession={() => setConcession((c) => !c)}
                />
              ) : (
                <PrivateRideControls
                  seats={seats}
                  onSeats={setSeats}
                  stops={stops}
                  onStops={setStops}
                />
              )}
            </div>

            {/* ─── FARE DISPLAY ─── Editorial pull-quote. Huge red number
               bracketed by horizontal rules — same shape as the landing
               v3 tariff section, just driven by live state. */}
            <div className="mt-8 border-t border-line pt-7 md:mt-10 md:pt-9">
              <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                Estimated total
              </p>
              <div className="mt-2 flex items-baseline gap-3">
                <AnimatePresence mode="wait" initial={false}>
                  <m.p
                    key={`${mode}-${displayedFareJmd}-${concession}`}
                    initial={reduce ? false : { opacity: 0, y: "0.25em" }}
                    animate={reduce ? undefined : { opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: "-0.25em" }}
                    transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                    className="text-[clamp(2.75rem,5vw+1rem,5rem)] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-rajlo-red"
                  >
                    {formatJMD(displayedFareJmd)}
                  </m.p>
                </AnimatePresence>
                {mode === "route_taxi" && concession && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                    Half-fare
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-muted">
                {mode === "route_taxi"
                  ? `${tariff.label} · base $${tariff.baseRateJmd.toFixed(2)} + $${tariff.perKmRateJmd.toFixed(2)}/km · rounded to nearest $${ROUTE_TAXI_ROUNDING_JMD}`
                  : `Base $${FARE_CONFIG.baseFareJMD} + $${FARE_CONFIG.perKmJMD}/km · min fare $${FARE_CONFIG.minFareJMD}`}
              </p>
            </div>

            {/* ─── BREAKDOWN ─── Mode-specific worked example. */}
            <div className="mt-7 border-t border-line pt-7 md:mt-9 md:pt-9">
              <p className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                How we got there
              </p>
              {mode === "route_taxi" ? (
                <RouteTaxiBreakdown
                  distanceKm={distanceKm}
                  detailed={routeTaxi.detailed}
                  concession={concession}
                  concessionFareJmd={routeTaxi.fareJmd}
                />
              ) : (
                <PrivateBreakdown
                  breakdown={privateFare.breakdown}
                  totalJmd={privateFare.fareJMD}
                />
              )}
            </div>

            {/* ─── CTA ─── */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 md:mt-9">
              <p className="text-xs text-muted md:text-sm">
                Final fare confirmed at booking. Auto-debits from your
                cashless Rajlo wallet at trip end.
              </p>
              <m.div
                whileHover={hoverLift}
                whileTap={tapDown}
                transition={hoverLiftTransition}
              >
                <Link
                  href="/auth/rider/login?next=/rider/request"
                  className="group inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-colors hover:bg-primary-hover hover:shadow-rajlo-red/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rajlo-red"
                >
                  Book a ride
                  <Icon
                    name="arrow-right"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </m.div>
            </div>
          </m.div>
        </div>

        {/* ─── TARIFF STRIP ─── Pinned below the calculator on light
           surface — same numbers the rest of the public surface cites. */}
        <div className="relative mt-20 border-t border-line bg-surface-soft md:mt-28">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-muted md:tracking-[0.3em] lg:justify-between lg:px-12">
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full bg-emerald-500 ${reduce ? "" : "animate-pulse"}`}
              />
              <span className="text-foreground">{tariff.label}</span>
              <span className="text-line">·</span>
              <span className="tabular-nums">
                Base ${tariff.baseRateJmd.toFixed(2)} · $
                {tariff.perKmRateJmd.toFixed(2)}/km
              </span>
            </span>
            <span className="hidden items-center gap-6 md:flex">
              <span className="flex items-center gap-2">
                <Icon name="shield-check" className="h-3.5 w-3.5 text-rajlo-red" />
                TA-regulated
              </span>
              <span className="flex items-center gap-2">
                <Icon name="wallet" className="h-3.5 w-3.5 text-rajlo-red" />
                Wallet-only
              </span>
              <span className="flex items-center gap-2">
                <Icon name="map-pin" className="h-3.5 w-3.5 text-rajlo-red" />
                Island-wide
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ─── CLOSER ─── Brand-red drench panel that mirrors landing v3 §8. */}
      <section
        className="relative overflow-hidden py-20 text-white md:py-28"
        style={{
          background:
            "radial-gradient(circle at 10% -10%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%), linear-gradient(160deg, #f10100 0%, #d40100 55%, #a30000 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <m.h2
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            className="text-[clamp(1.75rem,2.5vw+1rem,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]"
          >
            Same math, every time.
          </m.h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base">
            No surge. No haggling. No &ldquo;for-you&rdquo; experiments. The
            formula is published; the fare is whatever the formula says.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth/rider/login?next=/rider/request"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-extrabold text-rajlo-red shadow-lg transition-colors hover:bg-white/95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Book a ride
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/10 px-7 py-3 text-sm font-extrabold text-white backdrop-blur transition-colors hover:border-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              How it works
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/* ───────── Mode-specific controls ───────── */

function RouteTaxiControls({
  concession,
  onToggleConcession,
}: {
  concession: boolean;
  onToggleConcession: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggleConcession}
      aria-pressed={concession}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
        concession
          ? "border-emerald-500/40 bg-emerald-50 shadow-sm"
          : "border-line bg-surface hover:border-emerald-500/30"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          concession
            ? "bg-emerald-600 text-white"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        <Icon name="users" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold tracking-tight text-foreground">
          I qualify for half-fare
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
          Students in uniform, children, seniors, and physically disabled
          riders pay half the TA fare.
        </span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          concession ? "bg-emerald-600" : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-all ${
            concession ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function PrivateRideControls({
  seats,
  onSeats,
  stops,
  onStops,
}: {
  seats: number;
  onSeats: (n: number) => void;
  stops: number;
  onStops: (n: number) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-line bg-background p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
          Passengers
        </p>
        <div className="mt-3 inline-flex rounded-full border border-line bg-surface-soft p-1">
          {[1, 2, 3, 4].map((n) => {
            const active = seats === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onSeats(n)}
                aria-pressed={active}
                className={`inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-full px-3 text-sm font-extrabold transition-colors ${
                  active
                    ? "bg-rajlo-red text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-background p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
          Extra stops
        </p>
        <div className="mt-3 inline-flex rounded-full border border-line bg-surface-soft p-1">
          {[0, 1, 2, 3].map((n) => {
            const active = stops === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onStops(n)}
                aria-pressed={active}
                className={`inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-full px-3 text-sm font-extrabold transition-colors ${
                  active
                    ? "bg-rajlo-red text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────── Breakdowns ───────── */

function RouteTaxiBreakdown({
  distanceKm,
  detailed,
  concession,
  concessionFareJmd,
}: {
  distanceKm: number;
  detailed: ReturnType<typeof calculateRouteFareDetailed>;
  concession: boolean;
  concessionFareJmd: number;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface-soft p-5 md:p-6">
      <p className="break-words font-mono text-sm font-semibold text-foreground tabular-nums md:text-base">
        <span className="text-rajlo-red">
          ${detailed.tariff.baseRateJmd.toFixed(2)}
        </span>{" "}
        +{" "}
        <span className="text-rajlo-red">
          ({distanceKm.toFixed(1)} × ${detailed.tariff.perKmRateJmd.toFixed(2)})
        </span>{" "}
        = ${detailed.rawFareJmd.toFixed(2)}
      </p>
      <p className="mt-2 text-xs text-muted">
        Rounded to nearest ${ROUTE_TAXI_ROUNDING_JMD} →{" "}
        <span className="font-extrabold text-rajlo-red">
          {formatJMD(detailed.roundedFareJmd)}
        </span>
        {concession && (
          <>
            {" "}
            then halved for concession →{" "}
            <span className="font-extrabold text-emerald-700">
              {formatJMD(concessionFareJmd)}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function PrivateBreakdown({
  breakdown,
  totalJmd,
}: {
  breakdown: { label: string; amountJMD: number }[];
  totalJmd: number;
}) {
  return (
    <ul className="mt-3 space-y-2 rounded-2xl border border-line bg-surface-soft p-5 md:p-6">
      {breakdown.map((row) => (
        <li
          key={row.label}
          className="flex items-center justify-between text-sm"
        >
          <span className="text-muted">{row.label}</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatJMD(row.amountJMD)}
          </span>
        </li>
      ))}
      <li className="flex items-center justify-between border-t border-line pt-3 text-base font-extrabold">
        <span>Total (rounded, min ${FARE_CONFIG.minFareJMD})</span>
        <span className="tabular-nums text-rajlo-red">
          {formatJMD(totalJmd)}
        </span>
      </li>
    </ul>
  );
}
