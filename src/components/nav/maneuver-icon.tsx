"use client";

import type { NavIcon } from "@/lib/turn-by-turn";

/**
 * Maneuver arrow icons. Drawn inline as SVG so we don't depend on the
 * global icon registry — these are nav-specific and would clutter the
 * shared icons.tsx without buying much reuse.
 *
 * All icons are 24×24 stroke icons matching the existing app's icon
 * style (rounded caps, currentColor stroke). The "straight" icon
 * doubles as a fallback for unrecognised maneuver values.
 */
export function ManeuverIcon({
  icon,
  className,
}: {
  icon: NavIcon;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[icon]}
    </svg>
  );
}

const paths: Record<NavIcon, React.ReactNode> = {
  // Straight ahead — upward arrow.
  straight: <path d="M12 19V5m0 0-5 5m5-5 5 5" />,
  // Curving left — arrow that comes up and bends left.
  left: <path d="M19 19V12a4 4 0 0 0-4-4H6m0 0 4-4m-4 4 4 4" />,
  // Curving right — mirror of left.
  right: <path d="M5 19V12a4 4 0 0 1 4-4h9m0 0-4-4m4 4-4 4" />,
  // Sharp left — tight 90° hook left.
  "sharp-left": <path d="M19 18V10a2 2 0 0 0-2-2H6m0 0 3-3m-3 3 3 3" />,
  "sharp-right": <path d="M5 18V10a2 2 0 0 1 2-2h11m0 0-3-3m3 3-3 3" />,
  // U-turn — semi-circle pointing back.
  uturn: <path d="M5 19V11a5 5 0 0 1 10 0v8m0 0-3-3m3 3 3-3" />,
  // Roundabout — circle with an exit arrow.
  roundabout: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 17v4m0 0-3-3m3 3 3-3" />
    </>
  ),
  // Merge — two lines converging into one, going up.
  merge: <path d="M7 21v-6a4 4 0 0 1 4-4l4-4m0 0v3m0-3h-3" />,
  // Arrive — destination pin.
  arrive: (
    <>
      <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
};
