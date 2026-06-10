import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getAverageRating } from "@/lib/ratings";
import { getDriverSelfieUrl } from "@/lib/driver-selfie";

/**
 * 
 * GET /api/rider/rides/active
 *
 * Returns the rider's currently-active ride (status in
 * requested | accepted | arrived | in_progress) if any, plus the
 * assigned driver's display info.
 *
 * If multiple rides somehow match (shouldn't in practice — riders only
 * have one active trip at a time), returns the most recently requested.
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
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // Pull the rider's most recent active ride. We INCLUDE
  // 'cancelled' here so the just-expired case can be surfaced to
  // the frontend (with cancellation_reason='expired_no_driver').
  // Filtered down below if the cancellation is anything other than
  // an expiry. Limited to rides cancelled in the last 60s so old
  // cancellations don't keep showing up as the "active" trip.
  const cancelledCutoff = new Date(Date.now() - 60_000).toISOString();
  let { data: ride } = await supabase
    .from("rides")
    .select(
      "id, status, driver_id, pickup_name, pickup_address, pickup_lat, pickup_lng, dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, seats, notes, estimated_fare_jmd, estimated_distance_km, estimated_eta_minutes, requested_at, expires_at, accepted_at, arrived_at, started_at, cancelled_at, cancellation_reason, carpool_group_id, start_pin, pin_verified_at",
    )
    .eq("rider_id", user.id)
    .or(
      `status.in.(requested,accepted,arrived,in_progress),and(status.eq.cancelled,cancellation_reason.eq.expired_no_driver,cancelled_at.gt.${cancelledCutoff})`,
    )
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Expire-on-read: if the most recent active ride has timed out
  // without a match, flip it to cancelled atomically. We re-fetch
  // afterwards so the response reflects the new state.
  if (
    ride &&
    ride.status === "requested" &&
    ride.expires_at &&
    new Date(ride.expires_at).getTime() <= Date.now()
  ) {
    await supabase.rpc("expire_stale_ride", { p_ride_id: ride.id });
    const { data: refreshed } = await supabase
      .from("rides")
      .select(
        "id, status, driver_id, pickup_name, pickup_address, pickup_lat, pickup_lng, dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, seats, notes, estimated_fare_jmd, estimated_distance_km, estimated_eta_minutes, requested_at, expires_at, accepted_at, arrived_at, started_at, cancelled_at, cancellation_reason, carpool_group_id, start_pin, pin_verified_at",
      )
      .eq("id", ride.id)
      .maybeSingle();
    if (refreshed) ride = refreshed;
    // Audit: a system-driven cancellation. Keeps the events log
    // honest about why this ride ended.
    if (ride?.status === "cancelled") {
      await supabase.from("ride_events").insert({
        ride_id: ride.id,
        event: "expired_no_driver",
        actor_role: "system",
        metadata: { reason: "no driver accepted within timeout window" },
      });
    }
  }

  if (!ride) {
    // No active ride — but surface a ride that ended in the last
    // couple of minutes so the live-trip page can show "this trip was
    // cancelled / completed" instead of silently blanking to "no
    // active trip". `recentlyEnded` is a SEPARATE field so existing
    // consumers that only read `ride` are unaffected.
    const endedCutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: ended } = await supabase
      .from("rides")
      .select(
        "id, status, pickup_name, dropoff_name, cancellation_reason, cancelled_at, completed_at",
      )
      .eq("rider_id", user.id)
      .in("status", ["cancelled", "completed"])
      .or(
        `cancelled_at.gt.${endedCutoff},completed_at.gt.${endedCutoff}`,
      )
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      ride: null,
      recentlyEnded: ended
        ? {
            id: ended.id,
            status: ended.status,
            pickupName: ended.pickup_name,
            dropoffName: ended.dropoff_name,
            cancellationReason: ended.cancellation_reason,
          }
        : null,
    });
  }

  // If this rider's trip is part of a carpool, surface the partner's
  // first name so the live-trip UI can render a "sharing with X"
  // badge. We deliberately DON'T expose the partner's pickup/dropoff —
  // that's privileged info the driver needs but other riders don't.
  //
  // Folded into a single query via the inline-embed syntax (rider_id
  // → profiles FK). One round trip instead of the previous "find
  // partner row" → "look up profile" sequence.
  let carpoolPartnerFirstName: string | null = null;
  if (ride.carpool_group_id) {
    const { data: partner } = await supabase
      .from("rides")
      .select("rider_id, profiles(full_name)")
      .eq("carpool_group_id", ride.carpool_group_id)
      .neq("id", ride.id)
      .maybeSingle();
    // Supabase's TS inference returns embedded resources as an array
    // even when the FK is one-to-one. `rides.rider_id` → `profiles.id`
    // can only ever match a single row, so unwrap either shape and
    // pick the first.
    type EmbeddedProfile = { full_name: string | null };
    const embedded = partner?.profiles as
      | EmbeddedProfile
      | EmbeddedProfile[]
      | null
      | undefined;
    const profile = Array.isArray(embedded) ? embedded[0] : embedded;
    // First name only — last names aren't useful for the rider and
    // err on the side of less PII exposure.
    carpoolPartnerFirstName = profile?.full_name?.split(" ")[0] ?? null;
  }

  const { data: stops } = await supabase
    .from("ride_stops")
    .select("position, name, address, lat, lng")
    .eq("ride_id", ride.id)
    .order("position", { ascending: true });

  let driver: {
    name: string;
    phone: string | null;
    plateNumber: string | null;
    /** Combined vehicle string: "2020 Silver Toyota Probox" — handy when
     *  the UI just wants one line. Null only if make + model are both empty. */
    vehicle: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    vehicleColor: string | null;
    /** null = no ratings yet (UI shows "new driver" pill instead). */
    rating: number | null;
    ratingCount: number;
    avatarUrl: string | null;
  } | null = null;

  if (ride.driver_id) {
    const { data: d } = await supabase
      .from("drivers")
      .select(
        "first_name, last_name, phone, plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color, user_id",
      )
      .eq("id", ride.driver_id)
      .maybeSingle();
    if (d) {
      // Three parallel lookups: OAuth profile pic, lifetime rating
      // average, and the driver's TA selfie (signed storage URL).
      // Selfie takes priority over the OAuth pic when shown to the
      // rider — that's the photo the TA verified.
      const [{ data: profile }, ratingSummary, selfieUrl] = await Promise.all([
        supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", d.user_id)
          .maybeSingle(),
        getAverageRating(supabase, d.user_id, "driver"),
        getDriverSelfieUrl(supabase, ride.driver_id),
      ]);
      const vehicleParts = [
        d.vehicle_year ? String(d.vehicle_year) : null,
        d.vehicle_color,
        d.vehicle_make,
        d.vehicle_model,
      ].filter(Boolean);
      driver = {
        name:
          [d.first_name, d.last_name].filter(Boolean).join(" ") || "Driver",
        phone: d.phone,
        plateNumber: d.plate_number,
        vehicle: vehicleParts.length > 0 ? vehicleParts.join(" ") : null,
        vehicleMake: d.vehicle_make,
        vehicleModel: d.vehicle_model,
        vehicleYear: d.vehicle_year,
        vehicleColor: d.vehicle_color,
        rating: ratingSummary.average,
        ratingCount: ratingSummary.count,
        // Prefer the verified TA selfie. Falls through to the
        // Google OAuth picture, then null (UI renders initials).
        avatarUrl: selfieUrl ?? profile?.avatar_url ?? null,
      };
    }
  }

  return NextResponse.json({
    ride: {
      id: ride.id,
      status: ride.status,
      pickup: {
        name: ride.pickup_name,
        address: ride.pickup_address,
        lat: ride.pickup_lat,
        lng: ride.pickup_lng,
      },
      dropoff: {
        name: ride.dropoff_name,
        address: ride.dropoff_address,
        lat: ride.dropoff_lat,
        lng: ride.dropoff_lng,
      },
      stops: stops ?? [],
      seats: ride.seats,
      notes: ride.notes,
      estimatedFareJMD: ride.estimated_fare_jmd,
      estimatedDistanceKm: ride.estimated_distance_km,
      estimatedEtaMinutes: ride.estimated_eta_minutes,
      // Drives the "searching for drivers" countdown ring on the
      // rider's live-trip page. Frontend computes
      // `expiresAt - now` each tick and shows a "no driver found"
      // state when it hits zero (the next refresh picks up the
      // server-side auto-cancel).
      expiresAt: ride.expires_at,
      cancellationReason: ride.cancellation_reason,
      timeline: {
        requestedAt: ride.requested_at,
        acceptedAt: ride.accepted_at,
        arrivedAt: ride.arrived_at,
        startedAt: ride.started_at,
        cancelledAt: ride.cancelled_at,
      },
      carpool: ride.carpool_group_id
        ? {
            groupId: ride.carpool_group_id,
            partnerFirstName: carpoolPartnerFirstName,
          }
        : null,
      // Verify-Your-Ride PIN. Surfaced only after a driver is assigned
      // so the rider doesn't see it on the searching screen — the code
      // is meant to be flashed once the rider can physically see the
      // car. UI shows it most prominently in the `arrived` state, but
      // we ship it in `accepted` too so the rider can have it ready.
      pin: ride.start_pin
        ? {
            code:
              ride.status === "accepted" || ride.status === "arrived"
                ? (ride.start_pin as string)
                : null,
            verified: !!ride.pin_verified_at,
          }
        : null,
    },
    driver,
  });
}
