"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon, type IconName } from "@/components/icons";

/* ────────────────────────────────────────────────────────────────
 * Help Center
 *
 * A searchable knowledge base: an "How Rajlo works" primer that
 * explains the product (two ride modes, cashless wallet, vetted
 * red-plate drivers, built-in safety) followed by categorised FAQs.
 * Typing in the search box flattens everything into a single ranked
 * result list so a rider/driver can find one answer fast.
 * ──────────────────────────────────────────────────────────────── */

type Category = {
  title: string;
  icon: IconName;
  blurb: string;
  faqs: { q: string; a: string }[];
};

const HOW_IT_WORKS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "car",
    title: "Two ways to move",
    body: "Book a private ride point-to-point on demand, or hop a Rajlo route taxi — a shared red-plate car running a fixed corridor. Same app, one account.",
  },
  {
    icon: "wallet",
    title: "Cashless by design",
    body: "No cash changes hands. Riders top up a Rajlo wallet and pay by scanning the driver's QR at the end of the trip. Every charge is itemised in-app.",
  },
  {
    icon: "shield-check",
    title: "Verified red-plate drivers",
    body: "Every driver is a licensed PPV operator with a current TA franchise, badge, insurance, and police record on file — re-verified every year.",
  },
  {
    icon: "map-pin",
    title: "Built for Jamaica",
    body: "Fares follow parish-aware rules, and route-taxi fares are anchored to the official Transport Authority schedule — no surge, no guesswork.",
  },
];

