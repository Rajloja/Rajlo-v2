"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { ArcWatermark } from "@/components/arc-pattern";

const TOPICS = [
  "General question",
  "Trip issue",
  "Driver application",
  "Compliance / TA documents",
  "Press inquiry",
  "Partnerships",
  "Other",
] as const;

type Topic = (typeof TOPICS)[number];

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
      {/* Hero */}
      <section className="relative overflow-hidden bg-rajlo-black py-20 text-white">
        <ArcWatermark size={620} variant="red" className="absolute -right-32 -bottom-40 opacity-[0.10]" />
        <div className="relative mx-auto max-w-6xl px-4">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Contact
          </p>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight md:text-6xl">
            Talk to Rajlo.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Real humans, fast replies. Most messages answered within 24 hours,
            faster during business hours.
          </p>
        </div>
      </section>

      {/* Methods */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-5 md:grid-cols-3">
          <Method
            label="Email"
            value="support@rajlo.com"
            sub="24-hr response"
            href="mailto:support@rajlo.com"
          />
          <Method
            label="Phone"
            value="876-000-0000"
            sub="Mon–Fri, 8 am – 6 pm JM time"
            href="tel:+18760000000"
          />
          <Method
            label="Headquarters"
            value="Kingston, Jamaica"
            sub="By appointment only"
          />
        </div>

        <p className="mt-6 text-xs text-muted">
          Phone and email are placeholder values until launch — we&apos;ll publish the
          real ones once Rajlo support is live.
        </p>
      </section>

      {/* Form + emergency */}
      <section className="bg-surface-soft py-20">
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

              {submitted ? (
                <div className="mt-8 rounded-2xl border border-rajlo-red/20 bg-primary-soft/50 p-6">
                  <p className="text-lg font-bold text-rajlo-black">
                    Thanks, {name || "friend"} — message received.
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    We&apos;ll reply to <strong>{email}</strong> within 24 hours. For
                    urgent issues, please use the safety links below.
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
                    <span className="mb-2 block text-sm font-semibold">Topic</span>
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
                    <span className="mb-2 block text-sm font-semibold">Message</span>
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
                    className="rounded-full bg-rajlo-red px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Sending…" : "Send message"}
                  </button>

                  <p className="text-xs text-muted">
                    By submitting, you agree to our{" "}
                    <Link href="/legal/privacy-policy" className="font-semibold text-rajlo-red hover:underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>

            {/* Side panels */}
            <div className="space-y-5">
              <div className="rounded-3xl border border-rajlo-red/20 bg-primary-soft/50 p-7">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Emergency
                </p>
                <h3 className="mt-2 text-xl font-extrabold tracking-tight">
                  Need help right now?
                </h3>
                <p className="mt-3 text-sm text-rajlo-black">
                  In a life-threatening situation, call <strong>119</strong> (Police) or <strong>110</strong> (Fire & Ambulance).
                  Use the in-app SOS during a trip to share your live location with us and your trusted contact.
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
                  Most rider, driver, safety, and billing questions are answered there in under a minute.
                </p>
                <Link
                  href="/help"
                  className="mt-5 inline-flex rounded-full bg-rajlo-black px-5 py-2 text-sm font-bold text-white hover:bg-black"
                >
                  Visit Help Center →
                </Link>
              </div>

              <div className="rounded-3xl border border-line bg-surface p-7">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Press / partnerships
                </p>
                <p className="mt-2 text-sm text-muted">
                  For media or partnership requests, please pick the matching topic in the form so we route your message correctly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function Method({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const inner = (
    <div className="h-full rounded-3xl border border-line bg-surface p-7 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md">
      <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
        {label}
      </p>
      <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );

  return href ? <a href={href}>{inner}</a> : <div>{inner}</div>;
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
