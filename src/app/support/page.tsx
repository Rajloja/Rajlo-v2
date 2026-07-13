import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon, type IconName } from "@/components/icons";

/* ────────────────────────────────────────────────────────────────
 * /support
 *
 * A routing hub, not a support surface itself. The real support
 * content lives on four existing pages:
 *
 *   /rider/support         — rider-portal help + FAQs + contact
 *   /driver/help-safety    — driver-portal help + safety toolkit
 *   /help                  — apex marketing help center (public)
 *   /contact               — apex contact form (public)
 *
 * Before this file existed, `/support` was declared as a shared path
 * in src/proxy.ts (so the auth proxy wouldn't gate it) but no page
 * lived at the route. Anyone who typed rajlo.com/support directly —
 * from an email link, a screenshot, a bookmark, or their own memory
 * — hit a 404. This hub catches that traffic and points every visitor
 * to the right surface: signed-in riders go to /rider/support, signed
 * -in drivers to /driver/help-safety (both surfaces will render their
 * own auth prompt for a wrong-role or logged-out visitor), everyone
 * else lands on the public help center or the contact form.
 *
 * Deliberately a server component with static links — no role
 * detection here. The portal-side pages already enforce auth; we
 * shouldn't duplicate that logic and risk drift. If a visitor taps
 * "Driver help" and isn't a driver, the driver portal's own gate
 * handles it.
 * ──────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Support — Rajlo",
  description:
    "Get help with Rajlo — riders, drivers, and general inquiries. Rider support, driver help, FAQs, contact form, and emergency contacts.",
  alternates: { canonical: "/support" },
};

const ROUTES: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  icon: IconName;
}[] = [
  {
    eyebrow: "Riders",
    title: "Rider support",
    body:
      "Booking questions, wallet top-ups, cancellations, trip issues, or reporting a driver. Fastest path if you're already using the Rajlo app.",
    href: "/rider/support",
    cta: "Open rider support",
    icon: "user",
  },
  {
    eyebrow: "Drivers",
    title: "Driver help & safety",
    body:
      "Onboarding, payouts, TA documents, active-trip safety toolkit, and driver FAQs. Opens the driver portal — you'll need to be signed in as a driver.",
    href: "/driver/help-safety",
    cta: "Open driver help",
    icon: "car",
  },
  {
    eyebrow: "General",
    title: "Rajlo Help Center",
    body:
      "How Rajlo works, categorised FAQs, and a search bar across everything. No sign-in needed — good starting point if you're new or comparing.",
    href: "/help",
    cta: "Browse help center",
    icon: "help-circle",
  },
  {
    eyebrow: "Talk to us",
    title: "Contact Rajlo",
    body:
      "For anything the pages above don't answer: send us a message. Includes routing for press, partnerships, and compliance/TA inquiries.",
    href: "/contact",
    cta: "Open contact form",
    icon: "mail",
  },
];

export default function SupportPage() {
  return (
    <MarketingShell>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-rajlo-black py-20 text-white">
        <ArcWatermark
          size={620}
          variant="red"
          className="absolute -right-32 -bottom-40 opacity-[0.12]"
        />
        <div className="relative mx-auto max-w-6xl px-4">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Support
          </p>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight md:text-6xl">
            How can we help?
          </h1>
          <p className="mt-5 max-w-2xl text-base text-white/70 md:text-lg">
            Pick the door that fits — Rider, Driver, general Help Center, or
            direct message. If it&apos;s an emergency, call 119 first, then
            let us know from your trip.
          </p>
        </div>
      </section>

      {/* ─── Emergency callout — sits above the router grid because
         a rider or driver landing on /support during an active incident
         needs the 119 number instantly, not after scrolling. ─── */}
      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="flex flex-col gap-3 rounded-3xl border border-rajlo-red/30 bg-primary-soft/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rajlo-red text-white">
              <Icon name="alert-triangle" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-rajlo-red">
                Emergency?
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">
                Call the Jamaica Constabulary Force on{" "}
                <a
                  href="tel:119"
                  className="font-bold text-rajlo-red underline-offset-2 hover:underline"
                >
                  119
                </a>{" "}
                — then open your active trip and tap the safety button to
                share your location with Rajlo Operations.
              </p>
            </div>
          </div>
          <a
            href="tel:119"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            <Icon name="phone" className="h-4 w-4" />
            Call 119
          </a>
        </div>
      </section>

      {/* ─── Router grid ─── */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="mb-6 font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
          Choose your path
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {ROUTES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-rajlo-red">
                    <Icon name={r.icon} className="h-5 w-5" />
                  </span>
                  <p className="font-secondary text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                    {r.eyebrow}
                  </p>
                </div>
                <h2 className="mt-4 text-xl font-extrabold tracking-tight">
                  {r.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {r.body}
                </p>
              </div>
              <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-rajlo-red">
                {r.cta}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Direct contact fallback ─── */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-3xl border border-dashed border-line bg-surface-soft p-6 text-center">
          <p className="text-sm leading-relaxed text-muted">
            Still not sure where to go?{" "}
            <Link
              href="/contact"
              className="font-bold text-rajlo-red underline-offset-2 hover:underline"
            >
              Send us a message
            </Link>{" "}
            and we&apos;ll route it to the right team.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
