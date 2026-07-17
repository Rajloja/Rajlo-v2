import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Icon } from "@/components/icons";
import {
  PARISH_INFO,
  PARISH_SLUGS,
  SITE_NAME,
  SITE_URL,
  slugToParish,
} from "@/lib/site-config";

/**
 * Per-parish driver acquisition landing page.
 *
 * Route: `/driver-jobs-in/[parish]` for every parish. Each page is
 * statically generated at build time. Targets local search intent
 * like "driver jobs in Kingston Jamaica" — queries the generic
 * /driver-join page can't rank for because it lacks the parish in
 * the title, H1, and body.
 *
 * Two pieces of structured data per page:
 *   1. **JobPosting** with the parish in `jobLocation` — opens this
 *      page up to appearing in Google's "Jobs" rich-result cluster
 *      for parish-specific job searches.
 *   2. **BreadcrumbList** so the SERP shows "Home › Driver jobs in
 *      Kingston" instead of a bare URL.
 *
 * Each page funnels the apply CTA to `/driver-join` (the canonical
 * onboarding flow) so we don't have to maintain 14 copies of the
 * signup form.
 */

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
  const title = `Driver Jobs in ${parish}, Jamaica`;
  const description = `Drive with ${SITE_NAME} in ${parish}. Verified red-plate driver opportunities, transparent payouts, in-app dispatch. Apply in minutes.`;
  const canonicalPath = `/driver-jobs-in/${slug}`;
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

export default async function DriverJobsInParish({
  params,
}: {
  params: Promise<{ parish: string }>;
}) {
  const { parish: slug } = await params;
  const parish = slugToParish(slug);
  if (!parish) notFound();

  const info = PARISH_INFO[parish];
  const canonicalPath = `/driver-jobs-in/${slug}`;

  // Parish-scoped JobPosting. The `jobLocation` is the parish (not
  // just "Jamaica") which is what differentiates this page from the
  // generic /driver-join JobPosting in Google's eyes.
  const jobPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: `Rideshare Driver in ${parish} — Rajlo`,
    description: `Drive with ${SITE_NAME} in ${parish}, Jamaica. ${info.vibe} Open to verified red-plate drivers — applications take minutes.`,
    datePosted: "2026-01-01",
    validThrough: "2027-01-01",
    employmentType: "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: SITE_NAME,
      sameAs: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        // Driving is a mobile role — the "office" is the vehicle in
        // the parish. We fill streetAddress/postalCode with the
        // capital-town anchor so Google's Jobs validator has all six
        // PostalAddress fields it wants; Jamaica has no nationally-
        // assigned postal codes, so a parish-slug placeholder is the
        // best we can offer without inventing false data.
        streetAddress: `${info.capital}, ${parish}`,
        addressLocality: info.capital,
        addressRegion: parish,
        postalCode: `JM-${slug.toUpperCase()}`,
        addressCountry: "JM",
      },
    },
    // Rideshare driver earnings vary trip-by-trip; the schema requires
    // a MonetaryAmount to unlock the salary chip in Google's Jobs
    // rich result, so we quote a realistic WEEK band drivers on the
    // platform hit. Not a guarantee — matches the "typical earnings"
    // language on /driver-join.
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "JMD",
      value: {
        "@type": "QuantitativeValue",
        minValue: 30000,
        maxValue: 80000,
        unitText: "WEEK",
      },
    },
    applicantLocationRequirements: {
      "@type": "Country",
      name: "Jamaica",
    },
    directApply: true,
    url: `${SITE_URL}${canonicalPath}`,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Drive with Rajlo",
        item: `${SITE_URL}/driver-join`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `Driver jobs in ${parish}`,
        item: `${SITE_URL}${canonicalPath}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader bookHref="/driver-join" bookLabel="Apply now" />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line bg-rajlo-black py-16 text-white md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-rajlo-red">
            Drive with Rajlo · {parish}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl">
            Driver jobs in {parish}, Jamaica
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/85">
            {info.vibe} {SITE_NAME} is recruiting verified red-plate
            drivers across {parish} — earn on your own schedule with
            transparent fares and same-week payouts.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/driver-join"
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5"
            >
              Apply to drive
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <Link
              href="/help"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              Driver FAQ
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why drive with Rajlo (parish-aware) ──────────────── */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            Why drivers choose {SITE_NAME} in {parish}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "wallet" as const,
                title: "Transparent payouts",
                body: "TA-anchored fares — no surge nonsense. You see exactly what each trip pays before you accept.",
              },
              {
                icon: "shield-check" as const,
                title: "Verified rider base",
                body: "Every Rajlo rider passes ID + payment verification. No cash, no flake-outs — just paid trips.",
              },
              {
                icon: "map-pin" as const,
                title: `Local to ${parish}`,
                body: `Dispatch knows ${info.capital} and the surrounding towns. Trip volume scales with the parish's traffic.`,
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-line bg-background p-6"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rajlo-red/10 text-rajlo-red">
                  <Icon name={card.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-extrabold">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Requirements ───────────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            What you need to drive in {parish}
          </h2>
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              "Valid Jamaica driver's licence (Class B or higher)",
              "Red-plate (PPV) registration on your vehicle",
              "Valid certificate of fitness + insurance",
              "TA road licence (we help you stay current)",
              "Smartphone (Android 10+ or iOS 14+)",
              `Familiarity with ${parish} — bonus if you know ${info.popularDestinations[0]} and ${info.popularDestinations[1]}`,
            ].map((req) => (
              <li
                key={req}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rajlo-red/10 text-rajlo-red">
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm">{req}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Other parishes ─────────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-extrabold tracking-tight">
            Driving from another parish?
          </h2>
          <p className="mt-2 text-sm text-muted">
            We're hiring across all 14 parishes.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {PARISH_SLUGS.filter((s) => s !== slug).map((otherSlug) => {
              const other = slugToParish(otherSlug);
              if (!other) return null;
              return (
                <li key={otherSlug}>
                  <Link
                    href={`/driver-jobs-in/${otherSlug}`}
                    className="inline-flex items-center rounded-full border border-line bg-background px-4 py-2 text-sm font-semibold hover:border-rajlo-red hover:text-rajlo-red"
                  >
                    Driver jobs in {other}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="border-t border-line bg-background">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Ready to drive in {parish}?
          </h2>
          <p className="mt-3 text-muted">
            Applications take about 5 minutes. We verify, you start earning.
          </p>
          <Link
            href="/driver-join"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-8 py-4 text-base font-bold text-white shadow-xl shadow-rajlo-red/30 transition-all hover:-translate-y-0.5"
          >
            Apply to drive
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
