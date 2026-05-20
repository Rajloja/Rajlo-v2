import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/rides
 *
 * Paginated ride feed for the ride-monitoring page. Supports:
 *   ?status=requested|accepted|arrived|in_progress|completed|cancelled|active|all
 *   ?parish=Kingston             — filters by either pickup or dropoff parish
 *   ?q=<search>                  — matches pickup/dropoff name or ride id prefix
 *   ?driverId=<external_id>      — filters to one driver
 *   ?riderId=<auth user id>      — filters to one rider
 *   ?days=7                      — window (default 7, max 90, 0 = all-time)
 *   ?limit=50 (max 200) ?offset=0
 *
 * "active" is shorthand for the four in-flight statuses
 * (requested, accepted, arrived, in_progress).
 */

const ACTIVE_STATUSES = ["requested", "accepted", "arrived", "in_progress"];

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "all";
  const parish = sp.get("parish") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const driverExternalId = sp.get("driverId");
  const riderId = sp.get("riderId");
  const days = Math.max(0, Math.min(90, parseInt(sp.get("days") ?? "7", 10) || 7));
  const limit = Math.min(
    200,
    Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50),
  );
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  // Resolve driver external_id → row id if filtering by driver
  let driverRowId: string | null = null;
  if (driverExternalId) {
    const { data: drv } = await supabase
      .from("drivers")
      .select("id")
      .eq("external_id", driverExternalId)
      .maybeSingle();
    driverRowId = (drv as { id: string } | null)?.id ?? null;
    if (!driverRowId) {
      return NextResponse.json({
        rides: [],
        total: 0,
        limit,
        offset,
        pagination: { hasMore: false },
      });
    }
  }

  let query = supabase
    .from("rides")
    .select(
      "id, status, rider_id, driver_id, pickup_name, pickup_address, pickup_parish, dropoff_name, dropoff_address, dropoff_parish, seats, estimated_fare_jmd, final_fare_jmd, requested_at, accepted_at, completed_at, cancelled_at, cancellation_reason",
      { count: "exact" },
    )
    .order("requested_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === "active") {
    query = query.in("status", ACTIVE_STATUSES);
  } else if (status !== "all") {
    query = query.eq("status", status);
  }
  if (parish) {
    query = query.or(
      `pickup_parish.eq.${parish},dropoff_parish.eq.${parish}`,
    );
  }
  if (q) {
    query = query.or(
      `pickup_name.ilike.%${q}%,dropoff_name.ilike.%${q}%,id.ilike.${q}%`,
    );
  }
  if (driverRowId) query = query.eq("driver_id", driverRowId);
  if (riderId) query = query.eq("rider_id", riderId);
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("requested_at", since);
  }

  const { data: rideRows, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type RideRow = {
    id: string;
    status: string;
    rider_id: string;
    driver_id: string | null;
    pickup_name: string;
    pickup_address: string;
    pickup_parish: string | null;
    dropoff_name: string;
    dropoff_address: string;
    dropoff_parish: string | null;
    seats: number;
    estimated_fare_jmd: number;
    final_fare_jmd: number | null;
    requested_at: string;
    accepted_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
  };
  const rides = (rideRows ?? []) as RideRow[];

  // Hydrate rider names + driver names
  const riderIds = Array.from(new Set(rides.map((r) => r.rider_id)));
  const driverIds = Array.from(
    new Set(rides.map((r) => r.driver_id).filter(Boolean) as string[]),
  );

  const [riderProfiles, driverDetails] = await Promise.all([
    riderIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", riderIds)
      : { data: [] as { id: string; full_name: string | null }[] },
    driverIds.length > 0
      ? supabase
          .from("drivers")
          .select("id, external_id, first_name, last_name, plate_number")
          .in("id", driverIds)
      : {
          data: [] as Array<{
            id: string;
            external_id: string;
            first_name: string | null;
            last_name: string | null;
            plate_number: string | null;
          }>,
        },
  ]);

  const riderMap = new Map(
    ((riderProfiles.data ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name ?? "Rider"],
    ),
  );
  const driverMap = new Map(
    ((driverDetails.data ?? []) as Array<{
      id: string;
      external_id: string;
      first_name: string | null;
      last_name: string | null;
      plate_number: string | null;
    }>).map((d) => [
      d.id,
      {
        externalId: d.external_id,
        name:
          [d.first_name, d.last_name].filter(Boolean).join(" ") || "Driver",
        plate: d.plate_number,
      },
    ]),
  );

  return NextResponse.json({
    rides: rides.map((r) => ({
      id: r.id,
      status: r.status,
      riderId: r.rider_id,
      riderName: riderMap.get(r.rider_id) ?? "Rider",
      driverId: r.driver_id,
      driverName: r.driver_id ? driverMap.get(r.driver_id)?.name ?? null : null,
      driverExternalId: r.driver_id
        ? driverMap.get(r.driver_id)?.externalId ?? null
        : null,
      driverPlate: r.driver_id
        ? driverMap.get(r.driver_id)?.plate ?? null
        : null,
      pickup: {
        name: r.pickup_name,
        address: r.pickup_address,
        parish: r.pickup_parish,
      },
      dropoff: {
        name: r.dropoff_name,
        address: r.dropoff_address,
        parish: r.dropoff_parish,
      },
      seats: r.seats,
      fare: r.final_fare_jmd ?? r.estimated_fare_jmd,
      requestedAt: r.requested_at,
      acceptedAt: r.accepted_at,
      completedAt: r.completed_at,
      cancelledAt: r.cancelled_at,
      cancellationReason: r.cancellation_reason,
    })),
    total: count ?? rides.length,
    limit,
    offset,
    pagination: {
      hasMore: (count ?? rides.length) > offset + rides.length,
    },
  });
}
