import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getDriverSelfieUrl } from "@/lib/driver-selfie";
import type { CorridorPath } from "@/lib/route-taxi-pathfinder";

/**
 * GET /api/rider/route-taxi/journeys/[id]
 *
 * Full snapshot of a multi-leg journey for the rider's live UI:
 * the planned route, every leg's status (settled / in-flight /
 * pending), the current leg + its driver/session (when assigned),
 * and the settlement totals.
 *
 * Polled every ~5s while a journey is in flight. Single round-trip:
 * the journey row, all its hails, the active session (if any), the
 * current driver's vehicle + selfie. Anything not yet relevant to
 * the rider (future legs' drivers — not assigned yet) returns null
 * so the UI just renders the leg outline.
 */

type JourneyRow = {
  id: string;
  rider_id: string;
  status: "planning" | "active" | "completed" | "cancelled";
  origin_name: string;
  destination_name: string;
  total_fare_jmd: number;
  planned_leg_count: number;
  completed_leg_count: number;
  settled_fare_jmd: number;
  refunded_fare_jmd: number;
  concession: boolean;
  plan: CorridorPath;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

type HailRow = {
  id: string;
  route_id: string;
  session_id: string | null;
  leg_order: number | null;
  is_transfer_leg: boolean;
  status: string;
  pickup_name: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_name: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  fare_jmd: number;
  commission_jmd: number | null;
  driver_earnings_jmd: number | null;
  requested_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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

  // 1. Journey row — gated on rider_id so a stale id from another
  //    account can't probe state.
  const { data: journeyData } = await supabase
    .from("route_journeys")
    .select(
      "id, rider_id, status, origin_name, destination_name, total_fare_jmd, planned_leg_count, completed_leg_count, settled_fare_jmd, refunded_fare_jmd, concession, plan, cancellation_reason, cancelled_by, started_at, completed_at, cancelled_at, created_at",
    )
    .eq("id", id)
    .eq("rider_id", user.id)
    .maybeSingle();
  if (!journeyData) {
    return NextResponse.json(
      { error: "journey not found" },
      { status: 404 },
    );
  }
  const journey = journeyData as JourneyRow;

  // 2. Every hail for this journey (legs in order).
  const { data: hailRows } = await supabase
    .from("route_hails")
    .select(
      "id, route_id, session_id, leg_order, is_transfer_leg, status, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, distance_km, fare_jmd, commission_jmd, driver_earnings_jmd, requested_at, accepted_at, picked_up_at, completed_at, cancelled_at, cancellation_reason",
    )
    .eq("journey_id", journey.id)
    .order("leg_order", { ascending: true });

  const hails = (hailRows ?? []) as HailRow[];

  // 3. Resolve the "current leg" — the first non-terminal leg. If
  //    none, journey is done (or cancelled).
  const currentLeg = hails.find(
    (h) => h.status !== "completed" && h.status !== "cancelled",
  );

  // 4. If the current leg has a session assigned, pull the driver +
  //    session details so the rider sees who's coming. We only hydrate
  //    one driver (the current leg's) — future legs aren't assigned
  //    yet, settled legs don't need a card.
  type DriverDetail = {
    sessionId: string;
    seatsTaken: number;
    vehicleCapacity: number;
    currentLat: number | null;
    currentLng: number | null;
    lastPositionAt: string | null;
    driver: {
      firstName: string | null;
      lastName: string | null;
      plateNumber: string | null;
      vehicleMake: string | null;
      vehicleModel: string | null;
      vehicleColor: string | null;
      phone: string | null;
      selfieUrl: string | null;
    };
  };
  let currentDriver: DriverDetail | null = null;
  if (currentLeg && currentLeg.session_id) {
    const { data: sess } = await supabase
      .from("driver_sessions")
      .select(
        "id, driver_id, seats_taken, vehicle_capacity, current_lat, current_lng, last_position_at",
      )
      .eq("id", currentLeg.session_id)
      .maybeSingle();
    if (sess) {
      const { data: driver } = await supabase
        .from("drivers")
        .select(
          "id, first_name, last_name, plate_number, vehicle_make, vehicle_model, vehicle_color, phone",
        )
        .eq("id", sess.driver_id)
        .maybeSingle();
      const selfieUrl = driver
        ? await getDriverSelfieUrl(supabase, driver.id).catch(() => null)
        : null;
      if (driver) {
        currentDriver = {
          sessionId: sess.id,
          seatsTaken: sess.seats_taken,
          vehicleCapacity: sess.vehicle_capacity,
          currentLat: sess.current_lat,
          currentLng: sess.current_lng,
          lastPositionAt: sess.last_position_at,
          driver: {
            firstName: driver.first_name,
            lastName: driver.last_name,
            plateNumber: driver.plate_number,
            vehicleMake: driver.vehicle_make,
            vehicleModel: driver.vehicle_model,
            vehicleColor: driver.vehicle_color,
            phone: driver.phone,
            selfieUrl,
          },
        };
      }
    }
  }

  return NextResponse.json({
    journey: {
      id: journey.id,
      status: journey.status,
      origin: journey.origin_name,
      destination: journey.destination_name,
      totalFareJmd: journey.total_fare_jmd,
      settledFareJmd: journey.settled_fare_jmd,
      refundedFareJmd: journey.refunded_fare_jmd,
      plannedLegCount: journey.planned_leg_count,
      completedLegCount: journey.completed_leg_count,
      concession: journey.concession,
      plan: journey.plan,
      cancellationReason: journey.cancellation_reason,
      cancelledBy: journey.cancelled_by,
      startedAt: journey.started_at,
      completedAt: journey.completed_at,
      cancelledAt: journey.cancelled_at,
      createdAt: journey.created_at,
    },
    legs: hails.map((h) => ({
      hailId: h.id,
      legOrder: h.leg_order,
      isTransferLeg: h.is_transfer_leg,
      routeId: h.route_id,
      sessionId: h.session_id,
      status: h.status,
      pickup: { name: h.pickup_name, lat: h.pickup_lat, lng: h.pickup_lng },
      dropoff: { name: h.dropoff_name, lat: h.dropoff_lat, lng: h.dropoff_lng },
      distanceKm: Number(h.distance_km),
      fareJmd: h.fare_jmd,
      commissionJmd: h.commission_jmd,
      driverEarningsJmd: h.driver_earnings_jmd,
      requestedAt: h.requested_at,
      acceptedAt: h.accepted_at,
      pickedUpAt: h.picked_up_at,
      completedAt: h.completed_at,
      cancelledAt: h.cancelled_at,
      cancellationReason: h.cancellation_reason,
    })),
    currentLeg: currentLeg
      ? { hailId: currentLeg.id, legOrder: currentLeg.leg_order }
      : null,
    currentDriver,
  });
}
