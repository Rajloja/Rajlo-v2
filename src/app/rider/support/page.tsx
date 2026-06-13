"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { useT } from "@/lib/i18n";

/**
 * Rider help & support. The page is intentionally information-dense:
 * the cheapest support ticket is the one a self-service FAQ
 * deflects.
 *
 * Sections:
 *   - Hero with a search bar (filters the FAQ list below)
 *   - Quick-action tiles for the most common help paths
 *   - Categorised FAQ accordion
 *   - Contact card (email + tel + form CTA)
 */

type FAQ = {
  q: string;
  a: string;
  category: "trips" | "payments" | "safety" | "account";
};

const FAQS: FAQ[] = [
  {
    category: "trips",
    q: "What does 'no driver found' mean?",
    a: "It means no nearby red-plate driver picked up your request within the matching window. Try again — usually a driver appears within a minute or two — or widen your pickup spot.",
  },
  {
    category: "trips",
    q: "Can I cancel a ride after I've requested it?",
    a: "Yes — until the trip starts. Cancelling before a driver accepts is free. After acceptance, cancelling is still free for now (we may add a small fee for repeated last-minute cancels).",
  },
  {
    category: "trips",
    q: "What if my driver doesn't show up?",
    a: "First, check the live tracking — the car icon shows their real position. If they're stationary or moving away, tap Cancel to free yourself up to re-book, then report it via 'Report a problem' below.",
  },
  {
    category: "payments",
    q: "Do you take cash?",
    a: "Rajlo is 100% cashless. Top up your wallet from a card or bank transfer, then every trip — Private Ride or Route Taxi — is auto-debited from your balance. Drivers don't carry cash, which keeps both of you safer.",
  },
  {
    category: "payments",
    q: "Why was my fare different from the estimate?",
    a: "The estimate is locked when the driver accepts. If you added a stop or extended the route mid-trip, the final fare reflects that. The fare breakdown screen has a calculator that matches our exact pricing rules.",
  },
  {
    category: "payments",
    q: "How do I get a receipt?",
    a: "Open your trip from the History page — the detail screen has a full breakdown. We'll also email a receipt after every completed trip.",
  },
  {
    category: "safety",
    q: "How do I share my trip with a friend?",
    a: "During an active trip, tap the shield icon. Choose 'Share trip link' and we'll generate a public URL. Anyone with the link sees your live position and the driver's plate.",
  },
  {
    category: "safety",
    q: "What does the SOS button actually do?",
    a: "It pings Rajlo's safety operations team with your live coordinates and ride details. We'll attempt to contact you, then escalate to local emergency services (Police 119) if needed.",
  },
  {
    category: "safety",
    q: "Can drivers see my home address?",
    a: "Drivers see only the pickup and dropoff points you enter. They never see prior trip history or saved places.",
  },
  {
    category: "account",
    q: "How do I update my name or email?",
    a: "Settings → Profile → Edit. Email changes require re-verification via a confirmation link.",
  },
  {
    category: "account",
    q: "How do I delete my account?",
    a: "Email support@rajlo.com from your account email. We'll process within 7 days and permanently delete all PII while retaining anonymised trip records for legal compliance.",
  },
];

const CATEGORY: Record<FAQ["category"], { label: string; icon: IconName }> = {
  trips: { label: "Trips", icon: "navigation" },
  payments: { label: "Payments", icon: "credit-card" },
  safety: { label: "Safety", icon: "shield" },
  account: { label: "Account", icon: "user" },
};

/**
 * Quick-action tiles. Each one is either:
 *   - a `href` that routes elsewhere (settings, safety toolkit, mailto), or
 *   - a `faqAnchor` that scrolls to + opens the relevant FAQ entry on
 *     this same page (so the answer is immediately visible inline).
 *
 * Earlier the first two tiles bluntly routed to `/rider/history`,
 * which felt wrong: a help quick-action shouldn't dump you on the
 * generic trip-history list. Now they expand the matching FAQ on this
 * page so the user gets an actual answer + can contact us if needed.
 */
type QuickAction = {
  label: string;
  description: string;
  icon: IconName;
} & (
  | { href: string; faqAnchor?: never }
  | { faqAnchor: { category: FAQ["category"]; question: string }; href?: never }
);

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Issue with a recent trip",
    description:
      "Driver, fare, route, or anything else — see how to report it.",
    icon: "history",
    faqAnchor: {
      category: "trips",
      question: "What if my driver doesn't show up?",
    },
  },
  {
    label: "Lost something in a vehicle?",
    description: "Email support with your trip ID — we'll route it to the driver.",
    icon: "search",
    href: "mailto:support@rajlo.com?subject=Lost%20item%20in%20Rajlo%20trip&body=Trip%20ID%3A%20%0A%0AItem%20description%3A%20%0A%0AAny%20other%20details%3A%20",
  },
  {
    label: "Top up your wallet",
    description: "Add money via card or bank transfer — every trip pays from here.",
    icon: "credit-card",
    href: "/rider/wallet",
  },
  {
    label: "Safety concern",
    description: "Use SOS in-trip, or open the safety toolkit anytime.",
    icon: "shield-alert",
    href: "/rider/safety",
  },
];

