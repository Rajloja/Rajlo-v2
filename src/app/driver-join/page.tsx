import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { ArcWatermark } from "@/components/arc-pattern";
import { LogoIcon } from "@/components/logo";
import { Icon, type IconName } from "@/components/icons";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";

/**
 * Page-level metadata override. The default title/description from the
 * root layout would target the rider funnel ("Jamaica's trusted
 * rideshare platform") — this page wants to rank for driver intent
 * ("drive with Rajlo", "driver jobs Jamaica") so we surface that
 * keyword in the title + description + OG card.
 */
export const metadata: Metadata = {
  title: "Drive with Rajlo — Earn as a verified Jamaica rideshare driver",
  description:
    "Join Rajlo as a verified red-plate driver in Jamaica. Transparent payouts, in-app dispatch, all 14 parishes covered. Sign up takes minutes.",
  alternates: { canonical: "/driver-join" },
  openGraph: {
    title: "Drive with Rajlo — Earn as a verified Jamaica rideshare driver",
    description:
      "Join Rajlo as a verified red-plate driver. Transparent payouts, in-app dispatch, all 14 parishes covered.",
    url: `${SITE_URL}/driver-join`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drive with Rajlo",
    description:
      "Join Rajlo as a verified red-plate driver in Jamaica. Transparent payouts, in-app dispatch.",
  },
};

/**
 * JobPosting JSON-LD — registers this page as an open employment
 * opportunity so it can appear in Google's "Jobs" rich result
 * cluster (search for "driver jobs in Jamaica" and you'll see the
 * Jobs widget at the top). Each parish-specific page emits its own
 * variant with the parish in the location field.
 *
 * `employmentType: "CONTRACTOR"` because Rajlo drivers are
 * independent (no W2/PAYE relationship). `directApply: true` tells
 * Google to send the user to the in-page form rather than expecting
 * a third-party ATS.
 */
const DRIVER_JOB_POSTING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Rideshare Driver — Rajlo Jamaica",
  description:
    "Drive with Rajlo, Jamaica's rideshare platform. Verified red-plate drivers earn transparent fares with in-app dispatch, real-time tracking, and wallet payouts. Open to any of the 14 parishes.",
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
      addressCountry: "JM",
      addressRegion: "Jamaica",
    },
  },
  applicantLocationRequirements: {
    "@type": "Country",
    name: "Jamaica",
  },
  directApply: true,
  url: `${SITE_URL}/driver-join`,
};

/**
 * Driver recruitment / marketing landing page.
 *
 * The driver-app screenshots in public/playstore/screenshots/ drive
 * the feature sections — each one is wrapped in a phone-frame mockup
 * and paired with copy that explains the bit of the experience
 * that screen represents. Keeps the page visually anchored to the
 * actual product instead of stock imagery.
 *
 * Order of sections (top → bottom):
 *   1. Hero with two mockups (Home + Active Trip) + onboarding steps
 *   2. Live dispatch (Home screenshot)
 *   3. Active trip (Map screenshot)
 *   4. Earnings transparency (Earnings screenshot)
 *   5. Full driving log (History screenshot)
 *   6. Verified red-plate identity (Profile screenshot)
 *   7. Instant settlement (Trip-complete screenshot)
 *   8. Required documents (preserved from the previous design)
 *   9. Final CTA
 */

type Feature = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  screenshot: string;
  icon: IconName;
};

