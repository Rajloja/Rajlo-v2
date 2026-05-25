import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/rider/rides/history
 *
 * Returns the rider's rides, most-recent first. Supports filtering:
 *   ?status=all       — completed + cancelled + in-flight (default)
 *   ?status=ongoing   — in-flight only (requested/accepted/arrived/in_progress)
 *   ?status=completed — completed only
 *   ?status=cancelled — cancelled only
 *
 * Pagination via `?limit=` (1..50, default 20) and `?offset=`.
 *
 * For each ride we include the assigned driver's display name + avg
 * rating, the rider's own rating (if they submitted one), and a
 * carpool flag. Used by the tabbed history page.
 */

const STATUS_GROUPS = {
  all: ["requested", "accepted", "arrived", "in_progress", "completed", "cancelled"],
  ongoing: ["requested", "accepted", "arrived", "in_progress"],
  completed: ["completed"],
  cancelled: ["cancelled"],
} as const;
type StatusFilter = keyof typeof STATUS_GROUPS;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const statusParam = (url.searchParams.get("status") ?? "all") as StatusFilter;
  const statuses = STATUS_GROUPS[statusParam] ?? STATUS_GROUPS.all;

  const { data: rides, error } = await supabase
    .from("rides")
    .select(
      "id, status, driver_id, pickup_name, pickup_address, pickup_lat, pickup_lng, pickup_place_id, dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, dropoff_place_id, seats, estimated_fare_jmd, final_fare_jmd, requested_at, accepted_at, arrived_at, started_at, completed_at, cancelled_at, cancellation_reason, carpool_group_id",
    )
    .eq("rider_id", user.id)
    .in("status", statuses as unknown as string[])
    .order("requested_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rides ?? [];

  // Bulk-fetch the bits we need to enrich each row: driver names + the
  // rider's own ratings. Doing one query each instead of N+1 round-trips.
  const driverInternalIds = Array.from(
    new Set(list.map((r) => r.driver_id).filter((x): x is string => !!x)),
  );
  const rideIds = list.map((r) => r.id);

  const [driversRes, ratingsRes] = await Promise.all([
    driverInternalIds.length > 0
      ? supabase
          .from("drivers")
          .select("id, first_name, last_name, user_id")
          .in("id", driverInternalIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            user_id: string;
          }[],
        }),
    rideIds.length > 0
      ? supabase
          .from("ride_ratings")
          .select("ride_id, stars")
          .eq("rater_id", user.id)
          .in("ride_id", rideIds)
      : Promise.resolve({ data: [] as { ride_id: string; stars: number }[] }),
  ]);

  const driverByInternalId = new Map(
    (driversRes.data ?? []).map((d) => [d.id, d]),
  );

  // Bulk-aggregate the average rating + count for every driver who
  // appears in this page. Single query, GROUP BY-equivalent done in
  // memory. Avoids N round-trips to getAverageRating().
  const driverUserIds = (driversRes.data ?? [])
    .map((d) => d.user_id)
    .filter((x): x is string => !!x);
  const driverRatingAgg = await aggregateRatings(
    supabase,
    driverUserIds,
    "driver",
  );

  const ratingByRide = new Map<string, number>(
    (ratingsRes.data ?? []).map((r) => [r.ride_id, r.stars]),
  );

  // Pull route taxi history too. The page shows everything the rider
  // has booked — Mode A (rides) and Mode B (route_taxi) — with a
  // small badge so they can tell them apart at a glance.
  //
  // Mode B has two shapes in the data model:
  //
  //   1. JOURNEYS — every booking made through /rider/request is a
  //      `route_journeys` row that owns 1..N `route_hails` rows (one
  //      per corridor leg). The history surfaces these as ONE
  //      consolidated entry with a `legs[]` breakdown — a 3-leg
  //      Negril→Mandeville→Sav-la-Mar trip shouldn't read like 3
  //      separate trips in the rider's history.
  //
  //   2. SOLO HAILS — legacy single-leg hails created via the older
  //      /api/rider/route-taxi/hail endpoint (before the journey
  //      table existed). `journey_id IS NULL` on these rows; they
  //      remain as standalone entries with the existing shape.
  //
  // We over-fetch each source then merge + sort by requestedAt and
  // page-slice. Cheap at rider scale (no rider has thousands of
  // trips) and avoids a fragile "three-cursor" pagination scheme.
  const journeyStatusFilter = (() => {
    if (statusParam === "ongoing") return ["planning", "active"];
    if (statusParam === "completed") return ["completed"];
    if (statusParam === "cancelled") return ["cancelled"];
    return ["planning", "active", "completed", "cancelled"];
  })();
  const hailStatusFilter = (() => {
    if (statusParam === "ongoing") return ["requested", "accepted", "picked_up"];
    if (statusParam === "completed") return ["completed"];
    if (statusParam === "cancelled") return ["cancelled", "no_show"];
    return [
      "requested",
      "accepted",
      "picked_up",
      "completed",
      "cancelled",
      "no_show",
    ];
  })();

  // 1. Journeys — one row per multi-leg (or 1-leg journey-tracked) trip.
  const { data: journeys } = await supabase
    .from("route_journeys")
    .select(
      "id, status, origin_name, origin_lat, origin_lng, destination_name, destination_lat, destination_lng, total_fare_jmd, planned_leg_count, completed_leg_count, concession, started_at, completed_at, cancelled_at, cancellation_reason, created_at",
    )
    .eq("rider_id", user.id)
    .in("status", journeyStatusFilter)
    .order("created_at", { ascending: false })
    .limit(offset + limit);

  // 2. Fetch every leg (hail) belonging to those journeys in one shot.
  const journeyIds = (journeys ?? []).map((j) => j.id);
  const { data: journeyHails } = journeyIds.length
    ? await supabase
        .from("route_hails")
        .select(
          "id, journey_id, leg_order, is_transfer_leg, status, route_id, session_id, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, fare_jmd, distance_km, requested_at, accepted_at, picked_up_at, completed_at, cancelled_at, cancellation_reason",
        )
        .in("journey_id", journeyIds)
        .order("leg_order", { ascending: true })
    : { data: [] as Array<Record<string, unknown>> };

  // 3. Solo hails — legacy single-leg bookings (no journey row).
  const { data: hails } = await supabase
    .from("route_hails")
    .select(
      "id, status, route_id, session_id, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, fare_jmd, requested_at, accepted_at, picked_up_at, completed_at, cancelled_at, cancellation_reason, concession",
    )
    .eq("rider_id", user.id)
    .is("journey_id", null)
    .in("status", hailStatusFilter)
    .order("requested_at", { ascending: false })
    .limit(offset + limit);

  // Hydrate driver names for both solo hails AND journey legs via the
  // session → driver chain. We pool the session IDs across both
  // sources and run a single batched lookup.
  const allSessionIds = Array.from(
    new Set(
      [
        ...(hails ?? []).map((h) => h.session_id),
        ...(journeyHails ?? []).map(
          (h) => (h as { session_id: string | null }).session_id,
        ),
      ].filter((x): x is string => !!x),
    ),
  );
  const sessionDriverByHail = new Map<string, string | null>();
  const sessionDriverByLeg = new Map<string, string | null>();
  if (allSessionIds.length > 0) {
    const { data: sessions } = await supabase
      .from("driver_sessions")
      .select("id, driver_id")
      .in("id", allSessionIds);
    const driverIds = Array.from(
      new Set((sessions ?? []).map((s) => s.driver_id)),
    );
    const { data: hailDrivers } = await supabase
      .from("drivers")
      .select("id, first_name, last_name")
      .in("id", driverIds);
    const driverNameById = new Map(
      (hailDrivers ?? []).map((d) => [
        d.id,
        [d.first_name, d.last_name].filter(Boolean).join(" ") || "Driver",
      ]),
    );
    const driverIdBySession = new Map(
      (sessions ?? []).map((s) => [s.id, s.driver_id]),
    );
    for (const h of hails ?? []) {
      if (!h.session_id) continue;
      const driverId = driverIdBySession.get(h.session_id);
      if (driverId) {
        sessionDriverByHail.set(h.id, driverNameById.get(driverId) ?? null);
      }
    }
    for (const h of journeyHails ?? []) {
      const sid = (h as { session_id: string | null }).session_id;
      if (!sid) continue;
      const driverId = driverIdBySession.get(sid);
      if (driverId) {
        sessionDriverByLeg.set(
          (h as { id: string }).id,
          driverNameById.get(driverId) ?? null,
        );
      }
    }
  }

  // Map hail status into the ride-shaped status the page already
  // knows how to render. `picked_up` becomes `in_progress` (rider in
  // the car), `no_show` becomes `cancelled` with a reason.
  const hailStatusToRide = (s: string): RideShapedStatus => {
    if (s === "picked_up") return "in_progress";
    if (s === "no_show") return "cancelled";
    return s as RideShapedStatus;
  };

  type Row =
    | ReturnType<typeof shapePrivate>
    | ReturnType<typeof shapeHail>
    | ReturnType<typeof shapeJourney>;

  function shapePrivate(r: (typeof list)[number]) {
    const d = r.driver_id
      ? driverByInternalId.get(r.driver_id) ?? null
      : null;
    const driverAgg = d?.user_id
      ? driverRatingAgg.get(d.user_id) ?? null
      : null;
    return {
      id: r.id,
      kind: "private" as const,
      status: r.status as RideShapedStatus,
      pickup: {
        name: r.pickup_name,
        address: r.pickup_address,
        lat: r.pickup_lat,
        lng: r.pickup_lng,
        placeId: r.pickup_place_id,
      },
      dropoff: {
        name: r.dropoff_name,
        address: r.dropoff_address,
        lat: r.dropoff_lat,
        lng: r.dropoff_lng,
        placeId: r.dropoff_place_id,
      },
      seats: r.seats,
      fareJMD: r.final_fare_jmd ?? r.estimated_fare_jmd,
      requestedAt: r.requested_at,
      acceptedAt: r.accepted_at,
      arrivedAt: r.arrived_at,
      startedAt: r.started_at,
      endedAt: r.completed_at ?? r.cancelled_at,
      cancellationReason: r.cancellation_reason,
      driverName: d
        ? [d.first_name, d.last_name].filter(Boolean).join(" ") || "Driver"
        : null,
      driverRating: driverAgg?.average ?? null,
      driverRatingCount: driverAgg?.count ?? 0,
      myRatingStars: ratingByRide.get(r.id) ?? null,
      carpool: !!r.carpool_group_id,
    };
  }

  function shapeHail(h: NonNullable<typeof hails>[number]) {
    return {
      id: h.id,
      kind: "route_taxi" as const,
      status: hailStatusToRide(h.status),
      pickup: {
        name: h.pickup_name,
        address: h.pickup_name,
        lat: h.pickup_lat,
        lng: h.pickup_lng,
        placeId: null,
      },
      dropoff: {
        name: h.dropoff_name,
        address: h.dropoff_name,
        lat: h.dropoff_lat,
        lng: h.dropoff_lng,
        placeId: null,
      },
      seats: 1,
      fareJMD: h.fare_jmd,
      requestedAt: h.requested_at,
      acceptedAt: h.accepted_at,
      arrivedAt: null,
      startedAt: h.picked_up_at,
      endedAt: h.completed_at ?? h.cancelled_at,
      cancellationReason:
        h.status === "no_show"
          ? "No-show — driver couldn't catch you in time."
          : h.cancellation_reason,
      driverName: sessionDriverByHail.get(h.id) ?? null,
      driverRating: null,
      driverRatingCount: 0,
      myRatingStars: null,
      carpool: false,
      concession: h.concession,
    };
  }

  // Map journey status into the same RideShapedStatus enum the page
  // already renders. `planning` is too short-lived to surface; we
  // treat it as `requested`. `active` becomes `in_progress` once the
  // first leg picks up, otherwise `accepted` if some legs are still
  // requested. Conservative — better to under-state progress than to
  // over-state it in the rider's history.
  const journeyStatusToRide = (
    j: NonNullable<typeof journeys>[number],
    legs: NonNullable<typeof journeyHails>,
  ): RideShapedStatus => {
    if (j.status === "cancelled") return "cancelled";
    if (j.status === "completed") return "completed";
    // active or planning — derive from legs
    const anyPickedUp = legs.some((l) =>
      ["picked_up", "completed"].includes(
        (l as { status: string }).status,
      ),
    );
    if (anyPickedUp) return "in_progress";
    const anyAccepted = legs.some(
      (l) => (l as { status: string }).status === "accepted",
    );
    if (anyAccepted) return "accepted";
    return "requested";
  };

  function shapeJourney(j: NonNullable<typeof journeys>[number]) {
    const legs = (journeyHails ?? [])
      .filter((h) => (h as { journey_id: string | null }).journey_id === j.id)
      .map((h) => {
        const raw = h as {
          id: string;
          leg_order: number | null;
          is_transfer_leg: boolean | null;
          status: string;
          pickup_name: string;
          pickup_lat: number | null;
          pickup_lng: number | null;
          dropoff_name: string;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          fare_jmd: number;
          distance_km: number | string | null;
          accepted_at: string | null;
          picked_up_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
        };
        return {
          id: raw.id,
          legOrder: raw.leg_order,
          isTransferLeg: raw.is_transfer_leg ?? false,
          status: hailStatusToRide(raw.status),
          pickup: {
            name: raw.pickup_name,
            lat: raw.pickup_lat,
            lng: raw.pickup_lng,
          },
          dropoff: {
            name: raw.dropoff_name,
            lat: raw.dropoff_lat,
            lng: raw.dropoff_lng,
          },
          fareJmd: raw.fare_jmd,
          distanceKm:
            raw.distance_km == null ? null : Number(raw.distance_km),
          acceptedAt: raw.accepted_at,
          pickedUpAt: raw.picked_up_at,
          completedAt: raw.completed_at,
          cancelledAt: raw.cancelled_at,
          cancellationReason: raw.cancellation_reason,
          driverName: sessionDriverByLeg.get(raw.id) ?? null,
        };
      })
      .sort((a, b) => (a.legOrder ?? 0) - (b.legOrder ?? 0));

    // requestedAt = earliest leg's accepted_at, falling back to the
    // journey's created_at if no leg has been accepted yet.
    const firstAcceptedAt = legs
      .map((l) => l.acceptedAt)
      .filter((x): x is string => !!x)
      .sort()[0];
    const lastCompletedAt = legs
      .map((l) => l.completedAt)
      .filter((x): x is string => !!x)
      .sort()
      .pop();
    const firstPickedUpAt = legs
      .map((l) => l.pickedUpAt)
      .filter((x): x is string => !!x)
      .sort()[0];

    return {
      id: j.id,
      kind: "route_taxi_journey" as const,
      status: journeyStatusToRide(j, journeyHails ?? []),
      pickup: {
        name: j.origin_name,
        address: j.origin_name,
        lat: j.origin_lat,
        lng: j.origin_lng,
        placeId: null,
      },
      dropoff: {
        name: j.destination_name,
        address: j.destination_name,
        lat: j.destination_lat,
        lng: j.destination_lng,
        placeId: null,
      },
      seats: 1,
      fareJMD: j.total_fare_jmd,
      requestedAt: j.created_at,
      acceptedAt: firstAcceptedAt ?? null,
      arrivedAt: null,
      startedAt: j.started_at ?? firstPickedUpAt ?? null,
      endedAt: j.completed_at ?? j.cancelled_at ?? lastCompletedAt ?? null,
      cancellationReason: j.cancellation_reason,
      // Journey-level driver name is the first leg's driver (rider
      // sees per-leg drivers in the detail breakdown).
      driverName: legs[0]?.driverName ?? null,
      driverRating: null,
      driverRatingCount: 0,
      myRatingStars: null,
      carpool: false,
      concession: j.concession,
      legCount: j.planned_leg_count,
      completedLegCount: j.completed_leg_count,
      legs,
    };
  }

  const merged: Row[] = [
    ...list.map(shapePrivate),
    ...(hails ?? []).map(shapeHail),
    ...(journeys ?? []).map(shapeJourney),
  ];
  merged.sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );
  const page = merged.slice(offset, offset + limit);

  return NextResponse.json({
    rides: page,
    pagination: {
      limit,
      offset,
      hasMore: merged.length > offset + limit,
    },
  });
}

type RideShapedStatus =
  | "requested"
  | "accepted"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

/**
 * Aggregate ride_ratings into average stars + count, grouped by
 * rated_id. Bulk-fetches all relevant rating rows in one query and
 * does the GROUP BY in JS — way cheaper than N getAverageRating()
 * calls when the history page renders 20+ rows.
 */
async function aggregateRatings(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  ratedUserIds: string[],
  ratedRole: "driver" | "rider",
): Promise<Map<string, { average: number; count: number }>> {
  const out = new Map<string, { average: number; count: number }>();
  if (!supabase || ratedUserIds.length === 0) return out;
  const { data } = await supabase
    .from("ride_ratings")
    .select("rated_id, stars")
    .eq("rated_role", ratedRole)
    .in("rated_id", ratedUserIds);
  if (!data) return out;
  const sums = new Map<string, { sum: number; count: number }>();
  for (const r of data) {
    const acc = sums.get(r.rated_id) ?? { sum: 0, count: 0 };
    acc.sum += r.stars ?? 0;
    acc.count += 1;
    sums.set(r.rated_id, acc);
  }
  for (const [id, { sum, count }] of sums) {
    out.set(id, {
      average: Math.round((sum / count) * 10) / 10,
      count,
    });
  }
  return out;
}
