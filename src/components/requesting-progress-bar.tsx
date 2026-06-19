"use client";

import { useEffect, useState } from "react";

/**
 * "Finding your driver" status strip with a horizontal progress bar
 * that fills over the request window (default 5 min / 300s). Replaces
 * the on-map radar pulse that was hard to read on small screens and
 * tended to clash with the map underneath.
 *
 * Props:
 *   - searchingUntil: ISO timestamp of when the request auto-cancels.
 *     Null means we don't know — bar just animates as an indeterminate
 *     pulse instead of filling.
 *   - totalWindowSec: how long the original request window was. Used
 *     to compute the % filled. Defaults to 300 (5 min) which matches
 *     the matcher's timeout server-side.
 *
 * Renders a card meant to live at the top of the bottom-sheet body
 * during the `requested` ride status.
 */
export function RequestingProgressBar({
  searchingUntil,
  totalWindowSec = 300,
}: {
  searchingUntil: string | null;
  totalWindowSec?: number;
}) {
  // Re-render every second so the progress bar + countdown stay live.
  // We don't use `setState(elapsedSec)` because computing elapsed from
  // Date.now() in render keeps the bar in sync with wall-clock time
  // even if React skips a frame.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Seconds remaining until auto-cancel. Null when we have no deadline.
  const remainingSec = (() => {
    if (!searchingUntil) return null;
    const ms = new Date(searchingUntil).getTime() - Date.now();
    return Math.max(0, Math.round(ms / 1000));
  })();

  const filledPct =
    remainingSec === null
      ? 0
      : Math.min(
          100,
          Math.max(0, ((totalWindowSec - remainingSec) / totalWindowSec) * 100),
        );

  const mins = remainingSec === null ? null : Math.floor(remainingSec / 60);
  const secs = remainingSec === null ? null : remainingSec % 60;
  const countdownLabel =
    mins === null || secs === null
      ? null
      : `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rajlo-red opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rajlo-red" />
        </span>
        <p className="text-sm font-extrabold tracking-tight">
          Finding your driver…
        </p>
        {countdownLabel && (
          <span className="ml-auto font-mono text-xs font-bold tabular-nums text-muted">
            {countdownLabel}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Verified red-plate drivers nearby are being notified right now.
      </p>

      {/* Progress bar — fills from left to right as the window
         elapses. When we don't know the deadline (`searchingUntil`
         null), animate an indeterminate sliding stripe instead so
         the bar still communicates "active". */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
        {searchingUntil ? (
          <div
            className="h-full rounded-full bg-rajlo-red transition-[width] duration-1000 ease-linear"
            style={{ width: `${filledPct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-rajlo-red" />
        )}
      </div>

      <style jsx>{`
        @keyframes indeterminate {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
      `}</style>
    </div>
  );
}
