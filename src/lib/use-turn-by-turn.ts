"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  advanceStepIndex,
  computeSnapshot,
  flattenSteps,
  type FlatStep,
  type NavSnapshot,
} from "./turn-by-turn";
import * as voice from "./nav-voice";

/**
 * React hook driving the in-app turn-by-turn experience.
 *
 * Wires three inputs:
 *   - A Google DirectionsRoute (refetched by MapView when the driver
 *     moves far enough or the target changes)
 *   - The driver's live position (5s cadence from useRidePosition)
 *   - An enabled flag (typically: ride is accepted/in_progress AND
 *     we have a driver position fix)
 *
 * Returns a NavSnapshot describing what the banner should show, and
 * fires voice prompts at the right distance triggers as the driver
 * approaches each maneuver.
 *
 * Voice trigger schedule (per step, fires at most once each):
 *   - "far":       when distance first drops below max(stepDistance, 400m).
 *                  Phrasing: "In 300 meters, turn right onto Hope Road".
 *   - "imminent":  when distance drops below 50m.
 *                  Phrasing: "Now turn right onto Hope Road".
 *   - "arrived":   when the final step's end is within 30m.
 *                  Phrasing: "You have arrived at the pickup point".
 *
 * Triggers are tracked per stepIndex in a ref so re-renders don't
 * re-fire them.
 */

type Options = {
  route: google.maps.DirectionsRoute | null;
  /** Driver's current GPS position. We only consume lat/lng for the
   *  step-tracking math; heading isn't needed here (the map view
   *  handles map-rotation itself). */
  position: { lat: number; lng: number } | null;
  enabled: boolean;
  /** What the driver is heading toward — flavour the "arriving" prompt
   *  so it says "pickup point" or "drop-off" instead of generic. */
  target: "pickup" | "dropoff";
};

/** Per-step trigger flags. */
type Fired = {
  far: boolean;
  imminent: boolean;
};

export function useTurnByTurn({
  route,
  position,
  enabled,
  target,
}: Options): NavSnapshot {
  // Flatten the steps once per route. Memoised on route identity so
  // we don't re-walk the legs on every position update.
  const steps: FlatStep[] = useMemo(
    () => (route ? flattenSteps(route) : []),
    [route],
  );

  const [stepIndex, setStepIndex] = useState(0);

  // Reset stepIndex + voice trigger registry when the route changes
  // (typically: driver→pickup polyline switches to driver→dropoff
  // after they pick the rider up). Without this we'd resume mid-way
  // through the old step list and play the wrong voice prompts.
  const lastRouteRef = useRef<google.maps.DirectionsRoute | null>(null);
  const firedRef = useRef<Map<number, Fired>>(new Map());
  const arrivedSpokenRef = useRef(false);
  useEffect(() => {
    if (lastRouteRef.current === route) return;
    lastRouteRef.current = route;
    setStepIndex(0);
    firedRef.current.clear();
    arrivedSpokenRef.current = false;
  }, [route]);

  // Advance the step index as the driver gets within range of each
  // maneuver. Runs on every position update.
  useEffect(() => {
    if (!enabled || !position || steps.length === 0) return;
    const next = advanceStepIndex(steps, stepIndex, position);
    if (next !== stepIndex) setStepIndex(next);
  }, [enabled, position, steps, stepIndex]);

  const snapshot = useMemo<NavSnapshot>(
    () =>
      computeSnapshot(
        steps,
        stepIndex,
        position ? { lat: position.lat, lng: position.lng } : null,
      ),
    [steps, stepIndex, position],
  );

  // Voice prompts. Fires inside an effect (not during render) so the
  // hook stays pure for React's concurrent rendering. Skip entirely
  // when disabled or no current step.
  useEffect(() => {
    if (!enabled) return;
    const step = snapshot.currentStep;
    const dist = snapshot.distanceToManeuverM;
    if (!step || dist == null) return;

    const fired = firedRef.current.get(step.index) ?? {
      far: false,
      imminent: false,
    };

    // Far announcement — only fire if there's enough runway to even
    // make sense (don't say "in 250m turn right" when the step is
    // 80m long; the imminent trigger will handle it).
    const farThreshold = Math.min(Math.max(step.distanceM * 0.6, 100), 400);
    if (!fired.far && step.distanceM > 150 && dist <= farThreshold && dist > 50) {
      voice.speak(buildPrompt(step, "far", dist));
      fired.far = true;
    }

    if (!fired.imminent && dist <= 50) {
      voice.speak(buildPrompt(step, "imminent"));
      fired.imminent = true;
    }

    firedRef.current.set(step.index, fired);
  }, [enabled, snapshot]);

  // "Arrived" prompt — fires once when the final step is within range.
  useEffect(() => {
    if (!enabled) return;
    if (!snapshot.arriving) return;
    if (arrivedSpokenRef.current) return;
    arrivedSpokenRef.current = true;
    voice.speak(
      target === "pickup"
        ? "You have arrived at the pickup point."
        : "You have arrived at the drop-off.",
    );
  }, [enabled, snapshot.arriving, target]);

  return snapshot;
}

/** Compose a natural-language prompt for the given step + phase. */
function buildPrompt(
  step: FlatStep,
  phase: "far" | "imminent",
  distanceM?: number,
): string {
  // Use Google's instruction text directly — it's already
  // natural-language and includes the road name. We strip the
  // tail "toward X" hint in the imminent case to keep it terse.
  let instruction = step.instruction.replace(/\.+$/, "");
  if (phase === "imminent") {
    // Trim "toward …" tail — at 50m the driver doesn't need the
    // verbose form.
    instruction = instruction.replace(/\s+toward\s+.+$/i, "");
  }

  if (phase === "far" && distanceM != null) {
    // Round to nearest 50m for natural-sounding distances.
    const rounded = Math.max(50, Math.round(distanceM / 50) * 50);
    return `In ${rounded} meters, ${lowercaseFirst(instruction)}.`;
  }
  return `${instruction}.`;
}

function lowercaseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
