"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useActiveCall } from "./active-call-provider";

/**
 * Tap-to-call button. Hands off to <ActiveCallProvider> for the
 * actual sheet + room — keeps the in-call UI alive across page
 * navigation.
 *
 * The button hits POST /api/calls/start with the trip context
 * (rideId / hailId / journeyId), then pushes the returned token +
 * room into the global active-call context. The provider renders
 * the InCallSheet from there.
 *
 * Use exactly one of `rideId`, `hailId`, or `journeyId`. The backend
 * resolves the other party and the correct push target from there.
 */

type CallButtonProps = {
  rideId?: string;
  hailId?: string;
  journeyId?: string;
  /** Label shown on the button. Defaults to "Call". */
  label?: string;
  /** "primary" (filled red) for prominent placement, "subtle" (border
   *  only) for inline use next to other actions. */
  variant?: "primary" | "subtle";
  className?: string;
};

export function CallButton({
  rideId,
  hailId,
  journeyId,
  label = "Call",
  variant = "subtle",
  className = "",
}: CallButtonProps) {
  const { active, setActive } = useActiveCall();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId, hailId, journeyId }),
      });
      const json = (await res.json()) as
        | {
            call: {
              id: string;
              roomName: string;
              calleeDisplayName: string;
            };
            token: string;
            livekitUrl: string;
          }
        | { error: string; message?: string };
      if (!res.ok || "error" in json) {
        setError(
          ("message" in json && json.message) ||
            ("error" in json && json.error) ||
            "Couldn't start the call.",
        );
        return;
      }
      // Push into the global context — the provider renders the
      // sheet. We don't mount anything locally so navigation away
      // from THIS button doesn't kill the call.
      setActive({
        id: json.call.id,
        roomName: json.call.roomName,
        token: json.token,
        livekitUrl: json.livekitUrl,
        otherPartyName: json.call.calleeDisplayName,
        weAreCaller: true,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error starting call.",
      );
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={starting || active !== null}
        className={
          variant === "primary"
            ? `inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/30 transition-all hover:bg-primary-hover disabled:opacity-50 ${className}`
            : `inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-foreground transition-all hover:border-rajlo-red/40 hover:text-rajlo-red disabled:opacity-50 ${className}`
        }
        title="Place a voice call to the other party"
      >
        <Icon name="phone" className="h-4 w-4" />
        {starting ? "Calling…" : label}
      </button>
      {error && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {error}
        </p>
      )}
    </>
  );
}
