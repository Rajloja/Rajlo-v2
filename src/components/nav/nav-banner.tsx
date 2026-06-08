"use client";

import {
  formatDistance,
  maneuverToIcon,
  type NavSnapshot,
} from "@/lib/turn-by-turn";
import { ManeuverIcon } from "./maneuver-icon";

/**
 * Top-of-screen turn-by-turn instruction banner.
 *
 * Two-row layout matching the look of Google Maps / Uber driver:
 *   ┌────────────────────────────────────────────────────┐
 *   │  ↑   Head north                       200 m         │
 *   │  ─────────────────────────────────────────────      │
 *   │  Then →  Turn right onto Hope Rd                    │
 *   └────────────────────────────────────────────────────┘
 *
 * Branding: dark green (#0E4D4A) per Rajlo's nav-banner colour, white
 * text. Top-safe-area padding so it clears the notch on phones.
 *
 * Empty states (no current step) → renders nothing. The active-trip
 * page is responsible for deciding when to mount the banner; the
 * banner just trusts the snapshot it's given.
 */
export function NavBanner({ snapshot }: { snapshot: NavSnapshot }) {
  const step = snapshot.currentStep;
  if (!step) return null;

  const distLabel = formatDistance(snapshot.distanceToManeuverM);
  const mainText = snapshot.arriving
    ? "Arriving at destination"
    : step.instruction;
  const next = snapshot.nextStep;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      <div className="pointer-events-auto rounded-2xl bg-[#0E4D4A] text-white shadow-xl ring-1 ring-black/20">
        {/* Primary instruction row */}
        <div className="flex items-center gap-4 px-4 py-4">
          <ManeuverIcon
            icon={
              snapshot.arriving
                ? "arrive"
                : maneuverToIcon(step.maneuver)
            }
            className="h-9 w-9 shrink-0"
          />
          <p className="flex-1 truncate text-xl font-bold leading-tight">
            {mainText}
          </p>
          {distLabel && !snapshot.arriving && (
            <span className="shrink-0 font-secondary text-lg font-bold tabular-nums">
              {distLabel}
            </span>
          )}
        </div>

        {/* Next-step preview row (only when there's a next step). */}
        {next && !snapshot.arriving && (
          <div className="flex items-center gap-3 border-t border-white/15 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              Then
            </span>
            <ManeuverIcon
              icon={maneuverToIcon(next.maneuver)}
              className="h-4 w-4 shrink-0 text-white/85"
            />
            <p className="flex-1 truncate text-sm font-semibold text-white/90">
              {next.instruction}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
