"use client";

import { useMemo } from "react";
import { MapView } from "@/components/map-view";
import { useRidePosition } from "@/lib/use-ride-position";
import type { Place } from "@/lib/jamaica";

/**
 * Shared live-trip map. Renders pickup (A) → dropoff (B) with the
 * driver's car icon tracking in real time on top.
 *
 * Position sourcing mirrors the live-trips dashboard:
 *   - Subscribes listen-only to the realtime channel
 *     `ride:<rideId>:position` for fresh driver + rider pings.
 *   - Falls back to `cachedDriverPosition` (the last position the
 *     driver app flushed to `rides.driver_last_*`) so first paint
 *     shows a marker instead of an empty map while realtime warms up.
 *
 * Used by both /admin/live-trips (one card per active trip) and
 * /admin/rides/[id] (the single-ride deep dive) so the map behaves
 * identically in both places.
 */

type Pos = { lat: number; lng: number } | null;

export function LiveTripMap({
  rideId,
  pickupName,
  pickupLat,
  pickupLng,
  dropoffName,
  dropoffLat,
  dropoffLng,
  cachedDriverPosition = null,
  active = true,
  className = "h-72 w-full md:h-80",
}: {
  rideId: string;
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
  dropoffName: string;
  dropoffLat: number;
  dropoffLng: number;
  cachedDriverPosition?: Pos;
  /** When false (terminal ride) we don't nag with a "waiting for GPS"
   *  badge — the map just shows the static A→B route. */
  active?: boolean;
  className?: string;
}) {
  // Listen-only realtime subscription. `role` is irrelevant when
  // `streamSelf=false` — we only receive, never broadcast.
  const { driverPosition: liveDriver, riderPosition: liveRider } =
    useRidePosition(rideId, "driver", false);

  const driverPos: Pos = liveDriver
    ? { lat: liveDriver.lat, lng: liveDriver.lng }
    : cachedDriverPosition;
  const riderPos: Pos = liveRider
    ? { lat: liveRider.lat, lng: liveRider.lng }
    : null;

  const pickup: Place = useMemo(
    () => ({
      placeId: `${rideId}-pickup`,
      name: pickupName,
      address: pickupName,
      lat: pickupLat,
      lng: pickupLng,
      parish: null,
    }),
    [rideId, pickupName, pickupLat, pickupLng],
  );
  const dropoff: Place = useMemo(
    () => ({
      placeId: `${rideId}-dropoff`,
      name: dropoffName,
      address: dropoffName,
      lat: dropoffLat,
      lng: dropoffLng,
      parish: null,
    }),
    [rideId, dropoffName, dropoffLat, dropoffLng],
  );

  return (
    <div className="relative">
      <MapView
        pickup={pickup}
        stops={[]}
        dropoff={dropoff}
        driverPosition={driverPos}
        riderPosition={riderPos}
        className={className}
      />
      {active && !driverPos && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-rajlo-black/85 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
          Waiting for driver GPS
        </div>
      )}
    </div>
  );
}
