import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  buildRoomName,
  isLiveKitConfigured,
  livekitWsUrl,
  mintCallToken,
} from "@/lib/livekit";
import { notifyRider, notifyDriver } from "@/lib/notify";

/**
 * POST /api/calls/start
 *
 * Caller opens a voice call to the other party on a specific trip.
 * Validates:
 *   1. Caller is authenticated.
 *   2. Caller is actually a party to the trip (rider or driver).
 *   3. The trip is in a state where calling makes sense (accepted /
 *      in_progress — not completed or cancelled).
 *   4. There isn't already an active call on the trip (no double-dial).
 *
 * Creates a `calls` row, generates a LiveKit token for the caller,
 * and fires a push notification to the callee. The callee's client
 * uses GET /api/calls/token to mint their own token and join the
 * same LiveKit room.
 *
 * Body (exactly one of `rideId`, `hailId`, `journeyId`):
 *   { rideId?: string, hailId?: string, journeyId?: string }
 *
 * Response:
 *   { call: { id, roomName, status }, token, livekitUrl }
 */

type Body = {
  rideId?: string;
  hailId?: string;
  journeyId?: string;
};

export async function POST(request: Request) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      {
        error: "voice_calls_unavailable",
        message:
          "Voice calling isn't configured on this deployment yet. Reach out to support if you need to contact your driver.",
      },
      { status: 503 },
    );
  }

  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const tripCount = [body.rideId, body.hailId, body.journeyId].filter(
    Boolean,
  ).length;
  if (tripCount !== 1) {
    return NextResponse.json(
      {
        error: "trip_context_required",
        message:
          "Exactly one of rideId, hailId, or journeyId must be supplied.",
      },
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

  // Resolve the trip + the other party.
  const ctx = await resolveTripContext(supabase, user.id, body);
  if ("error" in ctx) {
    return NextResponse.json(
      { error: ctx.error, message: ctx.message },
      { status: ctx.status },
    );
  }
  const { callerRole, calleeUserId, calleeDisplayName, callerDisplayName, kind, tripId } =
    ctx;

  // Block if there's already an active call on this trip — avoids
  // the confusing "two phones ringing" state if the caller double-
  // taps. BUT: abandoned rows are common (caller closed the tab
  // mid-ring, browser crashed, network drop with no clean hangup).
  // Without auto-expiry the next call attempt would forever return
  // "call_in_progress". So we treat rows older than the thresholds
  // below as stale and re-claim them.
  //
  //   initiated / ringing → 90 s (a real callee picks up well
  //                                before this)
  //   accepted            → 60 min (real voice calls don't run
  //                                  longer; if they do, the row
  //                                  is almost certainly a stuck
  //                                  WebRTC session)
  const tripFilter =
    kind === "ride"
      ? { ride_id: tripId }
      : kind === "hail"
        ? { hail_id: tripId }
        : { journey_id: tripId };

  const { data: existingCalls } = await supabase
    .from("calls")
    .select("id, status, started_at, accepted_at")
    .match(tripFilter)
    .in("status", ["initiated", "ringing", "accepted"])
    .order("started_at", { ascending: false })
    .limit(1);
  const active = existingCalls?.[0];
  if (active) {
    const ageMs = Date.now() - new Date(active.started_at).getTime();
    const RING_STALE_MS = 90 * 1000;
    const ACCEPTED_STALE_MS = 60 * 60 * 1000;
    const stale =
      (["initiated", "ringing"].includes(active.status) &&
        ageMs > RING_STALE_MS) ||
      (active.status === "accepted" && ageMs > ACCEPTED_STALE_MS);
    if (stale) {
      // Sweep the stale row before letting the new call proceed.
      // status=missed for ringing/initiated, ended otherwise — gives
      // support an honest record of what really happened.
      await supabase
        .from("calls")
        .update({
          status: ["initiated", "ringing"].includes(active.status)
            ? "missed"
            : "ended",
          ended_at: new Date().toISOString(),
          end_reason: "stale_cleanup",
        })
        .eq("id", active.id);
      // Fall through — we now claim the trip is free.
    } else {
      return NextResponse.json(
        {
          error: "call_in_progress",
          message: "A call on this trip is already in progress.",
          call: { id: active.id, status: active.status },
        },
        { status: 409 },
      );
    }
  }

  // Build the room + tokens, persist the row, then return.
  const now = Date.now();
  const roomName = buildRoomName(kind, tripId, now);

  const { data: callRow, error: insertErr } = await supabase
    .from("calls")
    .insert({
      ride_id: kind === "ride" ? tripId : null,
      hail_id: kind === "hail" ? tripId : null,
      journey_id: kind === "journey" ? tripId : null,
      caller_id: user.id,
      callee_id: calleeUserId,
      caller_role: callerRole,
      room_name: roomName,
      status: "initiated",
    })
    .select("id, room_name, status, started_at")
    .single();

  if (insertErr || !callRow) {
    return NextResponse.json(
      { error: insertErr?.message ?? "could not create call" },
      { status: 500 },
    );
  }

  const callerToken = await mintCallToken({
    roomName,
    identity: user.id,
    displayName: callerDisplayName,
  });

  // Fire the push notification to the callee. Best-effort — the
  // Realtime subscription on `calls` is the primary signal; push is
  // the redundant fallback when the app is backgrounded.
  const notifyTarget =
    callerRole === "rider"
      ? notifyDriver(supabase, {
          driverUserId: calleeUserId,
          kind: "trip_update",
          title: `Incoming call · ${callerDisplayName}`,
          body: "Your passenger is calling.",
          href: `/driver/route-taxi?call=${callRow.id}`,
          pushTag: `call-${callRow.id}`,
          pushRenotify: true,
          requireInteraction: true,
          pushOnly: true,
        })
      : notifyRider(supabase, {
          riderId: calleeUserId,
          kind: "trip",
          title: `Incoming call · ${callerDisplayName}`,
          body: "Your driver is calling.",
          href: `/rider/live-trip?call=${callRow.id}`,
          pushTag: `call-${callRow.id}`,
          pushRenotify: true,
          pushOnly: true,
        });
  void notifyTarget.catch(() => null);

  // Mark the row as ringing once we've fired the notification, so
  // both clients see the same state via Realtime.
  await supabase
    .from("calls")
    .update({
      status: "ringing",
      ringing_at: new Date().toISOString(),
    })
    .eq("id", callRow.id);

  return NextResponse.json({
    call: {
      id: callRow.id,
      roomName: callRow.room_name,
      status: "ringing",
      callerRole,
      callerDisplayName,
      calleeDisplayName,
      tripKind: kind,
      tripId,
    },
    token: callerToken,
    livekitUrl: livekitWsUrl(),
  });
}

/**
 * Look up the trip referenced in the body, confirm the caller is a
 * party to it, and resolve the other party + display names. Returns
 * either a populated context or an error shape the route handler
 * can return directly.
 */
async function resolveTripContext(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  callerUserId: string,
  body: Body,
): Promise<
  | {
      kind: "ride" | "hail" | "journey";
      tripId: string;
      callerRole: "rider" | "driver";
      calleeUserId: string;
      callerDisplayName: string;
      calleeDisplayName: string;
    }
  | { error: string; message: string; status: number }
> {
  if (body.rideId) {
    const { data: ride } = await supabase
      .from("rides")
      .select("id, rider_id, driver_id, status")
      .eq("id", body.rideId)
      .maybeSingle();
    if (!ride) {
      return { error: "ride_not_found", message: "Ride not found.", status: 404 };
    }
    if (!["accepted", "arrived", "in_progress"].includes(ride.status)) {
      return {
        error: "call_not_allowed",
        message:
          "Voice calls are only available between accepting the ride and completing it.",
        status: 409,
      };
    }
    // Resolve driver row → driver user_id.
    const { data: driver } = ride.driver_id
      ? await supabase
          .from("drivers")
          .select("user_id, first_name, last_name")
          .eq("id", ride.driver_id)
          .maybeSingle()
      : { data: null };
    if (!driver?.user_id) {
      return {
        error: "no_driver_yet",
        message: "Your driver hasn't been assigned yet.",
        status: 409,
      };
    }
    if (callerUserId === ride.rider_id) {
      return {
        kind: "ride",
        tripId: ride.id,
        callerRole: "rider",
        calleeUserId: driver.user_id,
        callerDisplayName: await resolveRiderName(supabase, ride.rider_id),
        calleeDisplayName:
          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
          "Driver",
      };
    }
    if (callerUserId === driver.user_id) {
      return {
        kind: "ride",
        tripId: ride.id,
        callerRole: "driver",
        calleeUserId: ride.rider_id,
        callerDisplayName:
          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
          "Driver",
        calleeDisplayName: await resolveRiderName(supabase, ride.rider_id),
      };
    }
    return {
      error: "forbidden",
      message: "You're not a party to this trip.",
      status: 403,
    };
  }

  if (body.hailId) {
    const { data: hail } = await supabase
      .from("route_hails")
      .select("id, rider_id, session_id, status")
      .eq("id", body.hailId)
      .maybeSingle();
    if (!hail) {
      return { error: "hail_not_found", message: "Hail not found.", status: 404 };
    }
    if (!["accepted", "picked_up"].includes(hail.status)) {
      return {
        error: "call_not_allowed",
        message: "Voice calls open once a driver accepts your hail.",
        status: 409,
      };
    }
    if (!hail.session_id) {
      return {
        error: "no_driver_yet",
        message: "Your driver isn't connected yet.",
        status: 409,
      };
    }
    const { data: session } = await supabase
      .from("driver_sessions")
      .select("driver_id")
      .eq("id", hail.session_id)
      .maybeSingle();
    const { data: driver } = session?.driver_id
      ? await supabase
          .from("drivers")
          .select("user_id, first_name, last_name")
          .eq("id", session.driver_id)
          .maybeSingle()
      : { data: null };
    if (!driver?.user_id) {
      return {
        error: "no_driver_yet",
        message: "Your driver isn't connected yet.",
        status: 409,
      };
    }
    if (callerUserId === hail.rider_id) {
      return {
        kind: "hail",
        tripId: hail.id,
        callerRole: "rider",
        calleeUserId: driver.user_id,
        callerDisplayName: await resolveRiderName(supabase, hail.rider_id),
        calleeDisplayName:
          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
          "Driver",
      };
    }
    if (callerUserId === driver.user_id) {
      return {
        kind: "hail",
        tripId: hail.id,
        callerRole: "driver",
        calleeUserId: hail.rider_id,
        callerDisplayName:
          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
          "Driver",
        calleeDisplayName: await resolveRiderName(supabase, hail.rider_id),
      };
    }
    return {
      error: "forbidden",
      message: "You're not a party to this hail.",
      status: 403,
    };
  }

  if (body.journeyId) {
    // Journey calls dial the rider's CURRENT-leg driver (the one
    // physically with them right now). Surface the active leg, then
    // delegate the rest to the hail resolver.
    const { data: journey } = await supabase
      .from("route_journeys")
      .select("id, rider_id, status")
      .eq("id", body.journeyId)
      .maybeSingle();
    if (!journey) {
      return {
        error: "journey_not_found",
        message: "Journey not found.",
        status: 404,
      };
    }
    if (!["active", "planning"].includes(journey.status)) {
      return {
        error: "call_not_allowed",
        message: "Voice calls are only available during an active journey.",
        status: 409,
      };
    }
    const { data: activeLeg } = await supabase
      .from("route_hails")
      .select("id, session_id, status, rider_id")
      .eq("journey_id", journey.id)
      .in("status", ["accepted", "picked_up"])
      .order("leg_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!activeLeg?.session_id) {
      return {
        error: "no_driver_yet",
        message: "Your current-leg driver isn't connected yet.",
        status: 409,
      };
    }
    // Reuse the hail flow but write the call to journey_id so the
    // record stays at the journey level (one call per journey, not
    // one per leg). Resolve the leg's driver:
    const { data: session } = await supabase
      .from("driver_sessions")
      .select("driver_id")
      .eq("id", activeLeg.session_id)
      .maybeSingle();
    const { data: driver } = session?.driver_id
      ? await supabase
          .from("drivers")
          .select("user_id, first_name, last_name")
          .eq("id", session.driver_id)
          .maybeSingle()
      : { data: null };
    if (!driver?.user_id) {
      return {
        error: "no_driver_yet",
        message: "Your current-leg driver isn't connected yet.",
        status: 409,
      };
    }
    if (callerUserId === journey.rider_id) {
      return {
        kind: "journey",
        tripId: journey.id,
        callerRole: "rider",
        calleeUserId: driver.user_id,
        callerDisplayName: await resolveRiderName(supabase, journey.rider_id),
        calleeDisplayName:
          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
          "Driver",
      };
    }
    if (callerUserId === driver.user_id) {
      return {
        kind: "journey",
        tripId: journey.id,
        callerRole: "driver",
        calleeUserId: journey.rider_id,
        callerDisplayName:
          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
          "Driver",
        calleeDisplayName: await resolveRiderName(supabase, journey.rider_id),
      };
    }
    return {
      error: "forbidden",
      message: "You're not a party to this journey.",
      status: 403,
    };
  }

  return {
    error: "trip_context_required",
    message: "Exactly one of rideId, hailId, journeyId is required.",
    status: 400,
  };
}

async function resolveRiderName(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.full_name as string | null) ?? "Passenger";
}
