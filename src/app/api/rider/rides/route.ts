import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { tryMatchCarpool } from "@/lib/carpool-matcher";
import { computeRideExpiry } from "@/lib/ride-expiry";
import { sendRideRequestedEmail } from "@/lib/email-templates";
import { notifyRider, notifyAllAvailableDrivers } from "@/lib/notify";
import { resolveRidePin } from "@/lib/pin-verify";
import { getOutstandingLegalDocuments } from "@/lib/legal-consent";
import { FEE_UNCOLLECTED_STATUS } from "@/lib/cancellation-fees";
import { getBalanceWithLock } from "@/lib/wallet-holds";
import { nearestParish } from "@/lib/jamaica";

/**
 * POST /api/rider/rides
 *
 * Rider creates a new ride request.
 *
 * Body shape:
 *   {
 *     pickup:  { name, address, lat, lng, parish?, placeId? }
 *     dropoff: { name, address, lat, lng, parish?, placeId? }
 *     stops:   [{ name, address, lat, lng, parish?, placeId? }, ...]
 *     seats:   1..4
 *     notes?:  string
 *     fare:    { totalKm, etaMinutes, fareJMD }
 *   }
 *
 * Response: { ok, rideId }
 *
 * Server-side validation: signed in, rider role, pickup + dropoff present.
 * The actual ride row + stops are inserted with `service_role` so RLS
 * policies don't fight a multi-step transaction.
 */

type PlacePayload = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  parish?: string | null;
  placeId?: string | null;
};

type CreateRideRequest = {
  pickup: PlacePayload;
  dropoff: PlacePayload;
  stops: PlacePayload[];
  seats: number;
  notes?: string;
  fare: {
    totalKm: number;
    etaMinutes: number;
    fareJMD: number;
  };
  /** Phase 2A.3: rider opted into carpool/ride-share. When true, the
   *  server tries to match this ride with another opt-in ride going
   *  the same way and reduces the fare on both. */
  allowCarpool?: boolean;
};

