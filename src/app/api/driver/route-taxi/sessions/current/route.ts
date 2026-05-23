import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { haversineKm } from "@/lib/jamaica";

/**
 * GET /api/driver/route-taxi/sessions/current
 *
 * Returns the driver's currently-active Route Taxi session (if any),
 * the route metadata, the seats counter, and three hail buckets that
 * the driver UI renders:
 *
 *   - pending: hails on this route waiting for a driver to accept
 *               (session_id IS NULL, status = 'requested')
 *   - accepted: hails this driver has accepted but not yet picked up
 *   - onboard:  hails currently riding with this driver
 *
 * `null` session means "show the start-session picker" — clean
 * single-shape contract for the page.
 */
export async function GET() {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, activated, onboarding_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ session: null, driver: null });
  }

  const { data: session } = await supabase
    .from("driver_sessions")
    .select(
      "id, route_id, direction, vehicle_capacity, seats_taken, status, started_at, current_lat, current_lng, last_position_at, pickup_code",
    )
    .eq("driver_id", driver.id)
    .eq("status", "active")
    .maybeSingle();

  if (!session) {
    return NextResponse.json({
      session: null,
      driver: {
        activated: driver.activated,
        onboardingStatus: driver.onboarding_status,
      },
    });
  }

  // Route metadata for the header.
  const { data: route } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, ta_fare_jmd",
    )
    .eq("id", session.route_id)
    .maybeSingle();

  // Pending hails (still unattached) on the same route. We pull the
  // pickup coords too so we can compute proximity to the driver's
  // current GPS and sort closest-first. Riders who declined location
  // share have pickup at (0, 0) and fall to the end of the list.
  const { data: pending } = await supabase
    .from("route_hails")
    .select(
      "id, rider_id, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, distance_km, fare_jmd, concession, requested_at, journey_id, leg_order, is_transfer_leg, boarding_lat, boarding_lng, alighting_lat, alighting_lng",
    )
    .eq("route_id", session.route_id)
    .eq("status", "requested")
    .is("session_id", null)
    .order("requested_at", { ascending: true })
    .limit(20);

  // Hails this driver has accepted but not yet picked up.
  const { data: accepted } = await supabase
    .from("route_hails")
    .select(
      "id, rider_id, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, distance_km, fare_jmd, accepted_at, journey_id, leg_order, is_transfer_leg, boarding_lat, boarding_lng, alighting_lat, alighting_lng",
    )
    .eq("session_id", session.id)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: true });

  // Hails currently onboard.
  const { data: onboard } = await supabase
    .from("route_hails")
    .select(
      "id, rider_id, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, distance_km, fare_jmd, picked_up_at, journey_id, leg_order, is_transfer_leg, boarding_lat, boarding_lng, alighting_lat, alighting_lng",
    )
    .eq("session_id", session.id)
    .eq("status", "picked_up")
    .order("picked_up_at", { ascending: true });

  return NextResponse.json({
    session: {
      id: session.id,
      routeId: session.route_id,
      direction: session.direction,
      vehicleCapacity: session.vehicle_capacity,
      seatsTaken: session.seats_taken,
      seatsRemaining: Math.max(0, session.vehicle_capacity - session.seats_taken),
      status: session.status,
      startedAt: session.started_at,
      currentLat: session.current_lat,
      currentLng: session.current_lng,
      lastPositionAt: session.last_position_at,
      pickupCode:
        (session as { pickup_code?: string | null }).pickup_code ?? null,
      route: route
        ? {
            id: route.id,
            origin: route.origin_name,
            destination: route.destination_name,
            parish: route.origin_parish,
            distanceKm: Number(route.distance_km),
            taFareJmd: route.ta_fare_jmd,
            // Endpoint coords for the driver map's corridor polyline.
            // Null on legacy route rows without the lat/lng backfill —
            // the driver map gracefully falls back to no corridor
            // line in that case.
            originLat: nonZero(
              (route as { origin_lat?: number | null }).origin_lat ?? null,
            ),
            originLng: nonZero(
              (route as { origin_lng?: number | null }).origin_lng ?? null,
            ),
            destinationLat: nonZero(
              (route as { destination_lat?: number | null })
                .destination_lat ?? null,
            ),
            destinationLng: nonZero(
              (route as { destination_lng?: number | null })
                .destination_lng ?? null,
            ),
          }
        : null,
    },
    pending: enrichAndSortPending(pending, session),
    accepted: await attachRiderProfiles(supabase, accepted ?? [], "accepted"),
    onboard: await attachRiderProfiles(supabase, onboard ?? [], "onboard"),
    driver: {
      activated: driver.activated,
      onboardingStatus: driver.onboarding_status,
    },
  });
}

/**
 * `(0, 0)` is our sentinel for "rider declined location share" since
 * the column is NOT NULL. Translate it back to null for the client
 * so the UI can decide whether to render a pin.
 */
function nonZero(n: number | null | undefined): number | null {
  if (n == null) return null;
  return n === 0 ? null : Number(n);
}

/**
 * Bulk-fetch rider profile rows + attach name + avatar to each hail.
 * Drives the rider info card on the driver's monitor (so the driver
 * knows who they're picking up + can recognise them by face).
 */
