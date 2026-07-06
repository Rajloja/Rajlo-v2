"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "./icons";
import { formatJMD } from "@/lib/jamaica";

/**
 * Modal shown when the rider tries to book a trip but their wallet
 * balance can't cover the estimated fare.
 *
 * UX:
 *   - Centered card with a red coin/wallet icon for instant intent.
 *   - Shows BOTH the fare and the current balance so the rider can
 *     see exactly how short they are (and the gap, computed below).
 *   - Two actions: secondary "Not now" closes; primary "Deposit now"
 *     either invokes the `onDeposit` callback (parent handles it —
 *     typically to open the inline DepositBottomSheet) or, absent a
 *     callback, falls back to navigating to /rider/wallet?deposit=open
 *     so surfaces that haven't wired the inline sheet still work.
 *
 * Backdrop click + Esc both close — the dialog is informational, so
 * we don't trap the user inside it.
 */
export function InsufficientFundsDialog({
  open,
  fareJmd,
  balanceJmd,
  onClose,
  onDeposit,
}: {
  open: boolean;
  /** Estimated fare for the trip the rider tried to book. */
  fareJmd: number;
  /** Current wallet balance. */
  balanceJmd: number;
  onClose: () => void;
  /** Optional handler for the primary CTA. When provided, the dialog
   *  closes itself and delegates the deposit flow to the parent
   *  (typically to open an inline DepositBottomSheet). When omitted,
   *  the dialog navigates the rider to /rider/wallet?deposit=open —
   *  the legacy behaviour, preserved for any surface that hasn't
   *  wired the inline sheet yet. */
  onDeposit?: () => void;
}) {
  const router = useRouter();
  const shortBy = Math.max(0, fareJmd - balanceJmd);

  const handleDeposit = () => {
    onClose();
    if (onDeposit) {
      // Delegate — parent decides what happens next (e.g. open the
      // DepositBottomSheet in-place on the request page).
      onDeposit();
      return;
    }
    // Legacy fallback — take the rider to the wallet page's deposit
    // composer with ?deposit=open so it auto-expands.
    router.push("/rider/wallet?deposit=open");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop. Separate motion node from the card so the card
             can spring in while the backdrop fades, not on the same
             curve — the dialog feels punchier when the box has its
             own little overshoot. */}
          <m.div
            key="backdrop"
            className="fixed inset-0 z-[80] bg-rajlo-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <m.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="insufficient-funds-title"
            className="fixed inset-0 z-[81] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          >
            <m.div
              className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface p-7 shadow-2xl ring-1 ring-line"
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              // Stop bubbling so a click on the card itself doesn't
              // hit the backdrop's onClose.
              onClick={(e) => e.stopPropagation()}
            >
              {/* Icon halo */}
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rajlo-red/12 text-rajlo-red ring-1 ring-rajlo-red/25">
                <Icon name="wallet" className="h-7 w-7" />
              </div>

              <h2
                id="insufficient-funds-title"
                className="mt-5 text-center text-xl font-extrabold tracking-tight"
              >
                Not enough in your wallet
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-muted">
                Top up to book this trip. We've got you — deposits land
                instantly.
              </p>

              {/* Numbers block */}
              <dl className="mt-5 space-y-2 rounded-2xl border border-line bg-background p-4">
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted">Trip fare</dt>
                  <dd className="font-bold tabular-nums">
                    {formatJMD(fareJmd)}
                  </dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted">Your balance</dt>
                  <dd className="font-bold tabular-nums">
                    {formatJMD(balanceJmd)}
                  </dd>
                </div>
                <div className="my-1 border-t border-line" />
                <div className="flex items-center justify-between text-sm">
                  <dt className="font-bold text-rajlo-red">Short by</dt>
                  <dd className="font-extrabold tabular-nums text-rajlo-red">
                    {formatJMD(shortBy)}
                  </dd>
                </div>
              </dl>

              {/* Actions */}
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleDeposit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
                >
                  <Icon name="plus-circle" className="h-4 w-4" />
                  Deposit now
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex w-full items-center justify-center rounded-full border border-line bg-background px-5 py-3 text-sm font-bold text-foreground hover:bg-surface-2"
                >
                  Not now
                </button>
              </div>
            </m.div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
