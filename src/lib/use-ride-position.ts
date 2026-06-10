"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { isIOS } from "./platform-detect";
import { isNativeApp, startBackgroundGeolocation } from "./native";

export type LivePosition = {
  lat: number;
  lng: number;
  /** Browser-reported heading in degrees, 0–360, or null. */
  heading: number | null;
  /** Browser-reported ground speed in m/s, or null. */
  speed: number | null;
  /** ms since epoch when this fix was reported by the sender. */
  ts: number;
};

type Role = "driver" | "rider";

/**
 * Subscribe to a ride's live position channel + (optionally) stream the
 * caller's own browser position into it.
 *
 * Why broadcast channels instead of a `driver_positions` table?
 *   - 3-5s pings × N concurrent rides would balloon the DB for data
 *     no-one cares about historically.
 *   - Realtime broadcast is ephemeral by design — pings just fan out to
 *     subscribed clients then disappear, which is exactly what live
 *     tracking wants.
 *
 * Shape of the channel:
 *   ride:<rideId>:position
 *     event "driver-position" → { lat, lng, heading, speed, ts }
 *     event "rider-position"  → same shape
 *
 * When `streamSelf` is true, we open `navigator.geolocation.watchPosition`
 * and broadcast every fix on the role-appropriate event. The other party's
 * client sees those pings and updates its map marker.
 *
 * @param rideId          target ride's id (null disables everything)
 * @param role            which side this client is on (driver or rider)
 * @param streamSelf      whether to broadcast our own GPS into the channel
 */
/** Heartbeat tick — the timer fires this often. Whether it actually
 *  broadcasts depends on motion (see STATIONARY_REBROADCAST_MS). */
const HEARTBEAT_MS = 5_000;

/** When the driver is parked / barely moving, we still re-broadcast
 *  the latest fix at this slower cadence so the rider's marker never
 *  goes "stale" in the UI. 15s is well within "is the driver still
 *  there?" tolerance and cuts broadcast volume ~3× for any device
 *  that's not actively moving. Movement-driven broadcasts (handled
 *  inside `handleFix`) fire as fast as GPS updates, so this only
 *  affects the idle case. */
const STATIONARY_REBROADCAST_MS = 15_000;

/** A GPS fix below this ground-speed is treated as "not moving" for
 *  heartbeat-gating purposes. ~2 m/s is a brisk walk; anything below
 *  that is effectively a parked vehicle and doesn't need 5s pings. */
const STATIONARY_SPEED_MPS = 2;

/** Server-cache cadence — driver posts their position to the rides
 *  row at this interval so admin / officer / refreshed-rider tabs
 *  see the car instantly on first paint instead of waiting for the
 *  next Realtime ping. Lower frequency than the broadcast heartbeat
 *  (which is essentially free) since each call is a DB write. */
const SERVER_CACHE_MS = 10_000;