async function attachRiderProfiles(
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  hails: Array<{
    id: string;
    rider_id: string;
    pickup_name: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
    dropoff_name: string;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
    distance_km: number;
    fare_jmd: number;
    accepted_at?: string;
    picked_up_at?: string;
    journey_id?: string | null;
    leg_order?: number | null;
    is_transfer_leg?: boolean;
    boarding_lat?: number | null;
    boarding_lng?: number | null;
    alighting_lat?: number | null;
    alighting_lng?: number | null;
  }>,
  shape: "accepted" | "onboard",
) {
  if (hails.length === 0) return [];
  const riderIds = Array.from(new Set(hails.map((h) => h.rider_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, phone")
    .in("id", riderIds);
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  return hails.map((h) => {
    const p = profileById.get(h.rider_id);
    const base = {
      id: h.id,
      riderId: h.rider_id,
      pickup: h.pickup_name,
      pickupLat: nonZero(h.pickup_lat),
      pickupLng: nonZero(h.pickup_lng),
      dropoff: h.dropoff_name,
      dropoffLat: nonZero(h.dropoff_lat),
      dropoffLng: nonZero(h.dropoff_lng),
      distanceKm: Number(h.distance_km),
      fareJmd: h.fare_jmd,
      journeyId: h.journey_id ?? null,
      legOrder: h.leg_order ?? null,
      isTransferLeg: h.is_transfer_leg ?? false,
      // Mid-corridor projection coords from the corridor-aware
      // pathfinder. Null on legacy hails created before the columns
      // existed — driver UI falls back to pickup/dropoff coords.
      boardingLat: nonZero(h.boarding_lat ?? null),
      boardingLng: nonZero(h.boarding_lng ?? null),
      alightingLat: nonZero(h.alighting_lat ?? null),
      alightingLng: nonZero(h.alighting_lng ?? null),
      rider: {
        name: (p?.full_name as string | null) ?? null,
        avatarUrl: (p?.avatar_url as string | null) ?? null,
        phone: (p?.phone as string | null) ?? null,
      },
    };
    if (shape === "accepted") {
      return { ...base, acceptedAt: h.accepted_at ?? null };
    }
    return { ...base, pickedUpAt: h.picked_up_at ?? null };
  });
}

/**
 * Compute proximity for each pending hail (when both the driver's
 * current GPS AND the hail's pickup GPS are available) and sort
 * closest-first. Hails without coords sink to the bottom in
 * requested-at order — drivers can still see them, just less
 * prominently than the ones we can place on the map.
 */
function enrichAndSortPending(
  rows: Array<{
    id: string;
    rider_id: string;
    pickup_name: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_name: string;
    dropoff_lat: number;
    dropoff_lng: number;
    distance_km: number;
    fare_jmd: number;
    concession: boolean;
    requested_at: string;
    journey_id?: string | null;
    leg_order?: number | null;
    is_transfer_leg?: boolean;
    boarding_lat?: number | null;
    boarding_lng?: number | null;
    alighting_lat?: number | null;
    alighting_lng?: number | null;
  }> | null,
  session: {
    current_lat: number | null;
    current_lng: number | null;
  },
) {
  if (!rows) return [];
  const driverPos =
    session.current_lat != null && session.current_lng != null
      ? { lat: session.current_lat, lng: session.current_lng }
      : null;

  const enriched = rows.map((h) => {
    const hasPickupCoords = h.pickup_lat !== 0 || h.pickup_lng !== 0;
    const hasDropoffCoords =
      h.dropoff_lat !== 0 || h.dropoff_lng !== 0;
    // Proximity is measured against the BOARDING coords when the
    // corridor-aware pathfinder has stamped them — that's the exact
    // point the rider sees on their map, and lets the driver's sort
    // reflect "who's closest to where they actually stand" rather
    // than "who's closest to where they typed their pickup."
    const boardingLat = h.boarding_lat ?? null;
    const boardingLng = h.boarding_lng ?? null;
    const targetForProximity =
      boardingLat != null && boardingLng != null
        ? { lat: boardingLat, lng: boardingLng }
        : hasPickupCoords
          ? { lat: h.pickup_lat, lng: h.pickup_lng }
          : null;
    const proximityKm =
      driverPos && targetForProximity
        ? haversineKm(driverPos, targetForProximity)
        : null;
    return {
      id: h.id,
      riderId: h.rider_id,
      pickup: h.pickup_name,
      pickupLat: hasPickupCoords ? h.pickup_lat : null,
      pickupLng: hasPickupCoords ? h.pickup_lng : null,
      dropoff: h.dropoff_name,
      dropoffLat: hasDropoffCoords ? h.dropoff_lat : null,
      dropoffLng: hasDropoffCoords ? h.dropoff_lng : null,
      distanceKm: Number(h.distance_km),
      fareJmd: h.fare_jmd,
      concession: h.concession,
      requestedAt: h.requested_at,
      proximityKm,
      journeyId: h.journey_id ?? null,
      legOrder: h.leg_order ?? null,
      isTransferLeg: h.is_transfer_leg ?? false,
      boardingLat,
      boardingLng,
      alightingLat: h.alighting_lat ?? null,
      alightingLng: h.alighting_lng ?? null,
    };
  });

  // Sort: hails with proximity ascending, then unscored hails by
  // requested-at (which is already the SQL order).
  enriched.sort((a, b) => {
    if (a.proximityKm == null && b.proximityKm == null) return 0;
    if (a.proximityKm == null) return 1;
    if (b.proximityKm == null) return -1;
    return a.proximityKm - b.proximityKm;
  });

  return enriched;
}