const CATEGORIES: Category[] = [
  {
    title: "For riders",
    icon: "user",
    blurb: "Booking, fares, seats, and wallet.",
    faqs: [
      {
        q: "How do I sign up as a rider?",
        a: "Tap Book a ride, enter your name, email, and Jamaica phone number, and create a password. It takes under a minute — no documents needed to ride.",
      },
      {
        q: "What's the difference between a private ride and a route taxi?",
        a: "A private ride takes you door-to-door on your own schedule, with a fare based on distance and seats. A route taxi is a shared red-plate car running a set corridor (like a traditional Jamaican route taxi) at a fixed, TA-anchored fare — cheaper, and great for common trips.",
      },
      {
        q: "How is my fare calculated?",
        a: "Private rides use parish-aware rules: a base fare, distance, a multi-seat factor, and a small platform fee — the full breakdown shows before you tap Confirm. Route-taxi fares are a fixed amount per corridor, anchored to the official Transport Authority schedule. Either way, there's no surge pricing.",
      },
      {
        q: "How do I pay? Can I use cash?",
        a: "Rajlo is fully cashless — drivers never handle cash. You top up your in-app Rajlo wallet with a debit/credit card, then pay by scanning the driver's QR code (or an automatic charge) at the end of the trip. Make sure your wallet has enough balance before you book.",
      },
      {
        q: "How do I add money to my wallet?",
        a: "Open Wallet → Add funds, enter an amount, and pay with your card. Your balance is available immediately and every top-up and trip charge is listed in your wallet history.",
      },
      {
        q: "Can I book multiple seats in one trip?",
        a: "Yes — 1 to 4 seats per booking. The fare estimate updates with the seat count so you always see the total before confirming.",
      },
      {
        q: "Can I cancel a ride?",
        a: "Yes — it's free if the driver hasn't accepted yet. After acceptance a small cancellation fee may apply depending on how far the driver has already travelled to reach you.",
      },
      {
        q: "What if I leave something in the driver's car?",
        a: "Open the trip in your Ride History and tap Report an issue. We'll connect you with your driver through anonymous in-app messaging so you can arrange to get it back.",
      },
    ],
  },
  {
    title: "For drivers",
    icon: "car",
    blurb: "Onboarding, compliance, earnings, payouts.",
    faqs: [
      {
        q: "How do I become a Rajlo driver?",
        a: "Tap Drive with Rajlo, create a driver account, and complete the onboarding wizard. You'll upload your mandatory TA documents and an admin reviews each one — usually within 48 hours. Once approved, you can start accepting rides right away.",
      },
      {
        q: "What documents do I need?",
        a: "TA Franchise Certificate (a.k.a. Road License), TA Driver Badge, Certificate of Fitness, PPV Comprehensive Insurance, a valid PPV-class Driver's Licence, TRN, Police Record, Red Plate Vehicle Registration, and an identity selfie. Rajlo is red-plate only — private/white-plate vehicles aren't eligible.",
      },
      {
        q: "How long does verification take?",
        a: "Typically within 48 hours of upload. If something is missing or unclear we flag it in your dashboard with a Resubmit option, so you fix just that document without starting over.",
      },
      {
        q: "How and when do I get paid?",
        a: "Every trip shows a transparent breakdown — rider fare, platform fee, and your earnings. Because Rajlo is cashless, your earnings accumulate in the app and are paid out weekly by bank transfer to your registered Jamaica bank account.",
      },
      {
        q: "Can I run route-taxi trips as well as private rides?",
        a: "Yes. You can go online in private mode, start a route-taxi session on a corridor you're franchised for, and switch between them. Route-taxi fares follow the TA schedule automatically, so you never have to calculate them.",
      },
      {
        q: "What if my documents are about to expire?",
        a: "We send in-app, email, and SMS reminders ahead of every expiry. If a document does lapse, your account auto-suspends until you re-upload it and we re-approve — so keep an eye on the reminders.",
      },
      {
        q: "Can I be both a rider and a driver?",
        a: "Yes — one Rajlo account, two modes. Switch between the rider and driver portals from the menu.",
      },
    ],
  },
  {
    title: "Safety & support",
    icon: "shield-check",
    blurb: "Vetting, in-trip safety, and incident reports.",
    faqs: [
      {
        q: "How are Rajlo drivers vetted?",
        a: "Every driver holds a current TA Franchise Certificate, Police Record, valid PPV Driver's Licence, and PPV insurance. We re-verify all mandatory documents annually and auto-suspend any account with a lapsed document.",
      },
      {
        q: "What is the in-app SOS feature?",
        a: "During any active trip you can tap SOS to share your live location with the Rajlo safety team and your trusted contact. In a life-threatening emergency, always dial 119 (Police) or 110 (Fire & Ambulance) first.",
      },
      {
        q: "Can I share my live trip with someone?",
        a: "Yes — tap Share trip during any active ride to send a live tracking link to a trusted contact. They'll see the route, ETA, and your driver and vehicle details in real time.",
      },
      {
        q: "How do I report a safety concern?",
        a: "Open the trip in your Ride History and tap Report an issue. Every report is investigated, and we may suspend an account pending review. See the full Safety policy for details.",
      },
      {
        q: "Is my personal information protected?",
        a: "Your phone number is masked during in-app calls and chat, payments run through a secure processor, and we only keep the data required to run trips and meet Jamaican regulations. See the Privacy Policy for the specifics.",
      },
    ],
  },
  {
    title: "Account & billing",
    icon: "credit-card",
    blurb: "Passwords, profiles, wallet history, receipts.",
    faqs: [
      {
        q: "How do I reset my password?",
        a: "Tap Sign in, then Forgot password — we'll email you a reset link. The link expires after 15 minutes for security.",
      },
      {
        q: "How do I update my phone number or email?",
        a: "Open Profile → Account settings, edit the field, and confirm the change. Drivers: the email tied to your application stays locked to your registered account email.",
      },
      {
        q: "Where can I see my wallet history and receipts?",
        a: "Open Wallet to see every top-up and trip charge, and Ride History for a receipt on each completed trip — fare breakdown, driver, vehicle, and timestamps included.",
      },
      {
        q: "Is there a refund if I'm overcharged?",
        a: "If a charge looks wrong, open the trip and tap Report an issue. We review wallet charges against the trip record and correct genuine errors back to your Rajlo wallet.",
      },
      {
        q: "How do I delete my Rajlo account?",
        a: "Profile → Account settings → Delete account. We retain trip records (receipts, audit data) as required by Jamaican tax and regulatory rules — see the Privacy Policy for details.",
      },
    ],
  },
];

