import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/route-sessions
 *
 * Live snapshot of every Route Taxi session — who's online, which
 * corridor, seats taken, pending hails, last position. Drives the
 * admin's real-time monitor screen (polled every ~5s).
 *
 * Query:
 *   ?status=active|ended|all   (default: active)
 *   ?limit=200 (max 500)
 */

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "active";
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? 200)),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

  let query = supabase
    .from("driver_sessions")
    .select(
      "id, driver_id, route_id, direction, vehicle_capacity, seats_taken, status, started_at, ended_at, current_lat, current_lng, last_position_at",
    )
    .order("started_at", { ascending: false })
    .range(offset, offset + limit);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: rawSessions, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const fetched = rawSessions ?? [];
  const hasMore = fetched.length > limit;
  const sessions = hasMore ? fetched.slice(0, limit) : fetched;
  if (sessions.length === 0) {
    return NextResponse.json({
      sessions: [],
      totalSeatsTaken: 0,
      totalCapacity: 0,
      pagination: { hasMore: false },
    });
  }

  // Batch-load route + driver lookups so we render names not UUIDs.
  const routeIds = Array.from(new Set(sessions.map((s) => s.route_id)));
  const driverIds = Array.from(new Set(sessions.map((s) => s.driver_id)));

  const [{ data: routes }, { data: drivers }] = await Promise.all([
    supabase
      .from("routes")
      .select("id, origin_name, destination_name, origin_parish, distance_km, ta_fare_jmd")
      .in("id", routeIds),
    supabase
      .from("drivers")
      .select("id, external_id, first_name, last_name, plate_number, vehicle_make, vehicle_model")
      .in("id", driverIds),
  ]);

  const routeById = new Map(
    (routes ?? []).map((r) => [r.id, r]),
  );
  const driverById = new Map(
    (drivers ?? []).map((d) => [d.id, d]),
  );

  // Pending + active hail counts per session — one grouped query.
  const sessionIds = sessions.map((s) => s.id);
  const { data: hails } = await supabase
    .from("route_hails")
    .select("session_id, status")
    .in("session_id", sessionIds)
    .in("status", ["accepted", "picked_up"]);

  const hailCounts = new Map<string, { accepted: number; onboard: number }>();
  for (const h of hails ?? []) {
    if (!h.session_id) continue;
    const cur = hailCounts.get(h.session_id) ?? { accepted: 0, onboard: 0 };
    if (h.status === "accepted") cur.accepted++;
    else if (h.status === "picked_up") cur.onboard++;
    hailCounts.set(h.session_id, cur);
  }

  let totalSeatsTaken = 0;
  let totalCapacity = 0;

  const enriched = sessions.map((s) => {
    const route = routeById.get(s.route_id);
    const driver = driverById.get(s.driver_id);
    const counts = hailCounts.get(s.id) ?? { accepted: 0, onboard: 0 };
    if (s.status === "active") {
      totalSeatsTaken += s.seats_taken;
      totalCapacity += s.vehicle_capacity;
    }
    return {
      id: s.id,
      direction: s.direction,
      status: s.status,
      seatsTaken: s.seats_taken,
      vehicleCapacity: s.vehicle_capacity,
      seatsRemaining: Math.max(0, s.vehicle_capacity - s.seats_taken),
      startedAt: s.started_at,
      endedAt: s.ended_at,
      currentLat: s.current_lat,
      currentLng: s.current_lng,
      lastPositionAt: s.last_position_at,
      driver: driver
        ? {
            id: driver.id,
            externalId: driver.external_id,
            name:
              [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
              "Unnamed driver",
            plate: driver.plate_number,
            vehicle:
              [driver.vehicle_make, driver.vehicle_model]
                .filter(Boolean)
                .join(" ") || null,
          }
        : null,
      route: route
        ? {
            id: route.id,
            origin: route.origin_name,
            destination: route.destination_name,
            parish: route.origin_parish,
            distanceKm: Number(route.distance_km),
            taFareJmd: route.ta_fare_jmd,
          }
        : null,
      hails: counts,
    };
  });

  return NextResponse.json({
    sessions: enriched,
    totalSeatsTaken,
    totalCapacity,
    activeSessions: enriched.filter((s) => s.status === "active").length,
    pagination: { hasMore },
  });
}
