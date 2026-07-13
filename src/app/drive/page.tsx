import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";

/**
 * /driver — Driver-audience marketing landing.
 *
 * Sibling to the rider-focused root (rajlo.com). This page:
 *
 *   - Uses SiteHeader in variant="driver" so the top nav swaps
 *     "Drive with us" → "Ride with us" (routes back to the rider
 *     home) and collapses the sign-in text + CTA into a single
 *     "Sign in" button pointing at /auth/driver/login.
 *   - Carries the "Your car. Your hours." recruitment sections that
 *     used to live inside the rider landing's LandingV3Modes (the
 *     dark ModeRow) and the standalone LandingV3Driver full-bleed —
 *     both were removed from the rider landing in the July 2026
 *     redesign since the rider audience shouldn't be recruited-at.
 *   - Deep-links into /driver-join for the full application flow
 *     (documents, TA badge, TRN, etc.) — this page is the pitch,
 *     /driver-join is the wizard.
 *
 * Rendered as a plain server component. No client islands needed —
 * the entire page is static marketing content.
 */

export const metadata: Metadata = {
  title: "Drive with Rajlo — Earn as a verified Jamaica rideshare driver",
  description:
    "Use your own car, set your own hours, take private rides and shared route-taxi trips from one app. Transparent commission. Weekly payouts to any Jamaican bank.",
  alternates: { canonical: "/drive" },
};

export default function DriverMarketingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader variant="driver" transparentOverDark />

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-rajlo-black py-32 text-white md:py-40 lg:py-48">
        <ArcWatermark
          size={720}
          variant="red"
          className="absolute -right-40 -top-32 opacity-[0.15]"
        />
        <ArcWatermark
          size={520}
          variant="red"
          className="absolute -left-24 -bottom-24 opacity-[0.10]"
        />
        <div className="relative mx-auto max-w-6xl px-6 lg:px-12">
          <p className="font-secondary text-xs font-bold uppercase tracking-[0.3em] text-rajlo-red md:text-[13px]">
            Drive with Rajlo
          </p>
          <h1 className="mt-4 max-w-3xl text-[clamp(2.5rem,4vw+1rem,5rem)] font-extrabold leading-[1.05] tracking-[-0.03em] [text-wrap:balance]">
            Your car.{" "}
            <span className="text-rajlo-red">Your hours.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/80 [text-wrap:pretty] md:text-lg">
            Use your own car, set your own hours, take both private rides and
            shared route-taxi trips from one app. Transparent commission.
            Weekly payouts to your Jamaican bank.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/driver-join"
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Start your application
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/driver/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-extrabold text-white/90 transition-colors hover:bg-white/15"
            >
              Existing driver — sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Three-up value strip ─── */}
      <section className="border-b border-line bg-surface-soft py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3 md:gap-8 lg:px-12">
          {[
            {
              icon: "trending-up" as const,
              title: "Transparent commission",
              body: "Fixed percentage published up front. No creeping take-rates, no hidden fees.",
            },
            {
              icon: "wallet" as const,
              title: "Weekly bank payouts",
              body: "Every Monday, direct to any Jamaican bank. Same commission every week, published in-app.",
            },
            {
              icon: "shield-check" as const,
              title: "Both modes, one dashboard",
              body: "Private ride + Route taxi from a single approval. Turn on whichever fits your day.",
            },
          ].map((item) => (
            <div key={item.title} className="flex flex-col">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rajlo-red/10 text-rajlo-red">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-extrabold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How you get on the road ─── */}
      <section className="bg-background py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-6 lg:px-12">
          <h2 className="text-[clamp(1.75rem,2vw+1rem,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.025em] [text-wrap:balance]">
            How you get on the road
          </h2>
          <ol className="mt-10 space-y-8">
            {[
              {
                n: 1,
                title: "Apply in about 10 minutes",
                body: "TRN, TA badge, driver's licence, red-plate registration, insurance, police record. Upload photos of each — we walk you through what to snap.",
              },
              {
                n: 2,
                title: "Rajlo verifies against TA records",
                body: "1–2 business days for the initial pass. You'll get an email + push the moment your account is approved.",
              },
              {
                n: 3,
                title: "Go online, take rides",
                body: "Toggle online in the driver app. Riders start hailing you the moment you're eligible. Fares settle to your Rajlo wallet after each trip; weekly bank batches on Mondays.",
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rajlo-red text-lg font-extrabold text-white shadow-lg shadow-rajlo-red/30">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-12">
            <Link
              href="/driver-join"
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Start your application
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
