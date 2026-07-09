"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();

  // Suppress on every /legal/* page. Cookie Policy, Privacy Policy,
  // Terms of Service — anywhere the visitor is actively trying to
  // read the exact document the banner is about — is off-limits. The
  // banner appearing on top of the Cookie Policy while the visitor is
  // trying to read it (the whole reason they clicked the link) is
  // both a bad UX and defeats the point of having a linkable policy.
  const isLegalPage = pathname?.startsWith("/legal/") ?? false;

  useEffect(() => {
    if (isNativeApp()) return; // native app — not a browser-cookie context
    if (readConsent() !== null) return; // already chose — never show again
    if (isLegalPage) return; // legal pages get an uninterrupted read
    // Show the banner after a randomised 5–10s delay so it doesn't slam
    // the visitor the moment the page paints (that reads as forcing a
    // decision). The randomness keeps every session slightly different
    // so it doesn't look like a scripted "always at 5s" prompt. If the
    // visitor navigates away in that window, the cleanup below cancels
    // whichever timer is currently scheduled and we never mount the
    // banner at all.
    const delayMs = 5_000 + Math.random() * 5_000;
    // Tracked with `let` so cleanup can clear WHICHEVER timer is
    // currently outstanding — the initial 5–10s delay OR the
    // 300ms keyboard-close buffer that may replace it below.
    let timer: number | null = null;

    const reveal = () => {
      // Keyboard-first-then-banner UX. If the visitor is actively
      // typing (pickup / dropoff on the landing page is the case Raj
      // flagged), the iOS keyboard covers the bottom of the viewport
      // — dropping the consent banner in behind it means the visitor
      // sees a dimmed page with autocomplete chips still floating and
      // no clear indication anything's changed. Blur the field first,
      // let iOS finish its ~250ms keyboard-close animation, THEN show
      // the banner so it lands on a clean, un-covered viewport.
      //
      // `document.activeElement` is null on some edge cases (SSR, no
      // focus, focus on <body>). The instanceof checks tell us the
      // focus is on a real text field; readonly / disabled inputs also
      // satisfy instanceof but don't open the keyboard, so at worst we
      // add a harmless 300ms wait — no visual regression.
      const active =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement | null)
          : null;
      const isTextField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        Boolean(active?.isContentEditable);
      if (isTextField && active) {
        active.blur();
        // 320ms comfortably clears iOS Safari's 250-280ms keyboard
        // slide-down; slightly longer than the native animation so
        // visualViewport has fully settled to full height before the
        // banner's fixed-bottom layout kicks in — no jitter.
        timer = window.setTimeout(() => setShow(true), 320);
      } else {
        setShow(true);
      }
    };

    timer = window.setTimeout(reveal, delayMs);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isLegalPage]);

  // Belt-and-braces: if the visitor was on a non-legal page when the
  // 5-10s timer resolved (banner mounted) and THEN navigated to a
  // /legal/* URL, hide it in-flight. Rare in practice — the timer is
  // 5-10s and legal-link clicks are usually much faster than that —
  // but this closes the exact case the user reported (banner still
  // visible on the Cookie Policy page after clicking through).
  useEffect(() => {
    if (isLegalPage && show) setShow(false);
  }, [isLegalPage, show]);

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
