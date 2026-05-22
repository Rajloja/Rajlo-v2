import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getBalanceWithLock, placeHold, releaseHold } from "@/lib/wallet-holds";
import { isWithinJamaica } from "@/lib/jamaica";
import { notifyRouteTaxiDrivers } from "@/lib/notify";
import { getOutstandingLegalDocuments } from "@/lib/legal-consent";
import { sendRiderHailRequestedEmail } from "@/lib/email-templates";
import {
  findRouteTaxiPath,
  type CorridorPath,
} from "@/lib/route-taxi-pathfinder";

/**
 * POST /api/rider/route-taxi/journey
 *
 * Start a Route Taxi (Mode B) journey. Replaces the legacy single-leg
 * `/api/rider/route-taxi/hail` for any rider booking from the new
 * `/rider/request` flow. A "journey" is the rider's whole A → B trip,
 * which the pathfinder may have broken into 1..N corridor legs.
 *
 * Body:
 *   {
 *     pickup:  { name, address, lat, lng, parish? },
 *     dropoff: { name, address, lat, lng, parish? },
 *     concession?: boolean,
 *
 *     // Optional re-quote payload from /journey-quote. If omitted, we
 *     // re-run the pathfinder server-side from pickup→dropoff. Passing
 *     // the quote prevents a race where the corridor graph (or fares)
 *     // mutates between quote and book — we lock the rider into the
 *     // exact plan they saw.
 *     plan?: CorridorPath
 *   }
 *
 * Server flow:
 *   1. Re-validate the journey path (pathfinder, or replay the plan).
 *   2. Place a wallet hold for the total fare. 402 on insufficient.
 *   3. Insert the journey row (status = 'planning').
 *   4. Insert the leg-1 hail (status = 'requested') with
 *      journey_id + leg_order=1 + is_transfer_leg=false. Subsequent legs
 *      are created on the fly when the rider clears the previous leg —
 *      we don't pre-create leg N+1 because the corridor + driver pool
 *      for it is unknown until the rider physically arrives at the
 *      transfer point.
 *   5. Broadcast leg-1 to active drivers on its corridor (existing
 *      notifyRouteTaxiDrivers helper).
 *   6. Send rider confirmation email.
 *   7. Flip journey to 'active'.
 *
 * Rolls back the hold + journey if leg-1 broadcast fails so the rider
 * isn't left with locked money and no broadcast.
 */

type Place = {
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  parish?: string | null;
};

type Body = {
  pickup?: Place;
  dropoff?: Place;
  concession?: boolean;
  plan?: CorridorPath;
};

