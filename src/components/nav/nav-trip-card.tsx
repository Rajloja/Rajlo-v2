"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { haptics } from "@/lib/native";
import {
  formatDistance,
  formatDuration,
  formatEta,
  type NavSnapshot,
} from "@/lib/turn-by-turn";

/**
 * Bottom-of-screen trip control card for the in-app turn-by-turn nav.
 *
 * Compact layout:
 *   ┌───────────────────────────────────────────────────┐
 *   │  25 min · 10 km · ETA 5:08 PM            [Arrive]│
 *   │  Pick up Jane · 24 Hope Rd                ▼       │
 *   └───────────────────────────────────────────────────┘
 *
 * Tap the chevron to expand and reveal the secondary controls (cancel
 * ride, report no-show, etc.) which come from `expandedChildren`.
 *
 * Status drives the colour + label of the primary action:
 *   accepted    → red "I've arrived" (sets ride.status to `arrived`)
 *   arrived     → red "Start trip" (PIN gate happens outside the card)
 *   in_progress → green "Complete trip" (settles the fare)
 */
type Props = {
  snapshot: NavSnapshot;
  /** Headline shown beneath the meta row. Typically "Pick up Jane"
   *  before the trip starts, "Drop off Jane" once in progress. */
  headline: string;
  /** Single-line address shown to the right of the headline.
   *  Typically pickup address before arrival, dropoff address after. */
  addressLine: string | null;
  /** Estimated fare for this trip — rendered as a high-visibility
   *  pill on the right of the headline row so the driver can see
   *  what they're earning at a glance while navigating. Optional;
   *  hidden when null. */
  priceLabel?: string | null;
  /** Action button label — e.g. "I've arrived", "Start trip",
   *  "Complete trip". Determined by the active-trip page. */
  actionLabel: string;
  /** Visual flavour of the action button. */
  actionVariant: "primary" | "success";
  /** Disabled state — set while the previous action is in flight. */
  actionDisabled?: boolean;
  /** True when the action is currently being POSTed — shows a spinner
   *  in place of the icon. */
  acting?: boolean;
  /** Fires when the user taps the primary action. */
  onAction: () => void;
  /** Optional secondary controls revealed when the user taps the
   *  expand chevron (cancel ride, no-show flow, etc.). When omitted,
   *  the chevron is hidden. */
  expandedChildren?: React.ReactNode;
  /** Reports the card's measured pixel height to the host page on
   *  every resize (initial mount, expand toggle, viewport reflow).
   *  Lets the host push other floating controls (locate-me button,
   *  voice mute, etc.) up so they always sit above the card. */
  onHeightChange?: (px: number) => void;
};

export function NavTripCard({
  snapshot,
  headline,
  addressLine,
  priceLabel,
  actionLabel,
  actionVariant,
  actionDisabled,
  acting,
  onAction,
  expandedChildren,
  onHeightChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Report our outer height (including the safe-area padding) to the
  // host on every layout change. Drives the locate-me button's
  // dynamic bottom offset so it stays above the card when expanded.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      onHeightChange?.(el.offsetHeight);
      return;
    }
    const ro = new ResizeObserver(() => {
      onHeightChange?.(el.offsetHeight);
    });
    ro.observe(el);
    // Fire once immediately for the initial mount.
    onHeightChange?.(el.offsetHeight);
    return () => ro.disconnect();
  }, [onHeightChange]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div className="pointer-events-auto rounded-2xl bg-surface shadow-2xl ring-1 ring-line">
        {/* Compact row — always visible. */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {/* Meta row + price pill side-by-side. Price is the
               driver's earnings preview — pinning it here keeps it in
               peripheral vision the whole drive without competing
               with the maneuver banner up top. */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-muted">
                {formatDuration(snapshot.totalRemainingS)} ·{" "}
                {formatDistance(snapshot.totalRemainingM)} · ETA{" "}
                {formatEta(snapshot.totalRemainingS)}
              </p>
              {priceLabel && (
                <span className="shrink-0 rounded-full bg-rajlo-red px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-white shadow-sm shadow-rajlo-red/30">
                  {priceLabel}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm font-bold text-foreground">
              {headline}
            </p>
            {addressLine && (
              <p className="truncate text-xs text-muted">{addressLine}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (actionDisabled || acting) return;
              void haptics.medium();
              onAction();
            }}
            disabled={actionDisabled || acting}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
              actionVariant === "success"
                ? "bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-700"
                : "bg-rajlo-red shadow-rajlo-red/30 hover:bg-primary-hover"
            }`}
          >
            {acting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>{actionLabel}</span>
                <Icon
                  name={
                    actionVariant === "success" ? "check-circle" : "arrow-right"
                  }
                  className="h-4 w-4"
                />
              </>
            )}
          </button>
        </div>

        {/* Expand toggle — only when we have secondary controls. */}
        {expandedChildren && (
          <>
            <button
              type="button"
              onClick={() => {
                void haptics.tap();
                setExpanded((v) => !v);
              }}
              className="flex w-full items-center justify-center gap-1 border-t border-line py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted transition-colors hover:bg-surface-soft"
              aria-expanded={expanded}
            >
              {expanded ? "Hide options" : "More options"}
              <Icon
                name="chevron-down"
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
            {expanded && (
              <div className="space-y-2 border-t border-line px-4 pb-4 pt-3">
                {expandedChildren}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
