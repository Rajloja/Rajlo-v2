"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon, type IconName } from "@/components/icons";

/* ────────────────────────────────────────────────────────────────
 * Contact
 *
 * "Talk to Rajlo" — direct contact methods, a channel-routing guide so
 * people reach the right place fast (riders, drivers, safety, press),
 * a message form (posts to /api/contact), and an emergency panel.
 * ──────────────────────────────────────────────────────────────── */

const TOPICS = [
  "General question",
  "Trip issue",
  "Wallet / payment",
  "Driver application",
  "Compliance / TA documents",
  "Press inquiry",
  "Partnerships",
  "Other",
] as const;

type Topic = (typeof TOPICS)[number];

const CHANNELS: {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  external?: boolean;
}[] = [
  {
    icon: "help-circle",
    eyebrow: "Riders",
    title: "Booking, fares & wallet",
    body: "Most rider questions — how fares work, topping up your wallet, cancellations — are answered in the Help Center in under a minute.",
    href: "/help#for-riders",
    cta: "Rider help",
  },
  {
    icon: "car",
    eyebrow: "Drivers",
    title: "Applications & payouts",
    body: "Applying to drive, document verification, or weekly payouts? Start with the driver guide, or pick “Driver application” in the form below.",
    href: "/help#for-drivers",
    cta: "Driver help",
  },
  {
    icon: "shield-check",
    eyebrow: "Safety",
    title: "Report a safety concern",
    body: "For anything safety-related — an incident, a driver, or an account — read the Safety policy and report the trip directly from your Ride History.",
    href: "/legal/safety-disclaimer-emergency-policy",
    cta: "Safety policy",
  },
  {
    icon: "trending-up",
    eyebrow: "Press & partners",
    title: "Media & partnerships",
    body: "Working on a story or a partnership? Choose “Press inquiry” or “Partnerships” in the form so your message reaches the right team.",
    href: "#contact-form",
    cta: "Open the form",
  },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic>("General question");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send your message.",
      );
    } finally {
      setLoading(false);
    }
  }

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
            Contact
          </p>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight md:text-6xl">
            Talk to Rajlo.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Real humans, fast replies. Most messages are answered within 24
            hours, faster during business hours — and there&apos;s always a
            direct line for anything urgent.
          </p>

          {/* Quick actions */}
          <div className="mt-8 flex flex-wrap gap-2">
            <a
              href="mailto:support@rajlo.com"
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
            >
              <Icon name="mail" className="h-4 w-4" />
              Email support
            </a>
            <a
              href="#contact-form"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold backdrop-blur transition-colors hover:bg-white/20"
            >
              Send a message
            </a>
            <Link
              href="/help"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold backdrop-blur transition-colors hover:bg-white/20"
            >
              <Icon name="help-circle" className="h-4 w-4" />
              Help Center
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Methods ─── */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-5 md:grid-cols-3">
          <Method
            icon="mail"
            label="Email"
            value="support@rajlo.com"
            sub="24-hour response, 7 days a week"
            href="mailto:support@rajlo.com"
          />
          <Method
            icon="phone"
            label="Phone"
            value="876-000-0000"
            sub="Mon–Fri, 8 am – 6 pm JM time"
            href="tel:+18760000000"
          />
          <Method
            icon="map-pin"
            label="Headquarters"
            value="Kingston, Jamaica"
            sub="By appointment only"
          />
        </div>

        <p className="mt-6 text-xs text-muted">
          Phone and email are placeholder values until launch — we&apos;ll
          publish the real ones once Rajlo support is live.
        </p>
      </section>

      {/* ─── Channel routing ─── */}
      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="text-center">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Reach the right team
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            The fastest way to get an answer.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted">
            Pick the path that matches your question — most are answered
            instantly, without waiting on a reply.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((c) => (
            <div
              key={c.title}
              className="flex flex-col rounded-3xl border border-line bg-surface p-6 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-rajlo-red">
                <Icon name={c.icon} className="h-5 w-5" />
              </span>
              <p className="mt-4 font-secondary text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                {c.eyebrow}
              </p>
              <h3 className="mt-1 text-lg font-extrabold tracking-tight">
                {c.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                {c.body}
              </p>
              <Link
                href={c.href}
                className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-rajlo-red hover:underline"
              >
                {c.cta}
                <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Form + side panels ─── */}
      <section id="contact-form" className="scroll-mt-24 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
            {/* Form */}
            <div className="rounded-3xl border border-line bg-surface p-7 md:p-10">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Send us a message
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
                We&apos;ll get back to you.
              </h2>
              <p className="mt-3 text-sm text-muted">
                Give us a few details and we&apos;ll route your message to the
                right team.
              </p>

              {submitted ? (
                <div className="mt-8 rounded-2xl border border-rajlo-red/20 bg-primary-soft/50 p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rajlo-red text-white">
                      <Icon name="check-circle" className="h-5 w-5" />
                    </span>
                    <p className="text-lg font-bold text-rajlo-black">
                      Thanks, {name || "friend"} — message received.
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    We&apos;ll reply to <strong>{email}</strong> within 24
                    hours. For urgent issues, please use the safety links.
                  </p>
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setName("");
                      setEmail("");
                      setTopic("General question");
                      setMessage("");
                    }}
                    className="mt-5 rounded-full border border-rajlo-red px-5 py-2 text-sm font-bold text-rajlo-red hover:bg-white"
                  >
                    Send another
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="mt-8 space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field
                      label="Your name"
                      type="text"
                      value={name}
                      onChange={setName}
                      placeholder="Full name"
                      autoComplete="name"
                      required
                    />
                    <Field
                      label="Email"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Topic
                    </span>
                    <select
                      value={topic}
                      onChange={(e) => setTopic(e.target.value as Topic)}
                      className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
                    >
                      {TOPICS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Message
                    </span>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what's going on…"
                      rows={6}
                      required
                      className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
                    />
                  </label>

                  {error && (
                    <p className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !name || !email || !message}
                    className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Sending…" : "Send message"}
                    {!loading && <Icon name="arrow-right" className="h-4 w-4" />}
                  </button>

                  <p className="text-xs text-muted">
                    By submitting, you agree to our{" "}
                    <Link
                      href="/legal/privacy-policy"
                      className="font-semibold text-rajlo-red hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>

            {/* Side panels */}
            <div className="space-y-5">
              <div className="rounded-3xl border border-line bg-surface p-7">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  What to expect
                </p>
                <h3 className="mt-2 text-xl font-extrabold tracking-tight">
                  Fast, human replies.
                </h3>
                <ul className="mt-4 space-y-3 text-sm">
                  <ExpectRow
                    icon="clock"
                    text="Most messages answered within 24 hours — quicker Mon–Fri during business hours."
                  />
                  <ExpectRow
                    icon="mail"
                    text="We reply to the email you enter, so double-check it's correct."
                  />
                  <ExpectRow
                    icon="shield-check"
                    text="Never share your password. Rajlo staff will never ask for it."
                  />
                </ul>
              </div>

              <div className="rounded-3xl border border-rajlo-red/20 bg-primary-soft/50 p-7">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Emergency
                </p>
                <h3 className="mt-2 text-xl font-extrabold tracking-tight">
                  Need help right now?
                </h3>
                <p className="mt-3 text-sm text-rajlo-black">
                  In a life-threatening situation, call <strong>119</strong>{" "}
                  (Police) or <strong>110</strong> (Fire &amp; Ambulance). Use
                  the in-app SOS during a trip to share your live location with
                  us and your trusted contact.
                </p>
                <Link
                  href="/legal/safety-disclaimer-emergency-policy"
                  className="mt-5 inline-flex rounded-full border border-rajlo-red px-5 py-2 text-sm font-bold text-rajlo-red hover:bg-white"
                >
                  Safety policy
                </Link>
              </div>

              <div className="rounded-3xl border border-line bg-surface p-7">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Looking for an answer?
                </p>
                <h3 className="mt-2 text-xl font-extrabold tracking-tight">
                  Try the Help Center first.
                </h3>
                <p className="mt-3 text-sm text-muted">
                  Most rider, driver, safety, and billing questions are answered
                  there in under a minute.
                </p>
                <Link
                  href="/help"
                  className="mt-5 inline-flex rounded-full bg-rajlo-black px-5 py-2 text-sm font-bold text-white hover:bg-black"
                >
                  Visit Help Center →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function Method({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const inner = (
    <div className="h-full rounded-3xl border border-line bg-surface p-7 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-rajlo-red">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );

  return href ? <a href={href}>{inner}</a> : <div>{inner}</div>;
}

function ExpectRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      <span className="text-muted">{text}</span>
    </li>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
      />
    </label>
  );
}
