"use client";

import {
  formatDistance,
  maneuverToIcon,
  type NavSnapshot,
} from "@/lib/turn-by-turn";
import { ManeuverIcon } from "./maneuver-icon";

/**
 * Compact "directions-only" layout shown while the driver app is in
 * the Picture-in-Picture float (Android). Because the PiP window is
 * tiny, we drop everything except the ONE thing that matters at a
 * glance while the driver is in another app: the next maneuver + how
 * far to it.
 *
 * Rendered full-bleed (fixed inset-0) so it fills the whole scaled-down
 * PiP surface. Only mounted while `isInPip` is true — the normal nav
 * screen renders otherwise.
 */
export function PipDirections({ snapshot }: { snapshot: NavSnapshot }) {
  const arriving = snapshot.arriving;
  const upcoming = snapshot.nextStep;
  const distLabel = formatDistance(snapshot.distanceToManeuverM);
  const icon = arriving
    ? "arrive"
    : maneuverToIcon(upcoming?.maneuver ?? "straight");
  const text = arriving
    ? "Arriving"
    : upcoming?.instruction ?? "Continue ahead";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-2 bg-rajlo-black px-4 text-center text-white">
      <ManeuverIcon icon={icon} className="h-16 w-16 shrink-0 text-white" />
      {!arriving && distLabel && (
        <p className="font-secondary text-[2.75rem] font-extrabold leading-none tabular-nums">
          {distLabel}
        </p>
      )}
      <p className="line-clamp-2 text-base font-bold leading-tight text-white/90">
        {text}
      </p>
    </div>
  );
}
