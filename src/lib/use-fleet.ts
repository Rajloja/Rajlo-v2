"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { isIOS } from "./platform-detect";
import { isNativeApp, startBackgroundGeolocation } from "./native";

/**
 * Driver-facing version of the geolocation error mapper. Same iOS
 * Settings path advice as `use-ride-position.ts` but worded for the
 * driver context (they need GPS to be visible on the rider's map).
 */
function driverGeoErrorMessage(code: number): string {
  if (code === 1) {
    if (isIOS()) {
      return "Location is blocked. On iPhone, open Settings → Privacy & Security → Location Services → Safari Websites → While Using the App, then refresh and toggle online again.";
    }
    return "Location access is blocked — allow location for Rajlo in your browser's site settings, then toggle online again.";
  }
  if (code === 2) return "Couldn't determine your location. Try moving outside or to a window.";
  if (code === 3) return "Location request timed out. Try again.";
  return "Live location failed.";
}

/**
 * Fleet visibility — the "see nearby drivers on the booking screen" feature.
 *
 * Architecture (mirrors `use-ride-position.ts`):
 *   - Drivers who toggle online broadcast their position to a single global
 *     Supabase Realtime channel: `fleet:online`. No DB writes — broadcast
 *     fan-out is ephemeral by design.
 *   - Riders on the booking screen subscribe to that channel, maintain a
 *     Map<driverId, position>, prune entries whose last ping is older than
 *     STALE_AFTER_MS, and render a car icon for each remaining one.
 *
 * Why one global channel? Jamaica has a few thousand active drivers tops at
 * MVP scale — totally fine. Once we cross ~1k concurrent drivers, shard by
 * parish (e.g. `fleet:online:kingston`) so each rider only subscribes to
 * the slice of the country they care about.
 *
 * Privacy: we send `driverId` (UUID, not name) so subscribers can dedupe a
 * driver's pings into a single moving marker. Riders don't see who the
 * driver is — only that "a driver is here". Once a rider matches with a
 * driver, the rider gets that driver's full profile via the ride record.
 */

const FLEET_CHANNEL = "fleet:online";
const FLEET_EVENT = "driver-position";
/** Explicit "I'm going offline" broadcast — lets subscribers drop the
 *  marker instantly instead of waiting for the staleness sweep. */
const FLEET_OFFLINE_EVENT = "driver-offline";

/** How often a broadcasting driver pushes a new position (in ms). */
const BROADCAST_THROTTLE_MS = 5_000;
/** How often the driver's last-known position is written to the
 *  server-side cache (drivers.last_lat/lng). Slower than the realtime
 *  broadcast — only the new-ride matcher reads it, no live UI. */
const SERVER_POSITION_CACHE_MS = 30_000;
/** Subscribers drop driver markers we haven't heard from in this long.
 *  This is the safety net for cases where the explicit "offline" message
 *  never made it (browser crash, network drop, app force-quit). */
const STALE_AFTER_MS = 20_000;
/** Subscribers run a sweep every this often to prune stale entries. */
const SWEEP_INTERVAL_MS = 5_000;

export type FleetDriver = {
  driverId: string;
  lat: number;
  lng: number;
  /**
   * Heading the car icon should point in (0–360°, 0=north, clockwise).
   *
   * Note: the broadcaster sends `heading` from the browser's
   * `coords.heading`, which is null on most desktops and unreliable on
   * stationary mobile. So in `useFleet` we *override* this with a
   * bearing computed from the driver's actual movement — only when the
   * movement exceeds GPS-noise distance — so the icon always points
   * where the car is going. May be null if we haven't yet seen enough
   * movement to compute a heading.
   */
  heading: number | null;
  /** Last ping time, ms since epoch. */
  ts: number;
};

/** Below this many metres of movement between pings we treat as GPS jitter
 *  and DON'T rotate the icon. Otherwise a parked car would spin around
 *  every 5s as the GPS chip's noise drifts the position by a few meters. */
const MIN_MOVEMENT_METERS = 15;

