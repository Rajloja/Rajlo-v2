"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon, type IconName } from "./icons";

/** Minimal document shape the consent block renders. Both the full
 *  registry `LegalDocument` and the trimmed wire objects returned by
 *  /api/legal/status satisfy this. */
export type ConsentDocument = {
  key: string;
  title: string;
  summary: string;
};

/**
 * Legal consent block — the shared, legally load-bearing UI shown at
 * signup and on the re-acceptance gate.
 *
 * Layout: the explicit consent checkbox sits inline on the form so
 * it's reachable without scrolling. The full policy list + the GPS /
 * payment / OTP disclosures open in a SEPARATE modal sheet.
 *
 * Why a modal (not an inline expander): the signup form is nested
 * inside motion wrappers (`FadeUp`/`Stagger`) that leave a lingering
 * CSS `transform` on an ancestor, and inside a fixed-width card.
 * Expanding a tall block inline there overflowed the viewport on
 * mobile. The modal is rendered through a React portal to
 * `document.body`, so it escapes every ancestor transform / overflow
 * / width constraint — it's `fixed inset-0` with its own internally
 * scrolling body, so it can never run off-screen.
 *
 * Consent stays enforceable: the checkbox copy names what's agreed
 * to, every policy is a real link to its full text at `/legal/<key>`,
 * the three high-impact consents are stated verbatim in the modal,
 * the parent blocks submission until the box is ticked, and the
 * acceptance is logged server-side (version + timestamp + IP).
 */

type Disclosure = {
  icon: IconName;
  title: string;
  body: string;
};

/** The three plain-language disclosures shown as callouts. Worded to
 *  mirror the Privacy Policy, Payment & Refund Policy, and the OTP /
 *  account-security language in the Terms. */
const DISCLOSURES: Disclosure[] = [
  {
    icon: "map-pin",
    title: "Location & background GPS",
    body: "RAJLO collects your real-time GPS location — including while the app runs in the background — to match trips, navigate, improve pickup accuracy, and detect fraud. You can change location permissions in your device settings, but core features may stop working.",
  },
  {
    icon: "credit-card",
    title: "Automatic payments",
    body: "RAJLO is fully cashless. You authorize RAJLO and its payment processors to automatically charge your payment method or wallet for trip fares, cancellation fees, no-show fees, cleaning or damage fees, and any outstanding balances — without asking again at the time of each charge.",
  },
  {
    icon: "shield-check",
    title: "OTP verification",
    body: "You consent to receive one-time verification codes (OTP) by SMS or email to secure your account. You agree to keep these codes confidential and accept responsibility for activity authorized with them.",
  },
];

export function LegalConsent({
  documents,
  checked,
  onChange,
  /** Heading copy — differs between signup and the re-acceptance gate. */
  heading = "Before you continue",
  intro = "Creating a RAJLO account means agreeing to the policies below. Tap any policy to read it in full.",
}: {
  documents: ConsentDocument[];
  checked: boolean;
  onChange: (next: boolean) => void;
  heading?: string;
  intro?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const count = documents.length;

  // Portals need `document`, which doesn't exist during SSR.
  useEffect(() => setMounted(true), []);

  // While the modal is open: lock background scroll and wire Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
        {heading}
      </p>

      {/* Review comes FIRST — a visitor can't honestly tick "I have
          read, understood, and agree" until they've had the chance to
          read. Displaying the checkbox above the review CTA implicitly
          reversed that order, which reads as "check this box, then
          maybe review if you feel like it." Legally the click still
          counted, but the ergonomics were wrong. Opens the policy detail
          in a portal modal (see component doc-comment for why a modal,
          not an inline expander). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-background px-3.5 py-2.5 text-left transition-colors hover:border-rajlo-red"
      >
        <span className="min-w-0 text-xs font-bold">
          Review the {count} {count === 1 ? "policy" : "policies"} &amp; key
          disclosures
        </span>
        <Icon
          name="chevron-right"
          className="h-4 w-4 shrink-0 text-muted"
        />
      </button>

      {/* The explicit consent checkbox — inline so it's reachable
          without scrolling, and sits BELOW the review button so the
          natural top-to-bottom reading order is
          "review → agree → submit". */}
      <label className="mt-2.5 flex cursor-pointer items-start gap-3 rounded-xl border border-rajlo-red/30 bg-primary-soft/40 p-3 sm:p-3.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line accent-rajlo-red focus:ring-2 focus:ring-rajlo-red/20"
        />
        <span className="min-w-0 text-xs font-semibold leading-relaxed">
          I have read, understood, and agree to be legally bound by RAJLO&apos;s{" "}
          {count} {count === 1 ? "policy" : "policies"} — and I consent to
          background GPS location, automatic wallet charges, OTP verification,
          and to RAJLO recording this acceptance.
        </span>
      </label>

      {open && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Policies and disclosures"
              className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => setOpen(false)}
            >
              <div
                className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:max-h-[85vh] sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header — fixed */}
                <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                      {heading}
                    </p>
                    <h3 className="mt-0.5 text-base font-extrabold tracking-tight">
                      What you&apos;re agreeing to
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>

                {/* Body — the only scrolling region */}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  <p className="text-xs leading-relaxed text-muted">{intro}</p>

                  {/* Policy list */}
                  <ul className="space-y-1.5">
                    {documents.map((doc) => (
                      <li key={doc.key}>
                        <Link
                          href={`/legal/${doc.key}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-rajlo-red"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">
                              {doc.title}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {doc.summary}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                            Read
                            <Icon name="arrow-right" className="h-3 w-3" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {/* High-impact disclosures */}
                  <div className="space-y-2.5">
                    {DISCLOSURES.map((d) => (
                      <div
                        key={d.title}
                        className="flex gap-3 rounded-xl bg-surface p-3 sm:p-3.5"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rajlo-red/10 text-rajlo-red">
                          <Icon name={d.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold">{d.title}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                            {d.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer — fixed */}
                <div className="border-t border-line px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex w-full items-center justify-center rounded-full bg-rajlo-red px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
