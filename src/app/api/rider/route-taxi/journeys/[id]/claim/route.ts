import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { notifyDriver } from "@/lib/notify";
import { sendRiderHailAcceptedEmail } from "@/lib/email-templates";

/**
 * POST /api/rider/route-taxi/journeys/[id]/claim
 *
 * Rider scans a driver's session QR at the transfer point to lock
 * in that specific driver for the next leg. This is the rider-side
 * counterpart to the driver-tap-accept path — useful because:
 *
 *   - The rider has eyes on the actual car. The QR confirms "this
 *     plate, this driver" with no ambiguity.
 *   - Drivers don't have to dig through their hail list looking for
 *     the transfer passenger — the scan flips the leg to `accepted`
 *     on their behalf.
 *
 * Body: { sessionId: string }   — UUID of the driver_sessions row,
 *                                 read from the QR payload.
 *
 * Server validates:
 *   - Journey belongs to the rider.
 *   - There's a `requested` leg waiting (the one to claim).
 *   - Session is `active` and on the same corridor as the leg.
 *   - Session has a free seat.
 *
 * Then atomically claims via the same `UPDATE … WHERE status='requested'
 * AND session_id IS NULL` pattern as the existing driver-accept. If a
 * driver-tap-accept fires concurrently, the loser sees 409 — both
 * paths converge to the same outcome (one and only one driver
 * gets the leg).
 */

type Body = { sessionId?: unknown };

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: journeyId } = await ctx.params;
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

  // 1. Resolve the journey + ownership.
  const { data: journey } = await supabase
    .from("route_journeys")
    .select("id, rider_id, status")
    .eq("id", journeyId)
    .eq("rider_id", user.id)
    .maybeSingle();
  if (!journey) {
    return NextResponse.json({ error: "journey not found" }, { status: 404 });
  }
  if (journey.status !== "active") {
    return NextResponse.json(
      {
        error: `Can't claim a leg on a ${journey.status} journey.`,
      },
      { status: 409 },
    );
  }

  // 2. Find the first non-terminal leg waiting on a driver. There
  //    should be exactly one with status='requested'; if there's
  //    already an accepted leg, the rider has nothing to claim.
  const { data: legs } = await supabase
    .from("route_hails")
    .select(
      "id, route_id, status, leg_order, session_id, fare_jmd, pickup_name, dropoff_name, pickup_lat, pickup_lng",
    )
    .eq("journey_id", journey.id)
    .order("leg_order", { ascending: true });
  type LegRow = {
    id: string;
    route_id: string;
    status: string;
    leg_order: number | null;
    session_id: string | null;
    fare_jmd: number;
    pickup_name: string;
    dropoff_name: string;
    pickup_lat: number;
    pickup_lng: number;
  };
  const legRows = (legs ?? []) as LegRow[];
  const pendingLeg = legRows.find((l) => l.status === "requested");
  if (!pendingLeg) {
    return NextResponse.json(
      {
        error: "no_leg_pending",
        message:
          "There's no leg waiting to be claimed right now — your journey may already have a driver assigned, or it has wrapped.",
      },
      { status: 409 },
    );
  }

  // 3. Validate the session — must be active, on the right corridor,
  //    and have a free seat. We pull the session + driver in one go.
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
  if (session.route_id !== pendingLeg.route_id) {
    return NextResponse.json(
      {
        error: "wrong_corridor",
        message:
          "This driver isn't running the corridor your next leg is on. Find a driver on the right route.",
      },
      { status: 409 },
    );
  }
  if (session.seats_taken >= session.vehicle_capacity) {
    return NextResponse.json(
      {
        error: "vehicle_full",
        message:
          "This vehicle's full. Try another car on the same corridor.",
      },
      { status: 409 },
    );
  }

  // 4. Atomic claim. Same pattern as the driver-tap-accept path so
  //    both routes can race safely.
  const { data: claimed, error: claimError } = await supabase
    .from("route_hails")
    .update({
      session_id: session.id,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", pendingLeg.id)
    .eq("status", "requested")
    .is("session_id", null)
    .select("id, accepted_at, fare_jmd")
    .maybeSingle();
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      {
        error: "race_lost",
        message: "Another driver was assigned a moment before yours.",
      },
      { status: 409 },
    );
  }

  // 5. Hydrate driver details for the response (and the notification).
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

  // 6. Notify the driver — their app needs to see "you have a
  //    transfer passenger inbound" without them having to refresh.
  if (drv?.user_id) {
    void notifyDriver(supabase, {
      driverUserId: drv.user_id,
      kind: "trip_update",
      title: "Transfer passenger boarded",
      body: `Picking up at ${pendingLeg.pickup_name} for ${pendingLeg.dropoff_name} — JMD ${pendingLeg.fare_jmd.toLocaleString("en-JM")}.`,
      href: "/driver/route-taxi",
      cta: "Open trip",
      pushTag: `route-hail-${pendingLeg.id}`,
      pushRenotify: true,
      requireInteraction: true,
    }).catch(() => null);
  }

  // 7. Rider confirmation email (matches the regular accept path).
  if (user.email) {
    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const driverFullName = drv
      ? [drv.first_name, drv.last_name].filter(Boolean).join(" ") || "Driver"
      : "Driver";
    const vehicleDesc = drv
      ? [drv.vehicle_year ? String(drv.vehicle_year) : null, drv.vehicle_color, drv.vehicle_make, drv.vehicle_model]
          .filter(Boolean)
          .join(" ") || null
      : null;
    void sendRiderHailAcceptedEmail(user.email, {
      riderFirstName: riderProfile?.full_name ?? null,
      hailId: pendingLeg.id,
      driverName: driverFullName,
      vehicle: vehicleDesc,
      plate: drv?.plate_number ?? null,
      pickup: pendingLeg.pickup_name,
      dropoff: pendingLeg.dropoff_name,
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    leg: {
      id: pendingLeg.id,
      order: pendingLeg.leg_order,
      status: "accepted",
      acceptedAt: claimed.accepted_at,
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
