/**
 * Turn-by-turn navigation step tracker.
 *
 * Pure logic — no React, no DOM, no Google API loading. The hook in
 * `use-turn-by-turn.ts` wires this up to the driver's live position
 * and Web Speech API. The component in `nav-banner.tsx` renders the
 * derived state.
 *
 * Step model:
 *   A Google DirectionsRoute is a sequence of "legs", each leg a
 *   sequence of "steps". A step is one maneuver (e.g. "turn right
 *   onto Hope Road"). We flatten all legs into one ordered list of
 *   steps and track which one the driver is currently traversing.
 *
 *   The driver's "current step" is the step they're about to execute
 *   — i.e. the next maneuver. When they get close enough to the
 *   maneuver point (the step's end_location), we advance to the
 *   following step.
 *
 *   Advancement threshold (NEXT_STEP_THRESHOLD_M) is deliberately
 *   generous (35m): GPS noise + slow update cadence means we can't
 *   require pinpoint accuracy. Slight over-advancement is benign —
 *   the next step's instruction is what the driver needs to hear
 *   anyway.
 */

export type RawStep = google.maps.DirectionsStep;

/** Re-exported so consumers can hold the Directions route in state
 *  without dragging the `google.maps.*` namespace through every
 *  importing file (which then needs the @types/google.maps reference
 *  itself). The runtime value is unchanged — this is purely a type
 *  alias for ergonomics. */
export type DirectionsRoute = google.maps.DirectionsRoute;

export type FlatStep = {
  /** Index in the flattened steps array. */
  index: number;
  /** Cleaned instruction text (HTML stripped from html_instructions). */
  instruction: string;
  /** Street name if extractable from instruction (best-effort). */
  street: string | null;
  /** Length of this step in meters. */
  distanceM: number;
  /** Duration of this step in seconds. */
  durationS: number;
  /** Google's maneuver hint (e.g. "turn-right", "merge", "roundabout-right"). */
  maneuver: string;
  /** End point of this step — i.e. the maneuver location. */
  end: { lat: number; lng: number };
  /** Start point of this step. */
  start: { lat: number; lng: number };
  /** Sum of `distanceM` for every step AFTER this one. Precomputed at
   *  flatten time so `computeSnapshot` is O(1) instead of O(steps). */
  remainingDistanceM: number;
  /** Sum of `durationS` for every step AFTER this one. Same idea. */
  remainingDurationS: number;
};

export type NavSnapshot = {
  currentStep: FlatStep | null;
  nextStep: FlatStep | null;
  /** Distance from the driver to the next maneuver (end of currentStep)
   *  in meters. Null if no current step. */
  distanceToManeuverM: number | null;
  /** Total remaining distance along the route in meters. */
  totalRemainingM: number;
  /** Total remaining duration in seconds, computed from the same
   *  flatten + portion-of-current-step heuristic. */
  totalRemainingS: number;
  /** True when the driver has passed the last maneuver and is on the
   *  final approach to the destination. The banner switches to
   *  "Arriving at destination" copy in this state. */
  arriving: boolean;
};

/** When the driver gets within this many meters of the current step's
 *  end location, advance to the next step. */
const NEXT_STEP_THRESHOLD_M = 35;

/** When the driver gets within this many meters of the destination,
 *  call the trip "arrived" for nav-banner purposes. */
const ARRIVING_THRESHOLD_M = 40;

/** Strip HTML tags from Google's html_instructions field. Google
 *  embeds inline <b>, <div class="...">, and other markup in there;
 *  we want plain text for the banner + the speech synthesiser. */
export function cleanInstruction(html: string): string {
  if (!html) return "";
  // The instructions sometimes contain <div class="something">…</div>
  // appended after the main text — the inner div is the "lane info"
  // ("Pass by Sandy Park") which is too verbose for our banner. Drop
  // anything inside divs.
  const withoutDiv = html.replace(/<div[^>]*>.*?<\/div>/gi, "");
  return withoutDiv
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort extract of the road name out of an instruction. Used
 *  for the second-line preview in the banner. Returns null when we
 *  can't tell. Google's instructions almost always end with "onto X"
 *  or "on X" or "toward X". */
export function extractStreet(instruction: string): string | null {
  if (!instruction) return null;
  const ontoMatch = instruction.match(/(?:onto|on)\s+(.+?)(?:\s+toward|$)/i);
  if (ontoMatch) return ontoMatch[1].trim();
  const towardMatch = instruction.match(/toward\s+(.+)$/i);
  if (towardMatch) return towardMatch[1].trim();
  return null;
}

/** Flatten a DirectionsRoute (which has legs[steps[]]) into a single
 *  ordered list of FlatSteps. Empty list if route has no legs. */
export function flattenSteps(route: google.maps.DirectionsRoute): FlatStep[] {
  const out: FlatStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const instruction = cleanInstruction(step.instructions ?? "");
      out.push({
        index: out.length,
        instruction,
        street: extractStreet(instruction),
        distanceM: step.distance?.value ?? 0,
        durationS: step.duration?.value ?? 0,
        maneuver: (step as { maneuver?: string }).maneuver ?? "straight",
        end: { lat: step.end_location.lat(), lng: step.end_location.lng() },
        start: {
          lat: step.start_location.lat(),
          lng: step.start_location.lng(),
        },
        // Suffix sums filled in by the reverse pass below.
        remainingDistanceM: 0,
        remainingDurationS: 0,
      });
    }
  }
  // Reverse pass — compute the "everything after this step" totals
  // once at route load time. computeSnapshot uses these as O(1)
  // lookups instead of summing through the tail of the array on
  // every position tick.
  let suffixDist = 0;
  let suffixDur = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    out[i].remainingDistanceM = suffixDist;
    out[i].remainingDurationS = suffixDur;
    suffixDist += out[i].distanceM;
    suffixDur += out[i].durationS;
  }
  return out;
}

