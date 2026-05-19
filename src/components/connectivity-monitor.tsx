"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { getCachedDriverData } from "@/lib/driver-prefetch";

/**
 * In-app connectivity monitor for the driver portal.
 *
 * Capacitor's `errorPath` offline screen only fires when the WebView
 * fails to LOAD a page. A driver already sitting on a loaded page who
 * switches off mobile data sees nothing — no navigation, no error.
 * This component closes that gap: it watches the live online/offline
 * state and covers the app with an offline screen the moment the
 * connection drops, until it is restored.
 *
 * Trip-aware: a driver MUST stay connected during an active trip —
 * their live location feeds the rider's map and the safety system.
 * If the connection drops mid-trip the screen escalates to an urgent
 * violation warning, and once the connection is restored a sustained
 * outage is reported to /api/driver/violations/report so the safety
 * team has it on record.
 */

const ACTIVE_RIDE_URL = "/api/driver/rides/active";
const ACTIVE_STATUSES = new Set(["accepted", "arrived", "in_progress"]);
// A connection blip shorter than this isn't worth a violation record —
// a momentary cell handover shouldn't go on a driver's file.
const MIN_VIOLATION_OUTAGE_MS = 10_000;

type CachedActive = { ride?: { id?: string; status?: string } | null } | null;

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Last-known active trip, read from the prefetch cache. The cache
 *  survives going offline, so this still answers correctly after the
 *  connection has already dropped. */
function activeTrip(): { rideId: string | null } | null {
  const cached = getCachedDriverData<CachedActive>(ACTIVE_RIDE_URL);
  const ride = cached?.ride;
  if (
    ride &&
    typeof ride.status === "string" &&
    ACTIVE_STATUSES.has(ride.status)
  ) {
    return { rideId: typeof ride.id === "string" ? ride.id : null };
  }
  return null;
}

export function ConnectivityMonitor() {
  const online = useSyncExternalStore(
    subscribe,
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    () => true,
  );

  const offlineSinceRef = useRef<number | null>(null);
  const offlineTripRef = useRef<{ rideId: string | null } | null>(null);

  useEffect(() => {
    if (!online) {
      // Connection just dropped — snapshot when, and whether a trip
      // was in flight at that moment.
      if (offlineSinceRef.current === null) {
        offlineSinceRef.current = Date.now();
        offlineTripRef.current = activeTrip();
        if (offlineTripRef.current) {
          // Buzz the phone — a driver mid-trip must notice the drop
          // even with the phone mounted or pocketed.
          try {
            navigator.vibrate?.([200, 100, 200, 100, 400]);
          } catch {
            /* vibrate unsupported — ignore */
          }
        }
      }
      return;
    }
    // Back online — if the driver was on a trip and the outage was
    // sustained, put it on record. The report endpoint dedups per
    // kind in a 5-minute window so flapping signal won't spam it.
    const since = offlineSinceRef.current;
    const trip = offlineTripRef.current;
    offlineSinceRef.current = null;
    offlineTripRef.current = null;
    if (since !== null && trip) {
      const downMs = Date.now() - since;
      if (downMs >= MIN_VIOLATION_OUTAGE_MS) {
        void fetch("/api/driver/violations/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "offline_mid_trip",
            rideId: trip.rideId,
            details: `Device offline for ${Math.round(
              downMs / 1000,
            )}s during an active trip`,
          }),
        }).catch(() => null);
      }
    }
  }, [online]);

  if (online) return null;

  const urgent = activeTrip() !== null;

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center px-7 text-center text-white"
      style={{ backgroundColor: urgent ? "#b00d0c" : "#f10100" }}
      role="alertdialog"
      aria-modal="true"
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
          aria-hidden
        >
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </span>

      {urgent ? (
        <>
          <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/80">
            Trip in progress
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold leading-tight">
            You&rsquo;re offline during a trip
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/90">
            Your rider can no longer see your location and live tracking
            has stopped. Restore your internet connection{" "}
            <strong>immediately</strong>.
          </p>
          <p className="mt-3 max-w-sm rounded-xl bg-black/20 px-4 py-2.5 text-xs leading-relaxed text-white/90">
            Driving with your connection off during a trip is a policy
            violation and is recorded for the Rajlo safety team.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-5 text-2xl font-extrabold leading-tight">
            No internet connection
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/90">
            Rajlo Driver needs an internet connection to work. Turn your
            mobile data or Wi-Fi back on — this screen clears
            automatically once you&rsquo;re reconnected.
          </p>
        </>
      )}

      <div className="mt-7 flex items-center gap-2.5 text-sm font-semibold text-white/85">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        Waiting for connection&hellip;
      </div>
    </div>
  );
}
