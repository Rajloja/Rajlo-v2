"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "./icons";
import { formatJMD } from "@/lib/jamaica";

/**
 * DepositBottomSheet — inline wallet-fund modal.
 *
 * Replaces the old flow (fail to book → centre dialog → navigate to
 * /rider/wallet?deposit=open → tap Deposit → fill form) with a
 * one-tap sheet on top of whichever surface the rider was on.
 *
 * Two callable shapes:
 *
 *   1. `context` present — insufficient-funds mode. Header shows the
 *      trip fare + current balance + short-by figure; the amount input
 *      pre-fills with a suggested value (short-by rounded up to the
 *      next JMD 500 tier) so a new rider signing up right before their
 *      first booking can tap Continue immediately.
 *
 *   2. `context` omitted — general top-up. No fare header, just amount
 *      input + quick-tap chips.
 *
 * On successful submit the API returns a `redirectUrl` (payment
 * gateway) and we hand off via `window.location.assign` so the browser
 * treats it as a top-level navigation the payment SDK expects.
 *
 * Rendered through `createPortal(..., document.body)` so parent
 * stacking / overflow contexts (rider bottom-sheet, backdrop layers)
 * can't hide it — z-[90] sits above every other overlay in the app.
 */
export function DepositBottomSheet({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  /** Passed when the sheet is opened as an insufficient-funds prompt.
   *  Both figures render as a compact reason strip at the top and the
   *  amount input pre-fills with `Math.ceil(shortBy / 500) * 500`. */
  context?: { fareJmd: number; balanceJmd: number };
}) {
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState<string>("1000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rounded-up suggestion. Snapping to JMD 500 tiers keeps the
  // pre-fill readable (nobody types 3,247 into a top-up field) and
  // leaves a small buffer over the shortfall for tip / tolls.
  const shortBy = context
    ? Math.max(0, context.fareJmd - context.balanceJmd)
    : 0;
  const suggested =
    shortBy > 0 ? Math.ceil(shortBy / 500) * 500 : 1000;

  // Client-portal gate + body-scroll lock + Escape-to-close +
  // suggested-amount pre-fill. All ONE effect keyed to `open` so
  // closing the sheet restores everything the open cleanly reversed.
  useEffect(() => {
    setMounted(true);
    if (!open) return;
    setAmount(String(suggested));
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // suggested is derived from `context` — omitting it from deps
    // stops React from re-firing the effect on every parent render
    // (which would reset amount mid-typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const submit = async () => {
    const amountJmd = parseInt(amount, 10);
    if (!Number.isInteger(amountJmd) || amountJmd < 100) {
      setError("Minimum deposit is JMD 100.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountJmd }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectUrl?: string;
      };
      if (!res.ok || !json.redirectUrl) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Full-page navigation — the payment gateway SDK reads the
      // referring origin and expects to own the tab from here.
      window.location.assign(json.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start deposit.");
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <m.div
            key="backdrop"
            className="fixed inset-0 z-[90] bg-rajlo-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <m.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Fund your wallet"
            className="fixed inset-x-0 bottom-0 z-[91] flex justify-center px-3 pb-3 sm:pb-6"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag-handle indicator — visual hint that the sheet is
                  dismissable. Not actually draggable (the backdrop tap
                  handles dismissal) but rides the mobile bottom-sheet
                  language so the rider recognises the pattern. */}
              <div className="flex justify-center py-2.5">
                <span className="h-1.5 w-12 rounded-full bg-line" />
              </div>

              <div className="px-5 pb-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                      {context ? "Top up to book" : "Add funds"}
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">
                      Fund your wallet
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      Card payment · funds reflect instantly on success.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-background text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>

                {/* Reason strip — only shown in insufficient-funds mode. */}
                {context && (
                  <dl className="mt-4 space-y-2 rounded-2xl border border-rajlo-red/25 bg-primary-soft/40 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <dt className="text-muted">Trip fare</dt>
                      <dd className="font-bold tabular-nums">
                        {formatJMD(context.fareJmd)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <dt className="text-muted">Your balance</dt>
                      <dd className="font-bold tabular-nums">
                        {formatJMD(context.balanceJmd)}
                      </dd>
                    </div>
                    <div className="my-0.5 border-t border-rajlo-red/20" />
                    <div className="flex items-center justify-between text-sm">
                      <dt className="font-bold text-rajlo-red">Short by</dt>
                      <dd className="font-extrabold tabular-nums text-rajlo-red">
                        {formatJMD(shortBy)}
                      </dd>
                    </div>
                  </dl>
                )}

                {/* Amount input */}
                <label className="mt-4 block">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">
                    Amount (JMD)
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-line bg-background px-4 py-3 focus-within:border-rajlo-red">
                    <span className="text-sm font-extrabold text-muted">JMD</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={100}
                      step={100}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-transparent text-2xl font-extrabold tabular-nums text-foreground focus:outline-none"
                    />
                  </div>
                </label>

                {/* Quick tiers */}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[500, 1000, 2000, 5000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className={`rounded-full border py-2 text-xs font-bold transition-colors ${
                        parseInt(amount, 10) === v
                          ? "border-rajlo-red bg-rajlo-red text-white"
                          : "border-line bg-background text-muted hover:border-rajlo-red/40 hover:text-foreground"
                      }`}
                    >
                      {formatJMD(v)}
                    </button>
                  ))}
                </div>

                {error && (
                  <p className="mt-3 text-xs font-semibold text-rajlo-red">
                    {error}
                  </p>
                )}

                {/* Submit */}
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                      Opening checkout…
                    </>
                  ) : (
                    <>
                      <Icon name="plus-circle" className="h-4 w-4" />
                      Continue to payment
                    </>
                  )}
                </button>

                <p className="mt-2 text-center text-[10px] text-muted">
                  Secured with 3-D Secure · you&apos;ll come right back here
                  after payment.
                </p>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