// Flattened index for search.
type FlatFaq = { category: string; icon: IconName; q: string; a: string };
const ALL_FAQS: FlatFaq[] = CATEGORIES.flatMap((c) =>
  c.faqs.map((f) => ({ category: c.title, icon: c.icon, q: f.q, a: f.a })),
);

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [];
    return ALL_FAQS.filter(
      (f) =>
        f.q.toLowerCase().includes(q) ||
        f.a.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    );
  }, [q]);

  const searching = q.length > 0;

  return (
    <MarketingShell>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-rajlo-red py-20 text-white">
        <ArcWatermark
          size={620}
          variant="white"
          className="absolute -right-32 -bottom-40"
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/80">
            Help center
          </p>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight md:text-6xl">
            How can we help?
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">
            Answers to common rider, driver, safety, and account questions —
            and a fast path to a human if you need one.
          </p>

          {/* Search */}
          <div className="mx-auto mt-8 max-w-xl">
            <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3.5 shadow-xl shadow-rajlo-black/10">
              <Icon name="search" className="h-5 w-5 shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help — fares, wallet, documents…"
                aria-label="Search the help center"
                className="w-full bg-transparent text-base text-rajlo-black outline-none placeholder:text-muted/70"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-soft"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick category jump (hidden while searching) */}
          {!searching && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {CATEGORIES.map((c) => (
                <a
                  key={c.title}
                  href={`#${slugify(c.title)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-white/20"
                >
                  <Icon name={c.icon} className="h-3.5 w-3.5" />
                  {c.title}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Search results ─── */}
      {searching ? (
        <section className="mx-auto max-w-3xl px-4 py-16">
          <p className="text-sm font-semibold text-muted">
            {results.length === 0
              ? "No matches found"
              : `${results.length} result${results.length === 1 ? "" : "s"} for “${query.trim()}”`}
          </p>

          {results.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface p-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-rajlo-red">
                <Icon name="help-circle" className="h-6 w-6" />
              </span>
              <p className="mt-4 text-lg font-extrabold tracking-tight">
                We couldn&apos;t find that
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Try a different word, or reach the team directly — we&apos;re
                happy to help.
              </p>
              <Link
                href="/contact"
                className="mt-6 inline-flex rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
              >
                Contact support →
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {results.map((item) => (
                <details
                  key={`${item.category}-${item.q}`}
                  className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-rajlo-red"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-bold md:text-lg">
                    <span>
                      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                        <Icon name={item.icon} className="h-3 w-3" />
                        {item.category}
                      </span>
                      {item.q}
                    </span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-rajlo-red transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-base leading-relaxed text-muted">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* ─── How Rajlo works ─── */}
          <section className="mx-auto max-w-6xl px-4 py-16">
            <div className="text-center">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                How Rajlo works
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
                A cashless, red-plate ride network for Jamaica.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted">
                Rajlo connects riders with licensed PPV drivers for private and
                shared route-taxi trips — paid entirely from your in-app wallet.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.map((f) => (
                <div
                  key={f.title}
                  className="rounded-3xl border border-line bg-surface p-6 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-rajlo-red">
                    <Icon name={f.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-extrabold tracking-tight">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Categories with FAQs ─── */}
          <section className="mx-auto max-w-4xl px-4 pb-20">
            {CATEGORIES.map((category) => (
              <div
                key={category.title}
                id={slugify(category.title)}
                className="mb-16 scroll-mt-24"
              >
                <p className="flex items-center gap-2 font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  <Icon name={category.icon} className="h-4 w-4" />
                  {category.title}
                </p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
                  {category.blurb}
                </h2>

                <div className="mt-8 space-y-3">
                  {category.faqs.map((item) => (
                    <details
                      key={item.q}
                      className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-rajlo-red"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-bold md:text-lg">
                        {item.q}
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-rajlo-red transition-transform duration-300 group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className="mt-4 text-base leading-relaxed text-muted">
                        {item.a}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {/* ─── Still stuck? ─── */}
      <section className="bg-surface-soft py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
            <div className="rounded-3xl border border-line bg-surface p-8">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Still stuck?
              </p>
              <h3 className="mt-3 text-2xl font-extrabold tracking-tight">
                Talk to a real person.
              </h3>
              <p className="mt-3 text-muted">
                Our support team responds within 24 hours, faster during the
                day.
              </p>
              <Link
                href="/contact"
                className="mt-6 inline-flex rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
              >
                Contact support →
              </Link>
            </div>

            <div className="rounded-3xl border border-rajlo-red/20 bg-primary-soft/40 p-8">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Emergency
              </p>
              <h3 className="mt-3 text-2xl font-extrabold tracking-tight">
                In immediate danger?
              </h3>
              <p className="mt-3 text-rajlo-black">
                Call <strong>119</strong> (Police) or <strong>110</strong>{" "}
                (Fire &amp; Ambulance) immediately. Use the in-app SOS to share
                your live location with us and your trusted contact.
              </p>
              <Link
                href="/legal/safety-disclaimer-emergency-policy"
                className="mt-6 inline-flex rounded-full border border-rajlo-red px-6 py-3 text-sm font-bold text-rajlo-red hover:bg-white"
              >
                Read the Safety policy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
