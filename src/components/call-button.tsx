"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  // Gate the portal call so it only fires on the client — createPortal
  // reads document.body which doesn't exist during SSR.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

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
      {/* Error toast — rendered through a body-portal at z-[110] so it
          sits above the chat sheet (z-70) and the in-call sheet (z-100).
          The previous inline paragraph was placed inside the chat
          header's flex row, where it got clipped by the fixed-height
          black bar and the caller never saw why the call didn't
          connect (voice_calls_unavailable, trip_not_callable, etc.).
          A top-of-viewport pill guarantees visibility regardless of
          where CallButton is embedded. */}
      {portalReady &&
        error &&
        createPortal(
          <div
            role="alert"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 top-4 z-[110] flex justify-center px-4"
          >
            <div className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border border-rajlo-red/30 bg-white px-4 py-3 text-sm shadow-2xl ring-1 ring-black/5">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-rajlo-red">
                <Icon name="phone-off" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">
                  Couldn&rsquo;t start the call
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-soft hover:text-foreground"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
