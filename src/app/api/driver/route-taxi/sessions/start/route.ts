import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { allocateUniquePickupCode } from "@/lib/route-taxi-pickup-code";

/**
 * POST /api/driver/route-taxi/sessions/start
 *
 * Driver opens a Route Taxi session pinned to one TA route + direction.
 * Riders hailing on this route now match against this session.
 *
 * Body:
 *   { routeId: string, direction?: 'forward'|'reverse', vehicleCapacity?: number }
 *
 * The DB enforces "one active session per driver" via a partial unique
 * index — re-calling start while a session is open returns 409.
 */
type StartBody = {
  routeId?: string;
  direction?: "forward" | "reverse";
  vehicleCapacity?: number;
};

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: StartBody;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.routeId) {
    return NextResponse.json({ error: "routeId is required" }, { status: 400 });
  }
  const direction = body.direction ?? "forward";
  if (direction !== "forward" && direction !== "reverse") {
    return NextResponse.json(
      { error: "direction must be 'forward' or 'reverse'" },
      { status: 400 },
    );
  }
  const capacity = body.vehicleCapacity ?? 4;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) {
    return NextResponse.json(
      { error: "vehicleCapacity must be 1–16" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  // Resolve the auth.users row → drivers row (sessions are pinned to the
  // driver record, not the auth user — same way other driver endpoints work).
  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id, activated, onboarding_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (driverError || !driver) {
    return NextResponse.json(
      { error: "Driver record not found" },
      { status: 404 },
    );
  }
  if (!driver.activated || driver.onboarding_status !== "approved") {
    return NextResponse.json(
      { error: "Driver is not activated; complete TA verification first." },
      { status: 403 },
    );
  }

  // Confirm the route exists and is active.
  const { data: route } = await supabase
    .from("routes")
    .select("id, origin_name, destination_name")
    .eq("id", body.routeId)
    .eq("active", true)
    .maybeSingle();

  if (!route) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }

  // Allocate a short pickup code for the rider's manual-entry
  // fallback. The partial-unique index on (pickup_code where
  // status='active') guarantees no two live sessions share a code at
  // any moment; the allocator retries on collision before insert.
  // Falls through to null if we genuinely can't find a free code —
  // session still starts, just without a manual fallback.
  const pickupCode = await allocateUniquePickupCode(supabase);

  // Insert the session. The partial unique index
  // `ux_driver_sessions_one_active_per_driver` raises a unique-violation
  // (Postgres SQLSTATE 23505) if the driver already has an active session.
  const { data: session, error: sessionError } = await supabase
    .from("driver_sessions")
    .insert({
      driver_id: driver.id,
      route_id: route.id,
      direction,
      vehicle_capacity: capacity,
      seats_taken: 0,
      status: "active",
      pickup_code: pickupCode,
    })
    .select(
      "id, route_id, direction, vehicle_capacity, seats_taken, status, started_at, pickup_code",
    )
    .single();

  if (sessionError || !session) {
    const isDuplicate =
      typeof sessionError?.code === "string" && sessionError.code === "23505";
    return NextResponse.json(
      {
        error: isDuplicate
          ? "You already have an active session — end it before starting a new one."
          : (sessionError?.message ?? "Failed to start session"),
      },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      routeId: session.route_id,
      direction: session.direction,
      vehicleCapacity: session.vehicle_capacity,
      seatsTaken: session.seats_taken,
      status: session.status,
      startedAt: session.started_at,
      pickupCode: session.pickup_code ?? null,
      route: {
        origin: route.origin_name,
        destination: route.destination_name,
      },
    },
  });
}
