"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Icon } from "./icons";
import { isNativeApp } from "@/lib/native";

/**
 * Cookie-consent banner + consent-gated analytics.
 *
 * Model:
 *   - ESSENTIAL cookies (Supabase auth session, payment/CSRF security)
 *     are strictly necessary and always set — no consent required, and
 *     "Decline" does NOT sign the user out.
 *   - NON-ESSENTIAL (Vercel Web Analytics) only runs once the visitor
 *     taps "Accept cookies". That's what `ConsentedAnalytics` gates.
 *
 * Choice is stored in localStorage and broadcast via a window event so
 * the analytics gate flips on/off live, without a reload.
 */
const CONSENT_KEY = "rajlo-cookie-consent";
const CONSENT_EVENT = "rajlo-cookie-consent-change";
const CONSENT_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
type Consent = "accepted" | "declined";

// Store the choice in a COOKIE (not localStorage) so it's shared across
// every *.rajlo.com surface — apex, rider., driver., admin. localStorage
// is per-origin, which is why the banner reappeared on each subdomain.
// A cookie scoped to `.rajlo.com` is sent to (and readable from) all of
// them, so one Accept/Decline covers the whole domain. On localhost /
// *.vercel.app previews the cookie is host-only (that domain wouldn't
// accept a `.rajlo.com` scope).
function consentCookieDomain(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "rajlo.com" || host.endsWith(".rajlo.com")) {
    return "; domain=.rajlo.com";
  }
  return "";
}

function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + CONSENT_KEY + "=([^;]*)"),
  );
  const v = match ? decodeURIComponent(match[1]) : null;
  return v === "accepted" || v === "declined" ? v : null;
}

function writeConsent(value: Consent) {
  if (typeof document !== "undefined") {
    const secure =
      window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${CONSENT_KEY}=${value}; path=/; max-age=${CONSENT_MAX_AGE}` +
      `${consentCookieDomain()}; SameSite=Lax${secure}`;
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

/**
 * Renders Vercel Web Analytics ONLY after the visitor has accepted
 * cookies. Mounted in the root layout in place of a bare <Analytics />.
 * Reacts live to the consent event so accepting starts analytics
 * immediately (and there's no way to start it without consent).
 */
export function ConsentedAnalytics() {
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    const sync = () => setAccepted(readConsent() === "accepted");
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);
  if (!accepted) return null;
  return <Analytics />;
}

/**
 * The bottom consent banner. Shows until the visitor makes a choice.
 * Suppressed inside the native Capacitor app (no browser cookie regime
 * there) and once a choice is stored.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return; // native app — not a browser-cookie context
    if (readConsent() !== null) return; // already chose — never show again
    // Defer out of the effect body (avoids a synchronous setState) and
    // keeps the first paint banner-free until we've read client storage,
    // so there's no SSR/hydration mismatch.
    const t = window.setTimeout(() => setShow(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Lock page scroll while the consent modal is up so the dimmed page
  // behind it can't be scrolled until the visitor chooses.
  useEffect(() => {
    if (!show || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  const choose = (value: Consent) => {
    writeConsent(value);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center px-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      {/* Dark blurred backdrop — dims + freezes the page behind the
         banner. Non-dismissible: the visitor must pick Accept/Decline. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-rajlo-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl rounded-3xl border border-line bg-surface p-4 shadow-2xl shadow-rajlo-black/40 md:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary-soft text-rajlo-red">
            <Icon name="shield-check" className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed text-foreground">
            We use cookies to keep you signed in, secure your payments, and
            improve Rajlo. See our{" "}
            <Link
              href="/legal/privacy-policy"
              className="font-semibold text-rajlo-red underline-offset-2 hover:underline"
            >
              Cookie Policy
            </Link>
            .
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="inline-flex items-center justify-center rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-surface-soft"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="inline-flex items-center justify-center rounded-full bg-rajlo-red px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            Accept cookies
          </button>
        </div>
      </div>
    </div>
  );
}
