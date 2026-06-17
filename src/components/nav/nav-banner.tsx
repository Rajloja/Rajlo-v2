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
 *   │  →   Turn right onto Hope Rd          200 m         │
 *   │  ─────────────────────────────────────────────      │
 *   │  Then ↑  Continue on Hope Rd                        │
 *   └────────────────────────────────────────────────────┘
 *
 * KEY MODEL: Google's `currentStep` describes the segment the driver
 * is currently *driving* — its `instruction` reads e.g. "Head west on
 * Hope Road" and is NOT useful as a banner headline (it's the road
 * they're already on). The headline must be `nextStep.instruction`
 * — the maneuver they're approaching — paired with the distance to
 * that maneuver. The secondary "Then" row uses `stepAfterNext` so
 * the driver can plan two moves ahead.
 *
 * Branding: dark green (#0E4D4A) per Rajlo's nav-banner colour, white
 * text. Top-safe-area padding so it clears the notch on phones.
 *
 * Empty states (no upcoming maneuver) → renders nothing. The active-trip
 * page is responsible for deciding when to mount the banner; the
 * banner just trusts the snapshot it's given.
 */
export function NavBanner({ snapshot }: { snapshot: NavSnapshot }) {
  // The PRIMARY headline is the upcoming maneuver, not the road the
  // driver is currently on. If there's no upcoming maneuver and the
  // driver isn't arriving yet, there's nothing to announce — bail.
  const upcoming = snapshot.nextStep;
  if (!upcoming && !snapshot.arriving) return null;

  const distLabel = formatDistance(snapshot.distanceToManeuverM);
  const mainText = snapshot.arriving
    ? "Arriving at destination"
    : upcoming?.instruction ?? "";
  const mainIcon = snapshot.arriving
    ? "arrive"
    : maneuverToIcon(upcoming?.maneuver ?? "straight");
  const after = snapshot.stepAfterNext;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3"
      style={{
        // Sit BELOW the top-left Back button, with a comfortable gap so
        // the two elements clearly stack vertically (back button on
        // top, instruction banner below). Back button geometry:
        // safe-area + 12px top + 40px height = +52px, so we clear it
        // with 20px breathing room → +72px.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 72px)",
      }}
    >
      <div className="pointer-events-auto rounded-2xl bg-[#0E4D4A] text-white shadow-xl ring-1 ring-black/20">
        {/* Primary instruction row — UPCOMING maneuver. */}
        <div className="flex items-center gap-4 px-4 py-4">
          <ManeuverIcon icon={mainIcon} className="h-9 w-9 shrink-0" />
          <p className="flex-1 truncate text-xl font-bold leading-tight">
            {mainText}
          </p>
          {distLabel && !snapshot.arriving && (
            <span className="shrink-0 font-secondary text-lg font-bold tabular-nums">
              {distLabel}
            </span>
          )}
        </div>

        {/* "Then" preview row — the maneuver AFTER the upcoming one,
           so the driver can plan two moves ahead. Hidden when no
           subsequent maneuver exists or we're already arriving. */}
        {after && !snapshot.arriving && (
          <div className="flex items-center gap-3 border-t border-white/15 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              Then
            </span>
            <ManeuverIcon
              icon={maneuverToIcon(after.maneuver)}
              className="h-4 w-4 shrink-0 text-white/85"
            />
            <p className="flex-1 truncate text-sm font-semibold text-white/90">
              {after.instruction}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
