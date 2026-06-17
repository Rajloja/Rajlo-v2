import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getAverageRating } from "@/lib/ratings";

/**
 * GET /api/driver/rides/active
 *
 * Returns the signed-in driver's currently in-flight ride if any
 * (status in accepted | arrived | in_progress), otherwise null. Used by
 * the driver's active-trip page to know which ride to render.
 *
 * Includes rider profile + intermediate stops so the UI has everything
 * it needs in one round trip.
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

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Pull the primary ride (oldest accepted) — for solo this is THE
  // ride; for carpool it's the anchor we order around. We then pull
  // the partner ride (same group_id) if any.
  const { data: ride } = await supabase
    .from("rides")
    .select(
      "id, status, rider_id, pickup_name, pickup_address, pickup_lat, pickup_lng, dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, seats, notes, estimated_fare_jmd, estimated_distance_km, estimated_eta_minutes, requested_at, accepted_at, arrived_at, started_at, carpool_group_id, carpool_role, start_pin, pin_verified_at",
    )
    .eq("driver_id", driver.id)
    .in("status", ["accepted", "arrived", "in_progress"])
    .order("carpool_role", { ascending: true, nullsFirst: false }) // primary < secondary < null
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!ride) {
    // No active ride — surface a ride that ended in the last couple
    // of minutes so the active-trip page can show "the rider
    // cancelled / trip completed" instead of silently blanking to "no
    // active trip" (e.g. when the RIDER cancels and the driver took
    // no action). Separate field — `ride` semantics are unchanged.
    const endedCutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: ended } = await supabase
      .from("rides")
      .select(
        "id, status, pickup_name, dropoff_name, cancellation_reason, cancelled_at, completed_at",
      )
      .eq("driver_id", driver.id)
      .in("status", ["cancelled", "completed"])
      .or(
        `cancelled_at.gt.${endedCutoff},completed_at.gt.${endedCutoff}`,
      )
      .order("accepted_at", { ascending: false, nullsFirst: false })
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

  // Carpool partner — same group, different ride row. There can only
  // be one (matcher always pairs exactly two), but we use array-fetch
  // so we don't crash if some future scenario produces three.
  let partnerRow:
    | {
        id: string;
        status: string;
        rider_id: string;
        pickup_name: string;
        pickup_address: string;
        pickup_lat: number;
        pickup_lng: number;
        dropoff_name: string;
        dropoff_address: string;
        dropoff_lat: number;
        dropoff_lng: number;
        seats: number;
        estimated_fare_jmd: number;
        carpool_role: string | null;
      }
    | null = null;
  if (ride.carpool_group_id) {
    const { data: partners } = await supabase
      .from("rides")
      .select(
        "id, status, rider_id, pickup_name, pickup_address, pickup_lat, pickup_lng, dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, seats, estimated_fare_jmd, carpool_role",
      )
      .eq("carpool_group_id", ride.carpool_group_id)
      .neq("id", ride.id)
      .limit(1);
    partnerRow = partners?.[0] ?? null;
  }

  const { data: stops } = await supabase
    .from("ride_stops")
    .select("position, name, address, lat, lng")
    .eq("ride_id", ride.id)
    .order("position", { ascending: true });

  // Rider profile (name + avatar + phone) so the driver can see who
  // they're picking up and tap-to-call when needed ("I'm at your gate").
  // Rider's average rating + count comes from the same helper drivers
  // see on the rider side, so the live-trip cards mirror each other.
  const [{ data: riderProfile }, riderRating] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url, phone")
      .eq("id", ride.rider_id)
      .maybeSingle(),
    getAverageRating(supabase, ride.rider_id, "rider"),
  ]);

  let partnerProfile: { full_name: string | null } | null = null;
  if (partnerRow) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", partnerRow.rider_id)
      .maybeSingle();
    partnerProfile = data ?? null;
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
      timeline: {
        requestedAt: ride.requested_at,
        acceptedAt: ride.accepted_at,
        arrivedAt: ride.arrived_at,
        startedAt: ride.started_at,
      },
      // Verify-Your-Ride. The driver never sees the PIN itself — only
      // whether one is required and whether they've already entered
      // it. The active-trip UI gates the "Start trip" button on this:
      // if `hasPin && !pinVerified`, tap opens the PIN entry dialog
      // instead of immediately POSTing the start transition.
      pin: ride.start_pin
        ? { required: true, verified: !!ride.pin_verified_at }
        : { required: false, verified: false },
    },
    rider: {
      name: riderProfile?.full_name ?? "Rider",
      avatarUrl: riderProfile?.avatar_url ?? null,
      phone: riderProfile?.phone ?? null,
      rating: riderRating.average,
      ratingCount: riderRating.count,
    },
    // Carpool block — null for solo trips, populated when the driver's
    // currently-assigned ride is part of a matched group. The active-trip
    // UI uses this to render a multi-pickup/multi-dropoff route and a
    // "two riders" header.
    carpool: partnerRow
      ? {
          groupId: ride.carpool_group_id,
          partner: {
            rideId: partnerRow.id,
            riderName: partnerProfile?.full_name ?? "Rider",
            pickup: {
              name: partnerRow.pickup_name,
              address: partnerRow.pickup_address,
              lat: partnerRow.pickup_lat,
              lng: partnerRow.pickup_lng,
            },
            dropoff: {
              name: partnerRow.dropoff_name,
              address: partnerRow.dropoff_address,
              lat: partnerRow.dropoff_lat,
              lng: partnerRow.dropoff_lng,
            },
            seats: partnerRow.seats,
            fareJMD: partnerRow.estimated_fare_jmd,
            status: partnerRow.status,
          },
        }
      : null,
  });
}