export function useRidePosition(
  rideId: string | null,
  role: Role,
  streamSelf: boolean,
) {
  const [driverPosition, setDriverPosition] = useState<LivePosition | null>(
    null,
  );
  const [riderPosition, setRiderPosition] = useState<LivePosition | null>(
    null,
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  // We hold the most recent coords in a ref so the watchPosition callback
  // can dedupe before sending — saves a roundtrip when the device hasn't
  // actually moved.
  const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);
  // Most recent fix from the browser, regardless of whether it was
  // sent. The heartbeat reads this so it can keep refreshing the
  // rider's marker even when the driver is stationary (no
  // watchPosition callbacks fire).
  const latestFixRef = useRef<LivePosition | null>(null);
  // Wall-clock of the last actual broadcast — drives the stationary
  // re-broadcast gate so we don't ping every 5s for a parked car.
  const lastBroadcastTsRef = useRef(0);
  // Wall-clock of the last server-cache POST — same idea, gates the
  // /api/.../position writes when the car isn't moving.
  const lastServerCacheTsRef = useRef(0);

  useEffect(() => {
    if (!rideId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`ride:${rideId}:position`, {
      // We don't want our own broadcasts echoing back to us.
      config: { broadcast: { self: false } },
    });

    // Inbound — keep both positions in sync regardless of which role we are
    // (the driver sees the rider's pickup hint, the rider sees the driver
    // moving towards them).
    channel
      .on("broadcast", { event: "driver-position" }, ({ payload }) => {
        const p = parsePosition(payload);
        if (p) setDriverPosition(p);
      })
      .on("broadcast", { event: "rider-position" }, ({ payload }) => {
        const p = parsePosition(payload);
        if (p) setRiderPosition(p);
      });

    let watchId: number | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let serverCacheTimer: ReturnType<typeof setInterval> | null = null;
    // Native background-GPS watcher (Capacitor only). Null on web.
    // Disposed alongside the browser watch in the cleanup function so
    // the foreground service / battery drain stops when the trip ends.
    let nativeGeoStop: (() => Promise<void>) | null = null;

    const eventName: "driver-position" | "rider-position" =
      role === "driver" ? "driver-position" : "rider-position";

    /** Send the latest known fix to the channel with a fresh timestamp.
     *  Used both by the heartbeat and inline on each new GPS callback. */
    const broadcastLatest = () => {
      const fix = latestFixRef.current;
      if (!fix) return;
      const payload: LivePosition = { ...fix, ts: Date.now() };
      channel.send({ type: "broadcast", event: eventName, payload });
      lastBroadcastTsRef.current = Date.now();
    };

    /** Heartbeat tick. Movement-driven broadcasts already fire inside
     *  `handleFix` whenever the device actually moves, so the only
     *  job of this tick is to keep a stationary driver's marker fresh
     *  enough that the rider's UI doesn't go "stale". When stationary,
     *  throttle to STATIONARY_REBROADCAST_MS instead of HEARTBEAT_MS.
     *  Cuts broadcast volume ~3× for a parked vehicle and tracks 1:1
     *  with movement when the driver is actually driving. */
    const heartbeatTick = () => {
      const fix = latestFixRef.current;
      if (!fix) return;
      const moving = (fix.speed ?? 0) > STATIONARY_SPEED_MPS;
      const stale =
        Date.now() - lastBroadcastTsRef.current >= STATIONARY_REBROADCAST_MS;
      if (!moving && !stale) return;
      broadcastLatest();
    };

    /** Common handler for either source of GPS fixes (browser
     *  watchPosition OR native background-geolocation). Dedupes, mirrors
     *  to local state, and broadcasts. */
    const handleFix = (next: LivePosition) => {
      latestFixRef.current = next;

      // Mirror into local state so the sender's own marker shows up
      // on their map too.
      if (role === "driver") setDriverPosition(next);
      else setRiderPosition(next);

      // Skip near-duplicate pings (< ~5 m of drift). The heartbeat
      // below still keeps the marker fresh.
      const last = lastSentRef.current;
      if (
        last &&
        Math.abs(last.lat - next.lat) < 0.00005 &&
        Math.abs(last.lng - next.lng) < 0.00005
      ) {
        return;
      }
      lastSentRef.current = { lat: next.lat, lng: next.lng };
      broadcastLatest();
    };

    /** Force a fresh broadcast — used by the recovery listeners when
     *  the browser reports the device is online again or when the
     *  page returns to the foreground. Without this, the channel can
     *  technically be subscribed but no new fix flows to the rider
     *  until the next 5-second heartbeat tick — that gap is visible
     *  on the map as a "stuck" marker. */
    const forceRebroadcast = () => {
      const fix = latestFixRef.current;
      if (!fix) return;
      const payload: LivePosition = { ...fix, ts: Date.now() };
      channel.send({ type: "broadcast", event: eventName, payload });
    };

    /** Re-establish the realtime channel after a network drop. The
     *  Supabase JS client auto-reconnects the WebSocket but the
     *  individual channel subscription doesn't always re-arm. Calling
     *  `subscribe()` on an already-subscribed channel is a no-op, but
     *  on a dropped channel it kicks off a fresh JOIN frame which is
     *  what we want. */
    const onNetworkRestored = () => {
      // Trigger Supabase to reconcile the channel state, then
      // immediately broadcast our latest fix so the rider's marker
      // jumps to current location instead of waiting for the next
      // heartbeat.
      try {
        channel.subscribe();
      } catch {
        /* already subscribed — fine */
      }
      forceRebroadcast();
    };

    const onVisibilityChange = () => {
      if (!document.hidden) onNetworkRestored();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onNetworkRestored);
      // Page visibility — also fires when the user returns to the
      // app from another app on mobile. Web users get this when they
      // come back to the tab.
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (!streamSelf) return;

      // When running inside the Capacitor driver shell, use the native
      // background-geolocation plugin instead of navigator.geolocation —
      // browsers pause `watchPosition` the moment the screen locks,
      // which is exactly when drivers most need to keep streaming.
      // Falls back to browser geolocation if the plugin fails to start
      // (e.g., permission denied — we still want partial coverage).
      if (isNativeApp() && role === "driver") {
        void startBackgroundGeolocation((p) => {
          handleFix({
            lat: p.lat,
            lng: p.lng,
            heading: p.heading,
            speed: p.speed,
            ts: p.ts,
          });
        }).then((stop) => {
          nativeGeoStop = stop;
          // If the plugin returned null (permission denied / unsupported)
          // fall back to the browser watcher so the driver still has
          // coverage while the app is foregrounded.
          if (!stop) startBrowserWatcher();
        });
      } else {
        startBrowserWatcher();
      }

      // Heartbeat + server-cache timers are independent of which GPS
      // source we used — they just re-broadcast / cache the latest fix.
      // Both are motion-gated: a stationary device only fires them at
      // the slower stationary cadence.
      heartbeatTimer = setInterval(heartbeatTick, HEARTBEAT_MS);

      if (role === "driver") {
        const pushToServer = () => {
          const fix = latestFixRef.current;
          if (!fix) return;
          // Skip the DB write if the car hasn't moved AND we wrote
          // recently — the cached row is still accurate, no point
          // burning a write to re-store the same lat/lng.
          const moving = (fix.speed ?? 0) > STATIONARY_SPEED_MPS;
          const stale =
            Date.now() - lastServerCacheTsRef.current >=
            STATIONARY_REBROADCAST_MS;
          if (!moving && !stale) return;
          lastServerCacheTsRef.current = Date.now();
          void fetch(`/api/driver/rides/${rideId}/position`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: fix.lat, lng: fix.lng }),
          }).catch(() => null);
        };
        serverCacheTimer = setInterval(pushToServer, SERVER_CACHE_MS);
      }
    });

    function startBrowserWatcher() {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setGeoError("Your browser doesn't support live location.");
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          handleFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading:
              typeof pos.coords.heading === "number" &&
              !Number.isNaN(pos.coords.heading)
                ? pos.coords.heading
                : null,
            speed:
              typeof pos.coords.speed === "number" &&
              !Number.isNaN(pos.coords.speed)
                ? pos.coords.speed
                : null,
            ts: Date.now(),
          });
        },
        (err) => {
          // Code 1 = denied, 2 = unavailable, 3 = timeout. iOS users
          // see the denied case most often and the fix is buried in
          // their iOS Settings, not in Safari — give them the path.
          setGeoError(buildGeoErrorMessage(err.code));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5_000,
          timeout: 15_000,
        },
      );
    }

    return () => {
      if (watchId !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId);
      }
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (serverCacheTimer) clearInterval(serverCacheTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onNetworkRestored);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      // Stop the native background-geolocation watcher (Android
      // foreground service goes away with it). Fire-and-forget — by
      // the time the cleanup runs the trip is over, nothing else to do.
      if (nativeGeoStop) void nativeGeoStop();
      supabase.removeChannel(channel);
      latestFixRef.current = null;
      lastSentRef.current = null;
      // Reset positions on teardown so a new ride doesn't briefly inherit
      // stale markers from the previous one. Cleanup is the safe spot to
      // setState — putting these resets in the effect body itself triggers
      // the cascading-render warning React 19's lint rules surface.
      setDriverPosition(null);
      setRiderPosition(null);
    };
  }, [rideId, role, streamSelf]);

  return { driverPosition, riderPosition, geoError };
}

/**
 * Translates a GeolocationPositionError code into a user-friendly
 * message. iOS users hit code 1 (denied) most often and the recovery
 * path is non-obvious — the fix is in iOS Settings, not Safari — so
 * we give them the literal Settings menu route.
 */
function buildGeoErrorMessage(code: number): string {
  if (code === 1) {
    if (isIOS()) {
      return "Location is blocked. Open Settings → Privacy & Security → Location Services → Safari Websites → While Using the App, then refresh.";
    }
    return "Location access is blocked. Allow location for Rajlo in your browser's site settings, then refresh.";
  }
  if (code === 2) return "Couldn't determine your location. Try moving outside or to a window.";
  if (code === 3) return "Location request timed out. Try again.";
  return "Live location failed.";
}

function parsePosition(payload: unknown): LivePosition | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    heading: typeof p.heading === "number" ? p.heading : null,
    speed: typeof p.speed === "number" ? p.speed : null,
    ts: typeof p.ts === "number" ? p.ts : Date.now(),
  };
}