/** Haversine distance between two points in meters. We avoid pulling
 *  in google.maps.geometry.spherical because that requires the maps
 *  library to be loaded and we want this module to be importable from
 *  contexts where it isn't. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000; // earth radius, meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Compute the NavSnapshot given the flattened steps, the driver's
 * current position, and the index of the step the driver is currently
 * approaching. Caller is responsible for incrementing
 * `currentStepIndex` over time — see {@link advanceStepIndex}.
 */
export function computeSnapshot(
  steps: FlatStep[],
  currentStepIndex: number,
  position: { lat: number; lng: number } | null,
): NavSnapshot {
  if (steps.length === 0 || !position) {
    return {
      currentStep: null,
      nextStep: null,
      distanceToManeuverM: null,
      totalRemainingM: 0,
      totalRemainingS: 0,
      arriving: false,
    };
  }

  const safeIdx = Math.min(currentStepIndex, steps.length - 1);
  const currentStep = steps[safeIdx];
  const nextStep =
    safeIdx + 1 < steps.length ? steps[safeIdx + 1] : null;

  const distanceToManeuverM = distanceMeters(position, currentStep.end);

  // Total remaining = distance-to-next-maneuver + precomputed
  // suffix-sum of all subsequent steps. O(1) instead of looping
  // through the route tail every position tick.
  const totalRemainingM = distanceToManeuverM + currentStep.remainingDistanceM;
  // Proportional duration for the current step (rough — assumes
  // average speed across the step). Better than nothing.
  const currentPortionS =
    currentStep.distanceM > 0
      ? currentStep.durationS *
        Math.min(1, distanceToManeuverM / currentStep.distanceM)
      : 0;
  const totalRemainingS = currentPortionS + currentStep.remainingDurationS;

  const arriving =
    safeIdx === steps.length - 1 &&
    distanceToManeuverM <= ARRIVING_THRESHOLD_M;

  return {
    currentStep,
    nextStep,
    distanceToManeuverM,
    totalRemainingM,
    totalRemainingS,
    arriving,
  };
}

/**
 * Given a current step index + the driver's position, decide whether
 * to advance to the next step. Caller passes back the updated index.
 * Idempotent — call as often as you want.
 */
export function advanceStepIndex(
  steps: FlatStep[],
  currentStepIndex: number,
  position: { lat: number; lng: number },
): number {
  if (steps.length === 0) return 0;
  let idx = Math.min(currentStepIndex, steps.length - 1);
  // Loop in case multiple short steps are all behind us — GPS at 5s
  // cadence might skip past more than one (e.g. quick zig-zag onto a
  // ramp). Cap iterations to step count to avoid runaway.
  for (let i = 0; i < steps.length; i++) {
    const step = steps[idx];
    if (distanceMeters(position, step.end) > NEXT_STEP_THRESHOLD_M) break;
    if (idx >= steps.length - 1) break;
    idx += 1;
  }
  return idx;
}

/**
 * Format meters → display string (e.g. "850 m", "1.2 km").
 * Rounds aggressively at far distances so the banner doesn't flicker
 * digits ("203 m", "201 m", "199 m") every position update.
 */
export function formatDistance(m: number | null): string {
  if (m == null) return "";
  if (m < 50) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** Format seconds → display string ("3 min", "1 h 12 min"). */
export function formatDuration(s: number | null): string {
  if (s == null || s <= 0) return "—";
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
}

/** Format an ISO-now-plus-seconds → wall clock ETA string (e.g.
 *  "5:08 PM"). Honors the user's locale via toLocaleTimeString. */
export function formatEta(totalRemainingS: number): string {
  const now = new Date();
  const eta = new Date(now.getTime() + Math.max(0, totalRemainingS) * 1000);
  return eta.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Translate Google's `maneuver` enum into a single short verb suitable
 * for the icon name on the banner. Returns "straight" for unknown values
 * so the consumer can always render *some* icon.
 *
 * Google maneuver values:
 *   turn-slight-left, turn-sharp-left, turn-left, turn-slight-right,
 *   turn-sharp-right, turn-right, keep-left, keep-right, uturn-left,
 *   uturn-right, merge, fork-left, fork-right, ferry, ferry-train,
 *   roundabout-left, roundabout-right, straight, ramp-left,
 *   ramp-right, depart, arrive, arrive-left, arrive-right.
 */
export function maneuverToIcon(maneuver: string): NavIcon {
  switch (maneuver) {
    case "turn-left":
    case "turn-slight-left":
    case "ramp-left":
    case "fork-left":
    case "keep-left":
      return "left";
    case "turn-sharp-left":
      return "sharp-left";
    case "turn-right":
    case "turn-slight-right":
    case "ramp-right":
    case "fork-right":
    case "keep-right":
      return "right";
    case "turn-sharp-right":
      return "sharp-right";
    case "uturn-left":
    case "uturn-right":
      return "uturn";
    case "roundabout-left":
    case "roundabout-right":
      return "roundabout";
    case "merge":
      return "merge";
    case "arrive":
    case "arrive-left":
    case "arrive-right":
      return "arrive";
    default:
      return "straight";
  }
}

export type NavIcon =
  | "straight"
  | "left"
  | "right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "roundabout"
  | "merge"
  | "arrive";
