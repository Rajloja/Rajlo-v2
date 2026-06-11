"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRidePosition, type LivePosition } from "@/lib/use-ride-position";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { acquireScreenWake, releaseScreenWake } from "@/lib/native-call";

/**
 * Global driver active-trip position broadcaster.
 *
 * Background: `useRidePosition(rideId, "driver", streamSelf=true)` used
 * to be called inside the `/driver/active-trip` page. That meant the
 * driver's GPS only broadcast to the rider while the driver was
 * *looking* at the active-trip tab — the moment they switched to
 * Wallet, Earnings, Settings, anywhere else, the hook unmounted and
 * the rider's "where's my driver?" view froze. Reproducible 100% of
 * the time and a direct attack on Rajlo's transparency promise.
 *
 * Fix: this provider lives at the driver-portal layout level (one tier
 * above every page). It polls `/api/driver/rides/active` to know the
 * current ride id, subscribes to Supabase Realtime so a status flip
 * (accepted → arrived → in_progress → completed) updates instantly,
 * and mounts `useRidePosition` with the active ride id. The hook then
 * keeps GPS flowing for the entire life of the trip regardless of
 * which page the driver is on.
 *
 * Anywhere in the driver portal that needs the position data reads it
 * via the `useActiveTripPosition` hook — no more per-page
 * `useRidePosition` calls (that would create duplicate channel
 * subscriptions + duplicate `watchPosition` watchers and burn the
 * driver's battery).
 *
 * Renders nothing visible.
 */

type Ctx = {
  /** Current active ride id, or null when there's no live trip. */
  activeRideId: string | null;
  /** Driver's own latest broadcast position. */
  driverPosition: LivePosition | null;
  /** Rider's latest broadcast position. */
  riderPosition: LivePosition | null;
  /** Geolocation error surfaced to the UI ("location denied", etc). */
  geoError: string | null;
};

const ActiveTripPositionContext = createContext<Ctx>({
  activeRideId: null,
  driverPosition: null,
  riderPosition: null,
  geoError: null,
});

export function ActiveTripPositionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  /** Re-read the rider's active ride from the API. Cheap call; the
   *  endpoint already has its own caching on the driver side. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/rides/active", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = (await res.json()) as { ride?: { id: string } | null };
      setActiveRideId(j.ride?.id ?? null);
    } catch {
      /* swallow — we'll get the next poll tick or Realtime event */
    }
  }, []);

  /* ── 1. Bootstrap + low-frequency safety poll ──
     The Realtime subscription below is the fast path; this 60s poll
     is the resilience layer for the rare WebSocket-dropped case. The
     hook also re-checks on visibilitychange so a tab returning from
     background gets the freshest state immediately. */
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 60_000);
    const onVis = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  /* ── 2. Realtime — instant updates on ride state changes ──
     We listen on the `rides` table for any row whose driver_id is the
     current signed-in driver. INSERT (new request accepted), UPDATE
     (status flip from accepted → arrived → in_progress → completed),
     DELETE (rare) all trigger a re-read. We don't try to read the row
     payload directly — `refresh()` re-asks the API which already does
     the proper status filtering, so we don't have to mirror that
     logic here. */
  useEffect(() => {
    let driverUserId: string | null = null;
    let channel: ReturnType<
      ReturnType<typeof createSupabaseBrowserClient>["channel"]
    > | null = null;

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      driverUserId = user.id;

      // Resolve the auth user to the drivers.id since the rides table's
      // driver_id column points at drivers.id, not auth.users.id.
      const { data: driverRow } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", driverUserId)
        .maybeSingle();
      const driverId = (driverRow as { id?: string } | null)?.id;
      if (!driverId) return;

      channel = supabase
        .channel(`driver-active-trip:${driverId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rides",
            filter: `driver_id=eq.${driverId}`,
          },
          () => void refresh(),
        )
        .subscribe();
    })();

    return () => {
      if (channel) {
        const supabase = createSupabaseBrowserClient();
        void supabase.removeChannel(channel);
      }
    };
  }, [refresh]);

  /* ── 3. Screen-wake lock for the trip duration ──
     Even with the foreground service from
     @capacitor-community/background-geolocation firing GPS natively,
     Android pauses the WebView's JS thread when the screen is off —
     so the native onFix callback can't reach our Supabase broadcast
     and the rider sees the driver's car freeze. Holding KeepAwake
     for the entire trip pins the WebView alive so the broadcast
     loop keeps running. Released the moment the trip ends.
     Ref-counted under "active-trip" so a concurrent in-app call
     (which holds the lock under "default") doesn't fight us. */
  useEffect(() => {
    if (!activeRideId) return;
    void acquireScreenWake("active-trip");
    return () => {
      void releaseScreenWake("active-trip");
    };
  }, [activeRideId]);

  /* ── 4. The actual broadcaster ──
     This is the SINGLE place in the driver app that calls
     `useRidePosition(_, "driver", streamSelf=true)`. The hook itself
     unmounts cleanly when activeRideId flips to null (trip ended), so
     after a completion the GPS watcher and Supabase channel both
     wind down and the driver's battery stops paying for live tracking
     until the next ride. */
  const { driverPosition, riderPosition, geoError } = useRidePosition(
    activeRideId,
    "driver",
    /* streamSelf */ true,
  );

  return (
    <ActiveTripPositionContext.Provider
      value={{ activeRideId, driverPosition, riderPosition, geoError }}
    >
      {children}
    </ActiveTripPositionContext.Provider>
  );
}

/** Consumer hook. Read the live driver/rider positions anywhere
 *  inside the driver portal without spinning up a second
 *  `useRidePosition` call. */
export function useActiveTripPosition(): Ctx {
  return useContext(ActiveTripPositionContext);
}