export default function RiderSupportPage() {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
    );
  }, [query]);

  // Group by category for the accordion sections.
  const grouped = useMemo(() => {
    const out = new Map<FAQ["category"], FAQ[]>();
    for (const f of filtered) {
      const list = out.get(f.category) ?? [];
      list.push(f);
      out.set(f.category, list);
    }
    return out;
  }, [filtered]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero with search */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={420}
            variant="red"
            className="absolute -right-24 -bottom-32 opacity-[0.18]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              {t("support.eyebrow", "Help centre")}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {t("support.title", "How can we help?")}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/80">
              {t(
                "support.subtitle",
                "Search the FAQ, or pick a quick action below to get straight to the right place.",
              )}
            </p>

            <div className="relative mt-5">
              <Icon
                name="search"
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("support.searchPlaceholder", "Search help articles…")}
                className="w-full rounded-full bg-white py-3.5 pl-11 pr-4 text-sm text-foreground outline-none ring-2 ring-transparent transition-all placeholder:text-muted focus:ring-rajlo-red/40"
              />
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Quick actions */}
      <FadeUp delay={0.06}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_ACTIONS.map((qa) => {
            const tileBody = (
              <>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-rajlo-red transition-colors group-hover:bg-rajlo-red group-hover:text-white">
                  <Icon name={qa.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold tracking-tight">
                    {qa.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{qa.description}</p>
                </div>
                <Icon
                  name="chevron-right"
                  className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rajlo-red"
                />
              </>
            );
            const className =
              "group flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition-all hover:-translate-y-0.5 hover:border-rajlo-red/30 hover:shadow-md";

            // FAQ-anchor tiles: open the matching FAQ inline + scroll
            // it into view. Far better UX than routing to a list page
            // and making the rider hunt for the answer.
            if (qa.faqAnchor) {
              const targetId = `${qa.faqAnchor.category}-${qa.faqAnchor.question}`;
              return (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setOpenId(targetId);
                    requestAnimationFrame(() => {
                      const el = document.getElementById(`faq-${targetId}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    });
                  }}
                  className={`${className} w-full`}
                >
                  {tileBody}
                </button>
              );
            }

            return (
              <Link key={qa.label} href={qa.href} className={className}>
                {tileBody}
              </Link>
            );
          })}
        </div>
      </FadeUp>

      {/* FAQ groups */}
      {grouped.size === 0 && (
        <FadeUp delay={0.08}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="search" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              Nothing found for &ldquo;{query}&rdquo;
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Can&apos;t find what you&apos;re looking for? Use the contact card
              below.
            </p>
          </div>
        </FadeUp>
      )}

      {Array.from(grouped.entries()).map(([cat, list], idx) => {
        const meta = CATEGORY[cat];
        return (
          <FadeUp key={cat} delay={0.08 + idx * 0.04}>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line bg-surface-soft px-5 py-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-rajlo-red text-white">
                  <Icon name={meta.icon} className="h-3.5 w-3.5" />
                </span>
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  {meta.label}
                </p>
                <span className="ml-auto text-[11px] font-semibold text-muted">
                  {list.length} article{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul>
                {list.map((f) => {
                  const id = `${cat}-${f.q}`;
                  const open = openId === id;
                  return (
                    <li
                      key={id}
                      id={`faq-${id}`}
                      className="scroll-mt-24 border-b border-line last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : id)}
                        aria-expanded={open}
                        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-soft"
                      >
                        <span className="text-sm font-bold">{f.q}</span>
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-transform ${
                            open ? "rotate-45" : ""
                          }`}
                        >
                          <Icon name="plus-circle" className="h-3.5 w-3.5" />
                        </span>
                      </button>
                      {open && (
                        <p className="px-5 pb-5 pt-0 text-sm leading-relaxed text-muted">
                          {f.a}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </FadeUp>
        );
      })}

      {/* Contact card */}
      <FadeUp delay={0.25}>
        <div className="overflow-hidden rounded-3xl border border-rajlo-red/30 bg-primary-soft">
          <div className="bg-rajlo-red p-6 text-white md:p-8">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
              Still need a human?
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
              Talk to our support team
            </h2>
            <p className="mt-2 max-w-md text-sm text-white/85">
              Real people based in Kingston, replying within a few hours during
              business days.
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
            <a
              href="mailto:support@rajlo.com"
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
                <Icon name="mail" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  Email
                </p>
                <p className="truncate text-sm font-extrabold">
                  support@rajlo.com
                </p>
              </div>
            </a>
            <a
              href="tel:+18761234567"
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
                <Icon name="phone" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  Phone
                </p>
                <p className="truncate text-sm font-extrabold">
                  +1 (876) 123-4567
                </p>
              </div>
            </a>
            <a
              href="tel:119"
              className="group flex items-center gap-3 rounded-2xl border border-rajlo-red/30 bg-primary-soft p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-rajlo-red text-white">
                <Icon name="shield-alert" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Emergency
                </p>
                <p className="truncate text-sm font-extrabold">Police · 119</p>
              </div>
            </a>
          </div>
        </div>
      </FadeUp>

      <FadeUp delay={0.3}>
        <p className="text-center text-[11px] text-muted">
          Average reply: under 4 hours during business days
        </p>
      </FadeUp>
    </div>
  );
}
