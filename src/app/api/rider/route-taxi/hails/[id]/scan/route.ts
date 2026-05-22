import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { notifyDriver } from "@/lib/notify";
import { sendRiderHailAcceptedEmail } from "@/lib/email-templates";

/**
 * POST /api/rider/route-taxi/hails/[id]/scan
 *
 * Rider's scan of a driver's session QR is the trust gate for every
 * route taxi trip. No trip can transition to `picked_up` without a
 * rider scan — same role the rider PIN plays for private rides.
 *
 * Body: { sessionId: string }   — driver_sessions.id parsed from the
 *                                 QR by the rider's scanner (or typed
 *                                 manually in the fallback path).
 *
 * Handles two starting states:
 *   - `requested` with no session attached → claim AND start in one
 *     atomic update (covers both transfer-leg arrivals and any hail
 *     where the rider physically walks up to a car running their
 *     corridor before the driver tapped accept).
 *   - `accepted` with session matching the scanned id → start (the
 *     normal flow: driver tapped accept from their hail list, rider
 *     boards and scans).
 *
 * Either way the end state is `picked_up` and the driver gets a
 * notification that the trip is live.
 *
 * Concurrency: every state-changing UPDATE carries a
 * `.eq("status", expected)` guard so a parallel write (e.g. driver
 * cancels in the same tick) can't squeak through silently — the
 * second write returns 0 rows and we 409 the loser.
 */