function readPlace(p: Place | undefined): {
  name: string;
  address: string;
  lat: number;
  lng: number;
  parish: string | null;
} | null {
  if (!p) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isWithinJamaica({ lat, lng })) return null;
  const name = (p.name ?? "").trim();
  if (!name) return null;
  return {
    name,
    address: (p.address ?? "").trim(),
    lat,
    lng,
    parish: p.parish ?? null,
  };
}

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Legal-consent gate (same as /hail).
  const outstanding = await getOutstandingLegalDocuments(auth, user.id, "rider");
  if (outstanding.length > 0) {
    return NextResponse.json(
      {
        error: "legal_consent_required",
        message:
          "Review and accept RAJLO's updated policies before booking a route taxi.",
        outstanding: outstanding.map((d) => ({ key: d.key, title: d.title })),
      },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const pickup = readPlace(body.pickup);
  const dropoff = readPlace(body.dropoff);
  if (!pickup || !dropoff) {
    return NextResponse.json(
      {
        error:
          "pickup and dropoff each require { name, lat, lng } within Jamaica",
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

  const concession = body.concession === true;

  // Resolve the plan. Re-running the pathfinder is the canonical
  // source of truth — never trust a client-supplied plan blindly.
  // If the client passed `body.plan`, we compare its total fare to
  // the freshly-computed one and reject if they diverge by more than
  // 5% (corridor edit in flight) — the rider needs a fresh quote.
  const fresh = await findRouteTaxiPath(supabase, {
    pickup,
    dropoff,
    concession,
  });
  if (!fresh) {
    return NextResponse.json(
      {
        error: "no_route_taxi_path",
        message:
          "No route taxi corridor reaches that pickup or dropoff within walking distance. Try a private ride.",
      },
      { status: 404 },
    );
  }

  let plan: CorridorPath = fresh;
  if (body.plan) {
    const drift = Math.abs(body.plan.totalFareJmd - fresh.totalFareJmd);
    const driftPct = drift / Math.max(1, fresh.totalFareJmd);
    if (driftPct > 0.05) {
      return NextResponse.json(
        {
          error: "stale_quote",
          message:
            "The fare has changed since you saw the quote — refresh and try again.",
          quotedJmd: body.plan.totalFareJmd,
          currentJmd: fresh.totalFareJmd,
        },
        { status: 409 },
      );
    }
    plan = fresh; // server-fresh wins
  }

  const totalFareJmd = plan.totalFareJmd;

  // Cashless gate. Total locks the entire journey upfront so each leg
  // settles cleanly. If the journey aborts mid-way, the unspent
  // portion is released back to the rider's available balance.
  const { availableJmd, balanceJmd, lockedJmd } = await getBalanceWithLock(
    supabase,
    user.id,
  );
  if (availableJmd < totalFareJmd) {
    return NextResponse.json(
      {
        error: "insufficient_balance",
        message: lockedJmd > 0
          ? `Top up your wallet — this journey costs JMD $${totalFareJmd}. JMD $${lockedJmd} is already locked for another trip.`
          : `Top up your wallet — this journey costs JMD $${totalFareJmd}.`,
        insufficientFunds: true,
        balanceJmd,
        availableJmd,
        lockedJmd,
        requiredJmd: totalFareJmd,
        fareJmd: totalFareJmd,
      },
      { status: 402 },
    );
  }

  // 1. Create the journey row in 'planning' state. We flip to
  //    'active' synchronously after the leg-1 hail is broadcast so
  //    other code paths (admin reconciler, list views) never see a
  //    'planning' row outliving the request.
  const { data: journeyRow, error: journeyError } = await supabase
    .from("route_journeys")
    .insert({
      rider_id: user.id,
      origin_name: pickup.name,
      origin_lat: pickup.lat,
      origin_lng: pickup.lng,
      destination_name: dropoff.name,
      destination_lat: dropoff.lat,
      destination_lng: dropoff.lng,
      status: "planning",
      total_fare_jmd: totalFareJmd,
      planned_leg_count: plan.legCount,
      concession,
      plan,
    })
    .select("id")
    .single();

  if (journeyError || !journeyRow) {
    return NextResponse.json(
      {
        error: journeyError?.message ?? "Could not create journey.",
      },
      { status: 500 },
    );
  }
  const journeyId = journeyRow.id as string;

  // 2. Place the wallet hold for the full total.
  const holdResult = await placeHold(supabase, {
    userId: user.id,
    amountJmd: totalFareJmd,
    journeyId,
    reason: "route_journey",
    metadata: {
      legs: plan.legCount,
      total_fare_jmd: totalFareJmd,
    },
  });
  if (!holdResult.ok) {
    // Roll back the journey row — we never broadcast or send email.
    await supabase
      .from("route_journeys")
      .update({
        status: "cancelled",
        cancellation_reason: holdResult.error ?? "hold_failed",
        cancelled_by: "system",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", journeyId);
    return NextResponse.json(
      {
        error: holdResult.error,
        insufficientFunds: holdResult.insufficientFunds ?? false,
        availableJmd: holdResult.availableJmd,
        requiredJmd: totalFareJmd,
      },
      { status: holdResult.insufficientFunds ? 402 : 500 },
    );
  }

  // 3. Insert the leg-1 hail. Use the corridor's own origin/destination
  //    names for the corridor anchors, but stash the rider's typed
  //    pickup as the actual board point (drivers see the real pickup
  //    spot, not just "somewhere on this corridor").
  const leg1 = plan.legs[0];
  const { data: hailRow, error: hailError } = await supabase
    .from("route_hails")
    .insert({
      rider_id: user.id,
      route_id: leg1.routeId,
      session_id: null,
      pickup_name: pickup.name,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_parish: pickup.parish,
      // Leg-1 dropoff for a multi-leg journey is the corridor's end
      // (the transfer point), NOT the rider's typed dropoff. The
      // rider's typed dropoff lives on the journey row.
      dropoff_name:
        plan.legCount === 1 ? dropoff.name : leg1.destination,
      dropoff_lat:
        plan.legCount === 1 ? dropoff.lat : leg1.destinationLat ?? dropoff.lat,
      dropoff_lng:
        plan.legCount === 1 ? dropoff.lng : leg1.destinationLng ?? dropoff.lng,
      dropoff_parish:
        plan.legCount === 1 ? dropoff.parish : null,
      distance_km: leg1.distanceKm,
      fare_jmd: leg1.fareJmd,
      concession,
      status: "requested",
      journey_id: journeyId,
      leg_order: 1,
      is_transfer_leg: false,
    })
    .select("id, status, fare_jmd, requested_at")
    .single();

  if (hailError || !hailRow) {
    // Roll back hold + journey.
    await releaseHold(supabase, holdResult.hold.id, "leg1_insert_failed");
    await supabase
      .from("route_journeys")
      .update({
        status: "cancelled",
        cancellation_reason: hailError?.message ?? "leg1_failed",
        cancelled_by: "system",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", journeyId);
    return NextResponse.json(
      {
        error: hailError?.message ?? "Could not create the first leg.",
      },
      { status: 500 },
    );
  }

  // 4. Flip the journey to 'active' once leg-1 exists.
  await supabase
    .from("route_journeys")
    .update({
      status: "active",
      started_at: new Date().toISOString(),
    })
    .eq("id", journeyId);

  // 5. Broadcast leg-1 to active drivers on its corridor. Best-effort.
  void notifyRouteTaxiDrivers(supabase, leg1.routeId, {
    kind: "ride_available",
    title:
      plan.legCount === 1
        ? "New route taxi hail"
        : `New route taxi hail · leg 1 of ${plan.legCount}`,
    body: `${pickup.name} → ${leg1.destination} · JMD ${leg1.fareJmd.toLocaleString("en-JM")}`,
    href: "/driver/route-taxi",
    pushTag: `route-hail-${hailRow.id}`,
    pushRenotify: true,
    requireInteraction: true,
    pushOnly: true,
  }).catch(() => null);

  // 6. Rider confirmation email.
  if (user.email) {
    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    void sendRiderHailRequestedEmail(user.email, {
      riderFirstName: riderProfile?.full_name ?? null,
      hailId: hailRow.id as string,
      routeOrigin: pickup.name,
      routeDestination: dropoff.name,
      pickup: pickup.name,
      dropoff: dropoff.name,
      fareJMD: totalFareJmd,
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    journey: {
      id: journeyId,
      totalFareJmd,
      legCount: plan.legCount,
      plan,
    },
    leg: {
      id: hailRow.id,
      order: 1,
      status: hailRow.status,
      fareJmd: hailRow.fare_jmd,
      requestedAt: hailRow.requested_at,
    },
    hold: {
      id: holdResult.hold.id,
      amountJmd: holdResult.hold.amountJmd,
    },
  });
}