const FEATURES: Feature[] = [
  {
    eyebrow: "Live dispatch",
    title: "Go live, take rides — in seconds.",
    body:
      "Toggle online and the app lights up the moment a rider hails near you. Accept with one tap. Today, this week, and this month's earnings all sit on the home screen so you always know where you stand.",
    bullets: [
      "Real-time ride requests",
      "Today / week / month earnings at a glance",
      "Rider profile + fare + distance before you accept",
    ],
    screenshot: "/playstore/screenshots/1000536544.jpg",
    icon: "home",
  },
  {
    eyebrow: "On the road",
    title: "Drive with confidence.",
    body:
      "Live map follows your car as you move. Turn-by-turn directions to the rider's pickup, then to their drop-off, without leaving the app. The PIN we ship at pickup means you and your rider get into the right car together — every time.",
    bullets: [
      "Auto-follow map (no manual recentering)",
      "One-tap call + chat with the rider",
      "Verify-Your-Ride PIN at pickup",
    ],
    screenshot: "/playstore/screenshots/1000536545.jpg",
    icon: "navigation",
  },
  {
    eyebrow: "Earnings, transparent",
    title: "Know what you made — every day.",
    body:
      "Daily breakdown chart, best-day callout, average per trip, and your next payout — all in one place. Money lands in your Rajlo wallet the moment a trip ends; weekly bank transfers automatic by 17:00 every Monday.",
    bullets: [
      "Today / week / month rollups",
      "Per-trip average + best-day callout",
      "Automatic Monday payouts to your bank",
    ],
    screenshot: "/playstore/screenshots/1000536546.jpg",
    icon: "trending-up",
  },
  {
    eyebrow: "Every trip on record",
    title: "Your full driving log.",
    body:
      "Completed and cancelled trips with rider names, fares, parish-to-parish details, and feedback — searchable, sortable, exportable. Rate the rider after every trip; it counts toward their account score.",
    bullets: [
      "Search + filter every past trip",
      "Rider ratings in both directions",
      "Receipts on demand",
    ],
    screenshot: "/playstore/screenshots/1000536547.jpg",
    icon: "clock",
  },
  {
    eyebrow: "Verified red-plate",
    title: "Trusted by riders before pickup.",
    body:
      "Your TA-verified Transport Authority selfie, vehicle make/model/colour, and red-plate number appear on every rider's match screen. They know exactly who's coming and what to look for — fewer wrong-car incidents, faster pickups.",
    bullets: [
      "TA Franchise + Badge re-verified annually",
      "Vehicle + plate shown to every matched rider",
      "Police record & insurance documents on file",
    ],
    screenshot: "/playstore/screenshots/1000536548.jpg",
    icon: "shield-check",
  },
  {
    eyebrow: "Instant settlement",
    title: "Paid the moment you finish.",
    body:
      "No cash, no chase, no awkward end-of-trip math. The rider's wallet is debited and your earnings credited the second you tap Complete. Trip total, distance, time, and your cut — all on the receipt.",
    bullets: [
      "Cashless — every fare via the in-app wallet",
      "Trip earnings visible the moment you finish",
      "Withdraw any time, or auto-payout Mondays",
    ],
    screenshot: "/playstore/screenshots/1000536549.jpg",
    icon: "wallet",
  },
];

const REQUIRED_DOCS = [
  "TA Franchise Certificate (route-specific, annual)",
  "TA Driver Badge / Photo ID (annual)",
  "Certificate of Fitness (COF) — annual vehicle inspection",
  "Comprehensive PPV Insurance (commercial passenger cover)",
  "Valid Jamaica Driver's Licence (PPV class)",
  "TRN (Taxpayer Registration Number)",
  "Police Record / Good Conduct Certificate (can be uploaded after sign-up)",
  "Red Plate Vehicle Registration",
  "Identity selfie (matched against licence and badge)",
];

const ONBOARDING_STEPS: Array<[string, string]> = [
  ["Create your driver account", "Email or Google, phone, and red-plate number."],
  ["Upload TA documents", "All 10 documents required for activation."],
  ["Verification review", "Admin reviews each document — typically within 48 hours."],
  ["Go live", "Once approved, you can accept rides immediately."],
];