/** Great-circle distance between two lat/lng pairs (haversine). */
function approxDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial compass bearing from point 1 to point 2 (0–360°, 0=north). */
function computeBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Driver-side hook. When `online` flips true, opens watchPosition and pushes
 * the driver's coords to the global `fleet:online` channel every
 * BROADCAST_THROTTLE_MS. When `online` flips false (or the component
 * unmounts), tears the watch + channel down so no GPS access is left
 * running.
 *
 * @param driverId  the driver's auth.user.id (or null if unauth'd)
 * @param online    whether the driver has toggled themselves online
 */
export function useFleetBroadcaster(driverId: string | null, online: boolean) {
  // Runtime error from the watchPosition callback (denial, timeout, etc).
  // The "browser doesn't support geolocation" message is derived below
  // instead of synced via setState — keeps us out of the cascading-render
  // foot-gun that React 19's lint rules flag.
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const error = useMemo(() => {
    if (!driverId || !online) return null;
    if (typeof navigator !== "undefined" && !("geolocation" in navigator)) {
      return "Your browser doesn't support live location.";
    }
    return runtimeError;
  }, [driverId, online, runtimeError]);

  // Latest fix the browser has given us. Updated on every watchPosition
  // callback (and the initial cached getCurrentPosition). Held in a ref
  // because the heartbeat timer below reads it on a fixed schedule —
  // separated from the browser's "I have new GPS data" callbacks, which
  // only fire when the device actually moves. Without this split, a
  // stationary driver pings once and then falls silent, and the rider's
  // staleness sweep prunes their marker even though they're still online.
  const lastFixRef = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    if (!driverId || !online) return;
    // No geolocation support → derived error above already reflects this.
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(FLEET_CHANNEL, {
      config: { broadcast: { self: false } },
    });

    let watchId: number | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let serverCacheTimer: ReturnType<typeof setInterval> | null = null;
    // Native background-GPS watcher. Only set when running inside the
    // Capacitor driver app; null on the web. Cleaned up alongside the
    // browser watcher so the foreground service / sticky notification
    // disappears when the driver goes offline.
    let nativeGeoStop: (() => Promise<void>) | null = null;

    const broadcastLatest = () => {
      const fix = lastFixRef.current;
      if (!fix) return;
      const payload: FleetDriver = {
        driverId,
        lat: fix.latitude,
        lng: fix.longitude,
        heading:
          typeof fix.heading === "number" && !Number.isNaN(fix.heading)
            ? fix.heading
            : null,
        ts: Date.now(),
      };
      channel.send({
        type: "broadcast",
        event: FLEET_EVENT,
        payload,
      });
    };

    // Server-side position cache push. `drivers.last_position_at` —
    // the value this writes — is the freshness signal that
    // notifyAllAvailableDrivers() filters on when dispatching new
    // rides. If it goes stale the driver silently drops out of
    // dispatch range and stops receiving ride-request pushes.
    //
    // It must therefore keep updating while the app is backgrounded.
    // Android throttles (and eventually freezes) WebView JS timers
    // once the app loses the foreground, so a setInterval alone lets
    // the cache rot within minutes — exactly when an online driver is
    // waiting, screen locked, for a ride. The native background-
    // geolocation callback keeps firing via the foreground service,
    // so we push from every fix (see recordFix) instead. The
    // timestamp guard throttles the actual network call to
    // SERVER_POSITION_CACHE_MS no matter how fast fixes arrive.
    let lastServerPushAt = 0;
    const pushPositionToServer = (force = false) => {
      const fix = lastFixRef.current;
      if (!fix) return;
      const now = Date.now();
      if (!force && now - lastServerPushAt < SERVER_POSITION_CACHE_MS) {
        return;
      }
      lastServerPushAt = now;
      void fetch("/api/driver/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: fix.latitude, lng: fix.longitude }),
      }).catch(() => {
        // Failed POST — clear the throttle so the next fix retries
        // straight away rather than waiting out the full window.
        lastServerPushAt = 0;
      });
    };

    /** Records a position fix from either GPS source. We can't reuse
     *  a single `GeolocationCoordinates` shape because the native
     *  plugin returns `latitude`/`longitude`/`bearing` — slightly
     *  different field names. Normalising into the same ref keeps the
     *  broadcast/heartbeat code source-agnostic. */
    const recordFix = (lat: number, lng: number, heading: number | null) => {
      lastFixRef.current = {
        latitude: lat,
        longitude: lng,
        heading,
        // Fields the broadcast code doesn't read but the type needs.
        altitude: null,
        altitudeAccuracy: null,
        accuracy: 0,
        speed: null,
      } as unknown as GeolocationCoordinates;
      // Keep the server dispatch cache fresh from every fix — this is
      // what survives backgrounding, where the interval below freezes.
      pushPositionToServer();
    };

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;

      // Native (Capacitor driver app) path — the background-geolocation
      // plugin survives screen-lock so the driver's marker stays alive
      // on the rider's map even while their phone is in their pocket.
      // Falls back to the browser watcher if the plugin can't start
      // (permission denied, etc.) so we still get foreground tracking.
      if (isNativeApp()) {
        void startBackgroundGeolocation((p) => {
          recordFix(p.lat, p.lng, p.heading);
        }).then((stop) => {
          nativeGeoStop = stop;
          if (!stop) startBrowserWatch();
          // Fire an immediate broadcast even before the first native
          // fix arrives so the channel is "warm" — riders see the
          // marker as soon as we have any data.
          broadcastLatest();
        });
      } else {
        startBrowserWatch();
      }

      // Heartbeat — every BROADCAST_THROTTLE_MS we re-send the latest
      // known fix regardless of movement. Keeps the rider's marker
      // alive ("still parked" looks the same as "moving slowly" from
      // their staleness sweep's perspective).
      heartbeatTimer = setInterval(broadcastLatest, BROADCAST_THROTTLE_MS);

      // Server-side position cache (drivers.last_position_at) — the
      // freshness signal the new-ride dispatch matcher filters on.
      // The real cadence driver is recordFix, which pushes on every
      // GPS fix (throttled) so the cache stays fresh while the app is
      // backgrounded and WebView JS timers are throttled. This
      // interval is a foreground belt-and-suspenders for a stationary
      // driver whose watcher emits no movement callbacks.
      pushPositionToServer(true);
      serverCacheTimer = setInterval(
        () => pushPositionToServer(),
        SERVER_POSITION_CACHE_MS,
      );
    });

    /** Browser geolocation path — used on the web, or as fallback
     *  inside Capacitor when the native plugin can't start (denied,
     *  Play Services missing, etc.). */
    function startBrowserWatch() {
      // Step 1: prime lastFixRef with cached fix so we can broadcast
      // immediately — typically <200ms vs the 1-3s warm-up of a
      // high-accuracy cold start.
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          recordFix(
            pos.coords.latitude,
            pos.coords.longitude,
            typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
          );
          broadcastLatest();
        },
        () => {
          /* silent — watchPosition will populate shortly */
        },
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: 5_000 },
      );

      // Step 2: keep lastFixRef updated whenever the device moves.
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          recordFix(
            pos.coords.latitude,
            pos.coords.longitude,
            typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
          );
        },
        (err) => {
          setRuntimeError(driverGeoErrorMessage(err.code));
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
      );
    }

    return () => {
      if (watchId !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId);
      }
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (serverCacheTimer) clearInterval(serverCacheTimer);
      // Stop the native background watcher (Android foreground service
      // + sticky notification disappear with it). Fire-and-forget.
      if (nativeGeoStop) void nativeGeoStop();
      // Tell subscribers we're going offline before tearing the channel
      // down. Fire-and-forget — the message goes out on the existing
      // websocket, then removeChannel closes the subscription. If we
      // *don't* do this, the rider's marker for this driver will linger
      // until the staleness sweep prunes it (up to STALE_AFTER_MS later).
      channel.send({
        type: "broadcast",
        event: FLEET_OFFLINE_EVENT,
        payload: { driverId },
      });
      supabase.removeChannel(channel);
      lastFixRef.current = null;
    };
  }, [driverId, online]);

  return { error };
}

