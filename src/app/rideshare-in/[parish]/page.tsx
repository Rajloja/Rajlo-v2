import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Icon } from "@/components/icons";
import { calculateRouteFare, getRouteTaxiTariff } from "@/lib/fare-engine";
import { formatJMD } from "@/lib/jamaica";
import {
  PARISH_INFO,
  PARISH_SLUGS,
  SITE_NAME,
  SITE_URL,
  slugToParish,
} from "@/lib/site-config";
// SEO landing pages deliberately do NOT resolve a personalised CTA
// target. Reading auth cookies (getLandingCtaTargets) would force
// per-request rendering and drop these pages out of static
// generation. Their audience is logged-out Google visitors, so a
// fixed CTA into the rider sign-in is correct — and keeping the page
// static means it's served from the CDN edge with zero Supabase
// egress per visit and the best possible Core Web Vitals.
const RIDER_CTA_HREF = "/auth/rider/login";

/**
 * Per-parish rideshare landing page.
 *
 * Route: `/rideshare-in/[parish]` for all 14 Jamaican parishes
 * (kingston, st-andrew, st-catherine, ...). Each page is statically
 * generated at build time via `generateStaticParams`, so they're
 * effectively as fast as a static HTML file and Google can crawl them
 * without paying React render cost on every refresh.
 *
 * SEO ingredients on every page:
 *   - Unique `<title>` and meta description mentioning the parish
 *     and its capital town
 *   - Unique H1, intro paragraph, popular-routes list (3 known
 *     destinations from PARISH_INFO)
 *   - JSON-LD Service schema with the parish in `areaServed`
 *   - Breadcrumb JSON-LD so search results show "Home › Rideshare in
 *     Kingston" instead of a bare URL
 *   - Canonical URL pointing at this exact slug so duplicates from
 *     tracking parameters don't fragment ranking signal
 *
 * Unknown slugs return 404 via `notFound()` so a typo doesn't render
 * an empty page that Google could index.
 */

/** Build-time list of every parish URL — Next pre-renders these as
 *  static HTML. */