export default function DriverJoinPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(DRIVER_JOB_POSTING_JSON_LD),
        }}
      />
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden bg-rajlo-black py-20 text-white md:py-28">
        <ArcWatermark
          size={620}
          variant="red"
          className="absolute -right-24 -bottom-24"
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          {/* Left — hero copy + CTAs + onboarding overview */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-rajlo-red/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rajlo-red">
              <Icon name="check-circle" className="h-3.5 w-3.5" />
              Now accepting drivers
            </span>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Drive with Rajlo.
              <br />
              <span className="text-rajlo-red">Earn on your terms.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">
              Flexible schedules, fair pay, and the only Jamaican rideshare
              built ground-up around TA-compliant red-plate professionals.
              Real-time dispatch, transparent earnings, instant payouts.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/driver/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-rajlo-red px-7 py-4 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                Start onboarding
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <Link
                href="/auth/driver/login"
                className="inline-flex items-center justify-center rounded-full border-2 border-white/40 px-7 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                I already have an account
              </Link>
            </div>

            {/* Onboarding steps card */}
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="font-secondary text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                Onboarding overview
              </p>
              <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                {ONBOARDING_STEPS.map(([title, body], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red text-xs font-extrabold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold leading-tight">{title}</p>
                      <p className="mt-0.5 text-xs leading-snug text-white/65">
                        {body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right — twin phone mockup stack */}
          <div className="relative mx-auto flex w-full max-w-md items-center justify-center md:max-w-none">
            {/* Soft red bloom behind the phones for visual depth */}
            <div
              aria-hidden
              className="absolute inset-0 -z-0 mx-auto h-96 w-96 rounded-full bg-rajlo-red/20 blur-3xl"
            />
            <div className="relative z-10 flex items-center justify-center gap-6">
              <PhoneMockup
                src={FEATURES[0].screenshot}
                alt="Driver dashboard with live ride request"
                rotate={-6}
                className="w-44 md:w-56"
                priority
              />
              <PhoneMockup
                src={FEATURES[1].screenshot}
                alt="Active trip with live map"
                rotate={6}
                className="w-44 -translate-y-6 md:w-56"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURE BREAKDOWN ─── */}
      <section className="bg-background py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Built for Jamaican red-plate drivers
            </p>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Everything you need on the road.
            </h2>
            <p className="mt-4 text-lg text-muted">
              Six surfaces. One workflow. Zero clutter.
            </p>
          </div>

          <div className="mt-16 grid gap-20">
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.title} feature={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── REQUIRED DOCS ─── */}
      <section className="border-y border-line bg-surface-soft py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-start">
            <div>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Required documents
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
                All 10 documents are mandatory.
              </h2>
              <p className="mt-4 text-muted">
                Rajlo is red-plate-only. Every driver must hold a valid TA
                Franchise Certificate for public passenger vehicles. We
                re-verify annually so riders keep trusting the badge.
              </p>
              <Link
                href="/auth/driver/signup"
                className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-rajlo-red hover:underline"
              >
                Start your verification
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {REQUIRED_DOCS.map((doc) => (
                <li
                  key={doc}
                  className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium shadow-sm"
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rajlo-red/12 text-rajlo-red">
                    <Icon name="check-circle" className="h-3 w-3" />
                  </span>
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="relative overflow-hidden bg-rajlo-black py-20 text-white">
        <ArcWatermark
          size={520}
          variant="red"
          className="absolute -right-20 -bottom-24"
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <span className="inline-grid h-16 w-16 place-items-center rounded-2xl bg-rajlo-red text-white shadow-lg shadow-rajlo-red/30">
            <LogoIcon height={36} />
          </span>
          <h3 className="mt-6 text-4xl font-extrabold tracking-tight md:text-5xl">
            Empowered drivers,
            <br />
            <span className="text-rajlo-red">dependable rides.</span>
          </h3>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
            Flexible schedules. Fair earnings. Real support. Join the
            drivers earning on Rajlo today.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/driver/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-rajlo-red px-8 py-4 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Become a Rajlo driver
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
            <a
              href="https://play.google.com/store/apps/details?id=com.rajlodriversapp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/40 px-7 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              <Icon name="google-play" className="h-4 w-4" />
              Download on Google Play
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/**
 * Alternating feature row — phone on the left for even rows, on the
 * right for odd rows, so the page reads as a rhythm instead of a
 * stack of identical blocks.
 */
function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const isReversed = index % 2 === 1;
  return (
    <div
      className={`grid gap-10 md:grid-cols-[0.95fr_1.05fr] md:items-center ${
        isReversed ? "md:[&>div:first-child]:order-2" : ""
      }`}
    >
      {/* Phone mockup */}
      <div className="relative flex justify-center md:justify-start">
        <div
          aria-hidden
          className="absolute inset-0 -z-0 mx-auto my-auto h-80 w-80 rounded-full bg-rajlo-red/10 blur-3xl"
        />
        <PhoneMockup
          src={feature.screenshot}
          alt={feature.title}
          className="relative z-10 w-64 md:w-72"
        />
      </div>

      {/* Copy */}
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-rajlo-red/12 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
          <Icon name={feature.icon} className="h-3.5 w-3.5" />
          {feature.eyebrow}
        </span>
        <h3 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          {feature.title}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
          {feature.body}
        </p>
        <ul className="mt-5 grid gap-2.5">
          {feature.bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2.5 text-sm font-medium"
            >
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-rajlo-red text-white">
                <Icon name="check-circle" className="h-2.5 w-2.5" />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Android-style phone frame around a screenshot. Subtle two-stop
 * bezel gradient, rounded corners, drop shadow. Optional `rotate`
 * for the hero pair so they read as a playful stack.
 */
function PhoneMockup({
  src,
  alt,
  className = "",
  rotate = 0,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  rotate?: number;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <div
        // The bezel — slim gradient frame, rounded enough to read as
        // an Android phone, with a soft shadow underneath for lift.
        className="relative rounded-[2.4rem] p-[5px] shadow-2xl"
        style={{
          background: "linear-gradient(180deg, #2a2d24 0%, #0b0e07 100%)",
        }}
      >
        <div
          className="relative overflow-hidden rounded-[2.05rem] bg-white"
          // Aspect ratio matches the source screenshots (810×1800
          // ≈ 9:20). Keeps the screen filled without distortion.
          style={{ aspectRatio: "9 / 19.5" }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 768px) 288px, 200px"
            className="object-cover object-top"
            unoptimized
            priority={priority}
          />
        </div>
        {/* Top notch / camera dot — small detail that completes the
           "this is a phone" read */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1.5 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/70"
        />
      </div>
    </div>
  );
}
