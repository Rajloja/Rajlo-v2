"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArcWatermark } from "./arc-pattern";
import { PhoneMockup, RiderRequestScreen } from "./phone-mockup";
import { Icon } from "./icons";
import { FadeUp, Typewriter } from "./anim";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";
import { PHOTOS, BRAND_FALLBACK_BG } from "./landing-assets";

/**
 * Landing hero — the only genuinely interactive section on the
 * page. Reasons it must be a client component:
 *
 *   - The 4-photo carousel auto-rotates via useState/useEffect and
 *     the dot buttons let the user manually advance.
 *   - The Typewriter primitive that cycles "Ride. / Drive. / Move. /
 *     Earn." needs the browser to animate.
 *
 * Every other section of the landing is a plain server component
 * with client islands (FadeUp, Stagger) for entrance animations
 * only. Splitting Hero out lets the rest of the page stream as
 * server-rendered HTML instead of paying the full client-bundle
 * cost the whole page used to incur.
 */
export function LandingHero({ cta }: { cta: LandingCtaTargets }) {
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
         "Made for Jamaica" pill never sits under the glass strip. */}
      <div className="relative mx-auto grid min-h-[92vh] max-w-7xl items-center gap-12 px-6 pb-16 pt-28 md:pb-24 md:pt-32 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-36">
        {/* ─────── LEFT: brand panel + content ─────── */}
        <div className="relative">
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
                    priority={i === 0}
                  />
                </div>
              ))}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-rajlo-black/55 via-transparent to-transparent"
              />
              <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-rajlo-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live · Kingston
              </div>
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

      {/* Trust strip pinned to the bottom of the hero. */}
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