export function generateStaticParams() {
  return PARISH_SLUGS.map((slug) => ({ parish: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ parish: string }>;
}): Promise<Metadata> {
  const { parish: slug } = await params;
  const parish = slugToParish(slug);
  if (!parish) return {};
  const info = PARISH_INFO[parish];
  const title = `Rideshare in ${parish}, Jamaica`;
  const description = `Book a ride anywhere in ${parish} with ${SITE_NAME}. Verified red-plate drivers, transparent fares, real-time tracking — from ${info.popularDestinations[0]} to ${info.popularDestinations[1]} and beyond.`;
  const canonicalPath = `/rideshare-in/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonicalPath}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ParishRideshareLanding({
  params,
}: {
  params: Promise<{ parish: string }>;
}) {
  const { parish: slug } = await params;
  const parish = slugToParish(slug);
  if (!parish) notFound();

  const info = PARISH_INFO[parish];
  const canonicalPath = `/rideshare-in/${slug}`;
  // TA tariff in effect right now — drives both the formula and the
  // human-readable copy that follows. A fare schedule change auto-
  // flows here.
  const tariff = getRouteTaxiTariff();
  // Sample fares at three typical distances so visitors get a
  // concrete price expectation without having to open the calculator.
  // Uses the TA-anchored route-taxi formula — same engine the live app
  // uses — so the numbers shown match what a rider would actually pay.
  const fareSamples = [
    { km: 3, label: "Around the corner" },
    { km: 8, label: "Across town" },
    { km: 18, label: "Cross-parish run" },
  ].map((s) => ({
    ...s,
    jmd: calculateRouteFare(s.km),
  }));

  // Service JSON-LD — tells Google "this page describes a TaxiService
  // available in [parish], Jamaica" so it can rank for local intent.
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Rideshare",
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: `${parish}, Jamaica`,
    },
    name: `${SITE_NAME} rideshare in ${parish}`,
    description: `On-demand rideshare in ${parish}, Jamaica. Verified drivers, transparent fares, real-time tracking.`,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "JMD",
      lowPrice: fareSamples[0].jmd,
      highPrice: fareSamples[2].jmd,
      offerCount: fareSamples.length,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: `Rideshare in ${parish}`,
        item: `${SITE_URL}${canonicalPath}`,
      },
    ],
  };

  // FAQ content — parish-aware where it matters (capital name,
  // popular destinations) so each parish page has a genuinely unique
  // FAQ block rather than a templated dupe Google would penalise.
  // Surfaced AS visible accordion-style content AND as FAQPage
  // JSON-LD so the page is eligible for the FAQ rich-result widget
  // (expandable Q&A snippet directly in the search result).
  const faqItems = [
    {
      q: `How long does a Rajlo pickup take in ${parish}?`,
      a: `Pickup times in ${parish} depend on driver supply at the moment you book — most ${info.capital}-area rides match a driver within 3 to 8 minutes. The ${SITE_NAME} app shows a live ETA in the pickup bubble before you confirm so there are no surprises.`,
    },
    {
      q: `How much does a ride from ${info.popularDestinations[0]} to ${info.popularDestinations[1]} cost?`,
      a: `${SITE_NAME} fares follow Jamaica's Transport Authority rate schedule — JMD $${tariff.baseRateJmd} base plus $${tariff.perKmRateJmd} per kilometre, rounded to the nearest $10. A typical run between popular ${parish} destinations falls in the ${formatJMD(fareSamples[0].jmd)} to ${formatJMD(fareSamples[2].jmd)} range. Open the app to see the exact price for your trip before booking.`,
    },
    {
      q: `Do Rajlo drivers operate at night in ${parish}?`,
      a: `Yes — ${SITE_NAME} runs 24/7. Driver availability is highest during peak hours (7–9 am, 4–7 pm) and busy weekend evenings, but you can request a ride in ${parish} at any time. Every driver is verified and red-plate licensed.`,
    },
    {
      q: "How do I pay for my ride?",
      a: `${SITE_NAME} is fully cashless. Top up your Rajlo Wallet by bank transfer or QR before booking — the trip cost is held when you confirm and settled to the driver on completion. No cash, no card-readers in the car.`,
    },
    {
      q: `Is Rajlo available across all of ${parish}?`,
      a: `${SITE_NAME} serves every parish in Jamaica, including ${info.capital} and the surrounding ${parish} towns. Driver density is highest in the parish capital and main commuter corridors; more remote areas may have slightly longer pickup windows.`,
    },
  ];

  // FAQPage schema — eligible for Google's "People also ask" / FAQ
  // rich-result accordion in the SERP. Worth a few extra lines of
  // markup because the rich-result takes vertical space on mobile
  // SERPs that competitors without FAQ schema can't claim.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader bookHref={RIDER_CTA_HREF} bookLabel="Book a ride" />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-rajlo-red">
            Rajlo · {parish}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl">
            Rideshare in {parish}, Jamaica
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            {info.vibe} Whether you're heading from{" "}
            <strong className="text-foreground">
              {info.popularDestinations[0]}
            </strong>{" "}
            to{" "}
            <strong className="text-foreground">
              {info.popularDestinations[1]}
            </strong>{" "}
            or anywhere else in {parish}, {SITE_NAME} matches you with
            a verified driver in minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={RIDER_CTA_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5"
            >
              Book a ride in {parish}
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              href="/fare-estimator"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-6 py-3 text-sm font-bold text-foreground hover:bg-surface-2"
            >
              Estimate fare
            </Link>
          </div>
        </div>
      </section>

      {/* ── Fare samples ────────────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            What rides cost in {parish}
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Fares follow Jamaica's Transport Authority rates — flat $
            {tariff.baseRateJmd} base plus ${tariff.perKmRateJmd} per
            kilometre, rounded to the nearest $10. No surge, no surprises.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {fareSamples.map((sample) => (
              <div
                key={sample.km}
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  {sample.label}
                </p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight">
                  {formatJMD(sample.jmd)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  ~{sample.km} km
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Popular destinations ──────────────────────────────── */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            Popular destinations in {parish}
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            {SITE_NAME} drivers know {parish} — from the everyday runs
            to {info.capital} and out to the surrounding towns.
          </p>
          <ul className="mt-8 grid gap-3 md:grid-cols-3">
            {info.popularDestinations.map((dest) => (
              <li
                key={dest}
                className="flex items-center gap-3 rounded-xl border border-line bg-background p-4"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-rajlo-red/10 text-rajlo-red">
                  <Icon name="map-pin" className="h-4 w-4" />
                </span>
                <span className="font-bold">{dest}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it works (local context) ─────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            How {SITE_NAME} works in {parish}
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Open the app",
                body: `Tap "Book a ride" — drop your pickup anywhere in ${parish} and where you're heading.`,
              },
              {
                step: "2",
                title: "See your fare upfront",
                body: "Transport Authority rates only — no surge, no hidden fees. You see the exact JMD price before you book.",
              },
              {
                step: "3",
                title: "Ride with a verified driver",
                body: "Red-plate drivers, real-time tracking, in-app chat. Pay by Rajlo Wallet or QR — never cash.",
              },
            ].map((s) => (
              <li
                key={s.step}
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rajlo-red text-sm font-bold text-white">
                  {s.step}
                </span>
                <h3 className="mt-3 text-lg font-extrabold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      {/* `<details>` is a native HTML disclosure — no JS needed, fully
         keyboard accessible, and Googlebot reads the inner text the
         same whether the section is open or closed (so collapsing
         long answers doesn't cost ranking signal). Pairs with the
         FAQPage JSON-LD above to qualify for SERP rich results. */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            Frequently asked questions about {SITE_NAME} in {parish}
          </h2>
          <p className="mt-2 text-muted">
            Quick answers for first-time riders in {parish}.
          </p>
          <div className="mt-8 space-y-3">
            {faqItems.map((item, i) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-line bg-surface open:bg-background"
                // Default-open the first question so visitors see a
                // sample answer without having to click — gives the
                // section visible content weight on first paint.
                open={i === 0}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-base font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red/10 text-rajlo-red transition-transform group-open:rotate-180">
                    <Icon name="chevron-down" className="h-4 w-4" />
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Other parishes ──────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-extrabold tracking-tight">
            {SITE_NAME} across Jamaica
          </h2>
          <p className="mt-2 text-sm text-muted">
            Riding in another parish? We're there too.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {PARISH_SLUGS.filter((s) => s !== slug).map((otherSlug) => {
              const other = slugToParish(otherSlug);
              if (!other) return null;
              return (
                <li key={otherSlug}>
                  <Link
                    href={`/rideshare-in/${otherSlug}`}
                    className="inline-flex items-center rounded-full border border-line bg-background px-4 py-2 text-sm font-semibold hover:border-rajlo-red hover:text-rajlo-red"
                  >
                    Rideshare in {other}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="border-t border-line bg-background">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Ready to ride in {parish}?
          </h2>
          <p className="mt-3 text-muted">
            Open {SITE_NAME}, drop your pickup, and you're matched with a
            verified driver in minutes.
          </p>
          <Link
            href={RIDER_CTA_HREF}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-8 py-4 text-base font-bold text-white shadow-xl shadow-rajlo-red/30 transition-all hover:-translate-y-0.5"
          >
            Book a ride
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