function isPlace(p: unknown): p is PlacePayload {
  if (!p || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  return (
    typeof x.name === "string" &&
    typeof x.address === "string" &&
    typeof x.lat === "number" &&
    typeof x.lng === "number"
  );
}

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Only riders can create rides.
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "rider") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Legal-consent gate: a rider may not request a trip until they have
  // accepted every required policy at its current version. The consent
  // modal enforces this in the UI; this 403 is the server-side
  // guarantee that a tampered client can't bypass it.
  const outstandingLegal = await getOutstandingLegalDocuments(
    auth,
    user.id,
    "rider",
  );
  if (outstandingLegal.length > 0) {
    return NextResponse.json(
      {
        error: "legal_consent_required",
        message:
          "Review and accept RAJLO's updated policies before requesting a trip.",
        outstanding: outstandingLegal.map((d) => ({
          key: d.key,
          title: d.title,
        })),
      },
      { status: 403 },
    );
  }

  const body = (await request.json()) as CreateRideRequest;
  if (!isPlace(body?.pickup) || !isPlace(body?.dropoff)) {
    return NextResponse.json(
      { error: "Pickup and dropoff are required" },
      { status: 400 },
    );
  }
  const seats = Number(body.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > 4) {
    return NextResponse.json(
      { error: "Seats must be between 1 and 4" },
      { status: 400 },
    );
  }
  const stops = Array.isArray(body.stops) ? body.stops.filter(isPlace) : [];
  if (stops.length > 4) {
    return NextResponse.json(
      { error: "Up to 4 intermediate stops allowed" },
      { status: 400 },
    );
  }
  if (
    !body.fare ||
    typeof body.fare.fareJMD !== "number" ||
    body.fare.fareJMD < 0
  ) {
    return NextResponse.json({ error: "Invalid fare" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY — can't create ride.",
      },
      { status: 500 },
    );
  }

  // Outstanding-fee gate: a rider with an uncollected cancellation or
  // no-show fee can't book again until it's cleared. RAJLO's cashless
  // policy explicitly allows outstanding balances to restrict access;
  // admin clears the flag via /admin/wallets once the fee is settled.
  const { count: unpaidFees } = await supabase
    .from("rides")
    .select("id", { count: "exact", head: true })
    .eq("rider_id", user.id)
    .eq("settlement_status", FEE_UNCOLLECTED_STATUS);
  if (unpaidFees && unpaidFees > 0) {
    return NextResponse.json(
      {
        error:
          "You have an unpaid cancellation or no-show fee. Top up your wallet, then contact support to clear it before booking again.",
        outstandingFee: true,
      },
      { status: 402 },
    );
  }

  // Wallet booking gate: a rider can't book a trip if their wallet
  // can't cover the estimated fare. We don't actually move money
  // here — that happens at completion when the final fare is known.
  // Booking is rejected with 402 Payment Required so the client can
  // route the rider to /rider/wallet to top up.
  const estimatedFareJmd = Math.round(body.fare.fareJMD);
  // Spendable balance — raw wallet minus any active holds (e.g. a
  // multi-leg route taxi journey already in flight). Booking a private
  // ride must not break the lock the rider has on a pending journey.
  const { availableJmd, balanceJmd, lockedJmd } = await getBalanceWithLock(
    supabase,
    user.id,
  );
  if (availableJmd < estimatedFareJmd) {
    return NextResponse.json(
      {
        error: lockedJmd > 0
          ? `Top up your wallet to book this trip — fare is JMD ${estimatedFareJmd.toLocaleString("en-JM")}, you have JMD ${availableJmd.toLocaleString("en-JM")} available (JMD ${lockedJmd.toLocaleString("en-JM")} locked for an active trip).`
          : `Top up your wallet to book this trip — fare is JMD ${estimatedFareJmd.toLocaleString("en-JM")}, you have JMD ${availableJmd.toLocaleString("en-JM")} available.`,
        insufficientFunds: true,
        balanceJmd,
        availableJmd,
        lockedJmd,
        requiredJmd: estimatedFareJmd,
      },
      { status: 402 },
    );
  }

  const allowCarpool = body.allowCarpool === true;

  // Resolve the rider's "Verify Your Ride" PIN preference. Returns a
  // 4-digit string when the rider has it enabled and the current
  // Jamaica time satisfies their mode (always vs night-only), or
  // null when no PIN is required for this ride.
  const startPin = await resolveRidePin(supabase, user.id);

  // Insert the ride row.
  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .insert({
      rider_id: user.id,
      status: "requested",
      start_pin: startPin,
      pickup_name: body.pickup.name,
      pickup_address: body.pickup.address,
      pickup_lat: body.pickup.lat,
      pickup_lng: body.pickup.lng,
      pickup_parish:
        body.pickup.parish ??
        nearestParish({ lat: body.pickup.lat, lng: body.pickup.lng }),
      pickup_place_id: body.pickup.placeId ?? null,
      dropoff_name: body.dropoff.name,
      dropoff_address: body.dropoff.address,
      dropoff_lat: body.dropoff.lat,
      dropoff_lng: body.dropoff.lng,
      dropoff_parish:
        body.dropoff.parish ??
        nearestParish({ lat: body.dropoff.lat, lng: body.dropoff.lng }),
      dropoff_place_id: body.dropoff.placeId ?? null,
      seats,
      notes: body.notes?.trim() || null,
      estimated_fare_jmd: Math.round(body.fare.fareJMD),
      estimated_distance_km: Number.isFinite(body.fare.totalKm)
        ? Number(body.fare.totalKm.toFixed(2))
        : null,
      estimated_eta_minutes: Number.isFinite(body.fare.etaMinutes)
        ? Math.round(body.fare.etaMinutes)
        : null,
      allow_carpool: allowCarpool,
      // Hard timeout — if no driver accepts before this, the
      // expire-on-read logic in /api/rider/rides/active will flip
      // status to 'cancelled' with reason 'expired_no_driver' and
      // the rider sees a "no driver found" UI with retry.
      expires_at: computeRideExpiry(),
    })
    .select(
      "id, rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, seats, estimated_fare_jmd",
    )
    .single();

  if (rideError || !ride) {
    return NextResponse.json(
      {
        error: `Failed to create ride: ${rideError?.message ?? "unknown error"}`,
      },
      { status: 500 },
    );
  }

  // Insert intermediate stops, position-ordered.
  if (stops.length > 0) {
    const stopRows = stops.map((s, i) => ({
      ride_id: ride.id,
      position: i + 1,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      parish: s.parish ?? nearestParish({ lat: s.lat, lng: s.lng }),
      place_id: s.placeId ?? null,
    }));
    const { error: stopsError } = await supabase
      .from("ride_stops")
      .insert(stopRows);
    if (stopsError) {
      // Cascading delete will clean up if we ever need to rollback. For now
      // surface the error — the ride row exists but is missing its stops.
      return NextResponse.json(
        { error: `Ride created but stops failed: ${stopsError.message}` },
        { status: 500 },
      );
    }
  }

  // Audit event.
  await supabase.from("ride_events").insert({
    ride_id: ride.id,
    event: "requested",
    actor_role: "rider",
    actor_id: user.id,
    metadata: {
      pickup: body.pickup.name,
      dropoff: body.dropoff.name,
      stops: stops.length,
      seats,
      estimatedFareJMD: Math.round(body.fare.fareJMD),
      allowCarpool,
    },
  });

  // Phase 2A.3 — try to pair this ride with another carpool opt-in
  // going the same way. If matched, both rides get linked + their
  // fares drop. If not matched, the ride stays as a normal solo
  // request and may still be matched later when another opt-in comes
  // in (the matcher runs again on every new ride).
  let matchedFareJMD: number | null = null;
  let matchedWithRiderId: string | null = null;
  if (allowCarpool) {
    const result = await tryMatchCarpool(supabase, ride);
    if (result) {
      matchedFareJMD = result.newFareJMD;
      matchedWithRiderId = result.partnerRiderId;
      // Audit on both sides so the events table tells the full story.
      await supabase.from("ride_events").insert([
        {
          ride_id: ride.id,
          event: "carpool_matched",
          actor_role: "system",
          metadata: {
            groupId: result.groupId,
            partnerRideId: result.partnerRideId,
            newFareJMD: result.newFareJMD,
          },
        },
        {
          ride_id: result.partnerRideId,
          event: "carpool_matched",
          actor_role: "system",
          metadata: {
            groupId: result.groupId,
            partnerRideId: ride.id,
            newFareJMD: result.partnerFareJMD,
          },
        },
      ]);
    }
  }

  // Best-effort email + in-app inbox + push. We don't push for "ride
  // requested" itself (the rider IS the actor — they just tapped
  // "Request") but we DO log an inbox row so the feed has a complete
  // narrative of every event for that ride.
  void notifyRider(supabase, {
    riderId: user.id,
    kind: "trip",
    title: "Looking for a driver…",
    body: `${body.pickup.name} → ${body.dropoff.name}`,
    href: `/rider/live-trip?id=${ride.id}`,
    cta: "View live status",
    inboxOnly: true,
  }).catch(() => null);

  // Fan-out push to every activated driver — first one to accept wins
  // via the atomic claim in /api/driver/rides/[id]/accept. Best-effort.
  // `pushOnly` = true so we don't pollute every driver's inbox with a
  // permanent "ride available" row. Drivers consult the live claimable
  // queue via the /driver inbox view, which auto-removes claimed rides.
  void notifyAllAvailableDrivers(supabase, {
    kind: "ride_available",
    title: "New ride request",
    body: `${body.pickup.name} → ${body.dropoff.name} · ${seats} seat${seats > 1 ? "s" : ""} · JMD ${Math.round(body.fare.fareJMD).toLocaleString("en-JM")}`,
    href: "/driver",
    pushTag: `ride-available-${ride.id}`,
    pushRenotify: true,
    requireInteraction: true,
    pushOnly: true,
    // Filter the fan-out to drivers within radius (8km) of pickup
    // AND currently toggled online. Without this, a driver in
    // Mandeville gets pinged for a ride in Kingston, and offline
    // drivers get woken up for trips they never wanted.
    riderPickup: { lat: body.pickup.lat, lng: body.pickup.lng },
  }).catch(() => null);

  if (user.email) {
    const { data: riderProfile } = await auth
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    void sendRideRequestedEmail(user.email, {
      riderFirstName: riderProfile?.full_name ?? null,
      rideId: ride.id,
      pickup: body.pickup.name,
      dropoff: body.dropoff.name,
      fareJMD: matchedFareJMD ?? Math.round(body.fare.fareJMD),
      seats,
      etaMinutes: Number.isFinite(body.fare.etaMinutes)
        ? Math.round(body.fare.etaMinutes)
        : null,
      expiresAt: ride ? computeRideExpiry() : null,
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    rideId: ride.id,
    carpool: matchedFareJMD
      ? { matched: true, fareJMD: matchedFareJMD, partnerRiderId: matchedWithRiderId }
      : { matched: false },
  });
}