/**
 * Rider-side hook. Subscribes to `fleet:online` and returns the current set
 * of recently-seen driver positions as an array. Stale entries (older than
 * STALE_AFTER_MS) are dropped on a periodic sweep so a driver who goes
 * offline doesn't leave a ghost marker behind.
 *
 * `active` is the gate — pass `false` to disable the subscription entirely
 * (e.g. once the rider has submitted a ride, the booking-map fleet view is
 * irrelevant).
 */
export function useFleet(active: boolean): FleetDriver[] {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  // Source-of-truth Map. We keep it in a ref so the sweep timer can mutate
  // it without re-creating the subscription on every state update.
  const driversRef = useRef<Map<string, FleetDriver>>(new Map());

  useEffect(() => {
    if (!active) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(FLEET_CHANNEL, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: FLEET_EVENT }, ({ payload }) => {
        const p = parseFleetPayload(payload);
        if (!p) return;

        // Compute the icon's facing direction from movement instead of
        // trusting the browser-reported heading (which is null on most
        // desktops and unreliable when stationary on mobile).
        //
        // Below MIN_MOVEMENT_METERS we treat the change as GPS jitter
        // and KEEP the previous heading — otherwise a parked car would
        // spin around every heartbeat. On the first ping we have no
        // previous position, so heading stays null and the icon points
        // up until movement is observed.
        const prev = driversRef.current.get(p.driverId);
        let heading = p.heading;
        if (prev) {
          const dist = approxDistanceMeters(prev.lat, prev.lng, p.lat, p.lng);
          if (dist >= MIN_MOVEMENT_METERS) {
            heading = computeBearing(prev.lat, prev.lng, p.lat, p.lng);
          } else {
            // Hold the previous heading so a stationary car keeps facing
            // the way it was last moving. If we have no previous heading
            // either (driver just came online), null is fine — icon
            // renders pointing up.
            heading = prev.heading;
          }
        }

        driversRef.current.set(p.driverId, { ...p, heading });
        setDrivers(Array.from(driversRef.current.values()));
      })
      .on("broadcast", { event: FLEET_OFFLINE_EVENT }, ({ payload }) => {
        // A driver toggled offline — drop their marker immediately rather
        // than waiting for the staleness sweep.
        const driverId =
          payload && typeof payload === "object" && "driverId" in payload
            ? (payload as { driverId?: unknown }).driverId
            : null;
        if (typeof driverId !== "string") return;
        if (driversRef.current.delete(driverId)) {
          setDrivers(Array.from(driversRef.current.values()));
        }
      })
      .subscribe();

    // Periodic prune so offline drivers fade off the map without us needing
    // an explicit "going offline" broadcast (which would be unreliable
    // anyway — drivers close the app, lose signal, etc.).
    const sweepTimer = setInterval(() => {
      const cutoff = Date.now() - STALE_AFTER_MS;
      let mutated = false;
      for (const [id, d] of driversRef.current) {
        if (d.ts < cutoff) {
          driversRef.current.delete(id);
          mutated = true;
        }
      }
      if (mutated) {
        setDrivers(Array.from(driversRef.current.values()));
      }
    }, SWEEP_INTERVAL_MS);

    return () => {
      clearInterval(sweepTimer);
      supabase.removeChannel(channel);
      driversRef.current.clear();
      // Clearing local state belongs in cleanup, not the effect body —
      // setState inside the body itself triggers the cascading-render warning.
      setDrivers([]);
    };
  }, [active]);

  return drivers;
}

function parseFleetPayload(payload: unknown): FleetDriver | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const driverId = typeof p.driverId === "string" ? p.driverId : null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    driverId,
    lat,
    lng,
    heading: typeof p.heading === "number" ? p.heading : null,
    ts: typeof p.ts === "number" ? p.ts : Date.now(),
  };
}