type Body = { sessionId?: unknown };

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: hailId } = await ctx.params;
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required (from the driver's QR)." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // 1. Load the hail. Ownership-gated so a stale id from another
  //    account can't probe trip state.
  const { data: hailRow } = await supabase
    .from("route_hails")
    .select(
      "id, rider_id, route_id, session_id, status, fare_jmd, pickup_name, dropoff_name, pickup_lat, pickup_lng, journey_id, leg_order, is_transfer_leg",
    )
    .eq("id", hailId)
    .eq("rider_id", user.id)
    .maybeSingle();
  type HailRow = {
    id: string;
    rider_id: string;
    route_id: string;
    session_id: string | null;
    status: string;
    fare_jmd: number;
    pickup_name: string;
    dropoff_name: string;
    pickup_lat: number;
    pickup_lng: number;
    journey_id: string | null;
    leg_order: number | null;
    is_transfer_leg: boolean;
  };
  const hail = hailRow as HailRow | null;
  if (!hail) {
    return NextResponse.json({ error: "hail not found" }, { status: 404 });
  }
  if (hail.status !== "requested" && hail.status !== "accepted") {
    return NextResponse.json(
      {
        error: `Can't start trip — this hail is already in status "${hail.status}".`,
      },
      { status: 409 },
    );
  }
  if (hail.status === "accepted" && hail.session_id !== sessionId) {
    return NextResponse.json(
      {
        error: "wrong_session",
        message:
          "You scanned a different driver's QR than the one assigned to your trip. Scan the matching car.",
      },
      { status: 409 },
    );
  }

  // 2. Validate the session — must be active, on the right corridor.
  //    For accepted hails the session_id is already pinned (checked
  //    above); we still re-read to verify it's actually `active` (a
  //    driver who ended their session mid-trip is an edge case).
  const { data: sess } = await supabase
    .from("driver_sessions")
    .select(
      "id, driver_id, route_id, status, seats_taken, vehicle_capacity",
    )
    .eq("id", sessionId)
    .maybeSingle();
  type SessionRow = {
    id: string;
    driver_id: string;
    route_id: string;
    status: string;
    seats_taken: number;
    vehicle_capacity: number;
  };
  const session = sess as SessionRow | null;
  if (!session) {
    return NextResponse.json(
      {
        error: "session_not_found",
        message:
          "That QR doesn't match an active driver session. Ask the driver to refresh their screen.",
      },
      { status: 404 },
    );
  }
  if (session.status !== "active") {
    return NextResponse.json(
      {
        error: "session_not_active",
        message: "This driver's session isn't running right now.",
      },
      { status: 409 },
    );
  }
  if (session.route_id !== hail.route_id) {
    return NextResponse.json(
      {
        error: "wrong_corridor",
        message:
          "This driver isn't running the corridor your trip is on. Find a driver on the right route.",
      },
      { status: 409 },
    );
  }
  // Free-seat gate only matters when we're also claiming. If the hail
  // is already accepted, the seat is already factored in.
  if (
    hail.status === "requested" &&
    session.seats_taken >= session.vehicle_capacity
  ) {
    return NextResponse.json(
      {
        error: "vehicle_full",
        message:
          "This vehicle's full. Try another car on the same corridor.",
      },
      { status: 409 },
    );
  }

  // 3. State transition. Two paths converge on `picked_up`:
  //    (a) requested + no session → set session_id, mark accepted_at
  //        AND picked_up_at in the same row write.
  //    (b) accepted (session matches) → just stamp picked_up_at.
  //
  //    Both use `.eq("status", expected)` for optimistic concurrency.
  const nowIso = new Date().toISOString();
  type UpdatedRow = {
    id: string;
    accepted_at: string | null;
    picked_up_at: string | null;
  };
  let updated: UpdatedRow | null = null;

  if (hail.status === "requested") {
    const { data, error } = await supabase
      .from("route_hails")
      .update({
        session_id: session.id,
        status: "picked_up",
        accepted_at: nowIso,
        picked_up_at: nowIso,
      })
      .eq("id", hail.id)
      .eq("status", "requested")
      .is("session_id", null)
      .select("id, accepted_at, picked_up_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    updated = (data as UpdatedRow | null) ?? null;
  } else {
    // status === "accepted"
    const { data, error } = await supabase
      .from("route_hails")
      .update({
        status: "picked_up",
        picked_up_at: nowIso,
      })
      .eq("id", hail.id)
      .eq("status", "accepted")
      .eq("session_id", session.id)
      .select("id, accepted_at, picked_up_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    updated = (data as UpdatedRow | null) ?? null;
  }

  if (!updated) {
    return NextResponse.json(
      {
        error: "race_lost",
        message:
          "Your trip state changed while you were scanning — refresh and try again.",
      },
      { status: 409 },
    );
  }

  // 4. Hydrate driver for response + notifications.
  const { data: driver } = await supabase
    .from("drivers")
    .select(
      "id, user_id, first_name, last_name, plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color",
    )
    .eq("id", session.driver_id)
    .maybeSingle();
  type DriverRow = {
    id: string;
    user_id: string | null;
    first_name: string | null;
    last_name: string | null;
    plate_number: string | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    vehicle_year: number | null;
    vehicle_color: string | null;
  };
  const drv = driver as DriverRow | null;

  // 5. Notify the driver — their app needs to flip from "waiting for
  //    rider scan" to "trip in progress" without them having to
  //    refresh.
  if (drv?.user_id) {
    void notifyDriver(supabase, {
      driverUserId: drv.user_id,
      kind: "trip_update",
      title: "Trip started",
      body: `Rider scanned in — heading to ${hail.dropoff_name}.`,
      href: "/driver/route-taxi",
      cta: "Open trip",
      pushTag: `route-hail-${hail.id}`,
      pushRenotify: true,
      requireInteraction: true,
    }).catch(() => null);
  }

  // 6. If this scan also did the accept (state was requested), send
  //    the rider an "accepted" confirmation email — matches the
  //    behaviour of the previous driver-tap-accept path so the
  //    receipt trail looks identical regardless of who initiated.
  if (hail.status === "requested" && user.email && drv) {
    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const driverFullName =
      [drv.first_name, drv.last_name].filter(Boolean).join(" ") || "Driver";
    const vehicleDesc =
      [
        drv.vehicle_year ? String(drv.vehicle_year) : null,
        drv.vehicle_color,
        drv.vehicle_make,
        drv.vehicle_model,
      ]
        .filter(Boolean)
        .join(" ") || null;
    void sendRiderHailAcceptedEmail(user.email, {
      riderFirstName: riderProfile?.full_name ?? null,
      hailId: hail.id,
      driverName: driverFullName,
      vehicle: vehicleDesc,
      plate: drv.plate_number ?? null,
      pickup: hail.pickup_name,
      dropoff: hail.dropoff_name,
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    hail: {
      id: hail.id,
      status: "picked_up" as const,
      acceptedAt: updated.accepted_at,
      pickedUpAt: updated.picked_up_at,
    },
    driver: drv
      ? {
          firstName: drv.first_name,
          lastName: drv.last_name,
          plate: drv.plate_number,
          vehicleMake: drv.vehicle_make,
          vehicleModel: drv.vehicle_model,
          vehicleColor: drv.vehicle_color,
        }
      : null,
  });
}
