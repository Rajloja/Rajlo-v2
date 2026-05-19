"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";
import {
  DRIVER_PREFETCH_URLS,
  prefetchDriverData,
} from "@/lib/driver-prefetch";

/**
 * One-time warm-up gate for the native driver app.
 *
 * On a cold launch the bottom-nav tabs aren't instant: their route
 * chunks and data caches are still being prefetched for the first
 * few seconds, so tapping a tab in that window feels unresponsive —
 * the screen just doesn't change. This gate holds a branded loader
 * over the portal until the tab route chunks AND the common data
 * endpoints are warm, then lifts. From that point every tab tap
 * lands instantly on cached data instead of a cold fetch.
 *
 * Runs ONCE per app launch — a module-scoped flag means navigating
 * around the portal (or this component remounting) never re-gates.
 * Native app only: on the web the sidebar nav doesn't have the
 * cold-tab problem, and a blocking loader there would be wrong.
 */

// The five bottom-nav destinations whose route chunks we warm.
const TAB_ROUTES = [
  "/driver",
  "/driver/active-trip",
  "/driver/earnings",
  "/driver/history",
  "/driver/profile",
];

// Safety cap — the loader lifts after this even if the network is
// slow, so a bad connection can never trap the driver behind it.
const MAX_WAIT_MS = 8000;

// Survives remounts for the lifetime of the WebView, so the gate
// shows once per app launch and never again mid-session.
let warmedUp = false;

export function DriverWarmupGate() {
  const router = useRouter();
  // SSR-safe native detection (false on the server, real value on the
  // client) via useSyncExternalStore — avoids React 19's
  // setState-in-effect lint.
  const native = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );
  const [warmDone, setWarmDone] = useState(warmedUp);

  useEffect(() => {
    if (!native || warmedUp) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      warmedUp = true;
      setWarmDone(true);
    };

    // Warm the route chunks for every bottom-nav tab.
    for (const route of TAB_ROUTES) {
      try {
        router.prefetch(route);
      } catch {
        /* prefetch is best-effort */
      }
    }
    // Warm every common data endpoint; lift the gate once they land.
    void Promise.all(
      DRIVER_PREFETCH_URLS.map((u) => prefetchDriverData(u).catch(() => null)),
    ).then(finish);
    // Hard cap so a slow network never traps the driver behind the gate.
    const timer = setTimeout(finish, MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [native, router]);

  if (!native || warmDone) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-rajlo-red text-white">
      <p className="text-4xl font-extrabold tracking-tight">
        Rajl<span className="text-rajlo-black">o</span> Driver
      </p>
      <div className="mt-7 h-8 w-8 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
      <p className="mt-5 text-sm font-medium text-white/80">
        Getting things ready&hellip;
      </p>
    </div>
  );
}
