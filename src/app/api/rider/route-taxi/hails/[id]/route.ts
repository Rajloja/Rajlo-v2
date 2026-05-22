import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getWalletBalance } from "@/lib/wallet";
import { getDriverSelfieUrl } from "@/lib/driver-selfie";
import { riderCancellationFeeJmd, chargeFee } from "@/lib/cancellation-fees";
import { sendRiderHailCancelledEmail } from "@/lib/email-templates";
import { cancelJourney } from "@/lib/route-journey-progress";

/**
 * /api/rider/route-taxi/hails/[id]
 *
 * GET   — full status snapshot for one hail (the rider's own).
 * PATCH — rider-side state transition. Today only `cancelled` is
 *         allowed, and only while the hail is `requested` or
 *         `accepted` (not after pickup — that's a no-show / refund
 *         conversation, not a self-serve cancel). Cancelling an
 *         `accepted` hail more than 2 minutes after requesting it
 *         incurs a J$100 cancellation fee (driver keeps 80%); a
 *         `requested` hail with no driver yet is always free.
 *
 * Powers the live hailing page. We return the full join (driver +
 * vehicle + session position + wallet snapshot for completed hails)
 * in one round-trip so the page polls a single endpoint.
 */

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

  const { data: hail } = await supabase
    .from("route_hails")
    .select(
      "id, route_id, session_id, status, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, distance_km, fare_jmd, concession, requested_at, accepted_at, picked_up_at, completed_at, cancelled_at, cancellation_reason, commission_jmd, driver_earnings_jmd, journey_id, leg_order, is_transfer_leg",
    )
    .eq("id", id)
    .eq("rider_id", user.id)
    .maybeSingle();

  if (!hail) {
    return NextResponse.json({ error: "hail not found" }, { status: 404 });
  }

  // Route metadata (never changes once the hail is created, but the
  // page needs the corridor name + parish for the header).
  const { data: route } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, distance_km, ta_fare_jmd",
    )
    .eq("id", hail.route_id)
    .maybeSingle();

  // Session + driver only exist once a driver has accepted.
  let session: null | {
    id: string;
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
      /** Signed URL to the driver's TA-verified selfie. Null when
       *  storage sign fails or the doc isn't uploaded yet. */
      selfieUrl: string | null;
    } | null;
  } = null;

  if (hail.session_id) {
    const { data: sess } = await supabase
      .from("driver_sessions")
      .select(
        "id, driver_id, seats_taken, vehicle_capacity, current_lat, current_lng, last_position_at",
      )
      .eq("id", hail.session_id)
      .maybeSingle();
    if (sess) {
      const { data: driver } = await supabase
        .from("drivers")
        .select(
          "id, first_name, last_name, plate_number, vehicle_make, vehicle_model, vehicle_color, phone",
        )
        .eq("id", sess.driver_id)
        .maybeSingle();
      // Sign the driver's selfie URL in parallel with the row fetch
      // above. Failures degrade silently to the initial avatar.
      const selfieUrl = driver
        ? await getDriverSelfieUrl(supabase, driver.id).catch(() => null)
        : null;
      session = {
        id: sess.id,
        seatsTaken: sess.seats_taken,
        vehicleCapacity: sess.vehicle_capacity,
        currentLat: sess.current_lat,
        currentLng: sess.current_lng,
        lastPositionAt: sess.last_position_at,
        driver: driver
          ? {
              firstName: driver.first_name,
              lastName: driver.last_name,
              plateNumber: driver.plate_number,
              vehicleMake: driver.vehicle_make,
              vehicleModel: driver.vehicle_model,
              vehicleColor: driver.vehicle_color,
              phone: driver.phone,
              selfieUrl,
            }
          : null,
      };
    }
  }

  // Wallet snapshot is only meaningful once the trip is settled —
  // the receipt screen shows "balance now $X" so the rider sees the
  // debit landed.
  const walletBalanceJmd =
    hail.status === "completed" ? await getWalletBalance(supabase, user.id) : null;

  return NextResponse.json({
    hail: {
      id: hail.id,
      routeId: hail.route_id,
      status: hail.status,
      pickup: hail.pickup_name,
      pickupLat: hail.pickup_lat,
      pickupLng: hail.pickup_lng,
      dropoff: hail.dropoff_name,
      dropoffLat: hail.dropoff_lat,
      dropoffLng: hail.dropoff_lng,
      distanceKm: Number(hail.distance_km),
      fareJmd: hail.fare_jmd,
      concession: hail.concession,
      requestedAt: hail.requested_at,
      acceptedAt: hail.accepted_at,
      pickedUpAt: hail.picked_up_at,
      completedAt: hail.completed_at,
      cancelledAt: hail.cancelled_at,
      cancellationReason: hail.cancellation_reason,
      commissionJmd: hail.commission_jmd,
      driverEarningsJmd: hail.driver_earnings_jmd,
      journeyId: hail.journey_id ?? null,
      legOrder: hail.leg_order ?? null,
      isTransferLeg: hail.is_transfer_leg ?? false,
      session,
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
    },
    walletBalanceJmd,
  });
}

type PatchBody = { to?: "cancelled"; reason?: string };

export async function PATCH(
  request: Request,
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

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (body.to !== "cancelled") {
    return NextResponse.json(
      { error: "Only `to: 'cancelled'` is supported on this endpoint." },
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

  // Rider can only cancel their own hail, and only before pickup.
  // Once they're onboard, cancellation is a refund conversation
  // owned by support — not a self-serve flip.
  const { data: hail } = await supabase
    .from("route_hails")
    .select(
      "id, status, requested_at, session_id, pickup_name, dropoff_name, journey_id",
    )
    .eq("id", id)
    .eq("rider_id", user.id)
    .maybeSingle();
  if (!hail) {
    return NextResponse.json({ error: "hail not found" }, { status: 404 });
  }
  if (hail.status !== "requested" && hail.status !== "accepted") {
    return NextResponse.json(
      {
        error: `Can't cancel a hail in status "${hail.status}" — contact support if needed.`,
      },
      { status: 409 },
    );
  }

  // Fee tier — a route hail never reaches `arrived`, so this only ever
  // lands on the J$0 (requested / inside grace window) or J$100
  // (accepted, past the window) tiers.
  const feeJmd = riderCancellationFeeJmd(hail.status, hail.requested_at);

  const { error } = await supabase
    .from("route_hails")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: body.reason?.slice(0, 200) ?? "Rider cancelled",
    })
    .eq("id", id)
    .in("status", ["requested", "accepted"]); // optimistic concurrency

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For a journey leg, cascade the cancel to the journey row and
  // release the wallet hold (refunding the unspent portion to the
  // rider's available balance). Already-settled legs stay debited.
  // We do this BEFORE charging the cancellation fee so the rider's
  // available balance is restored first — the fee charge comes off
  // a healthy wallet, not one with a phantom lock against an already-
  // dead journey.
  let journeyRefundedJmd = 0;
  if (hail.journey_id) {
    const cancel = await cancelJourney(supabase, {
      journeyId: hail.journey_id as string,
      reason: body.reason?.slice(0, 200) ?? "Rider cancelled",
      cancelledBy: "rider",
    });
    journeyRefundedJmd = cancel.refundedJmd;
    if (cancel.warnings.length > 0) {
      console.error(
        `route-taxi journey ${hail.journey_id} cancel warnings:`,
        cancel.warnings,
      );
    }
  }

  // ─── Charge the cancellation fee, if one applies ───
  let feeCharged = false;
  let feeUncollected = false;
  if (feeJmd > 0) {
    // Resolve the accepting driver's user id via the session so we can
    // pay them their 80% share.
    let driverUserId: string | null = null;
    if (hail.session_id) {
      const { data: sess } = await supabase
        .from("driver_sessions")
        .select("driver_id")
        .eq("id", hail.session_id)
        .maybeSingle();
      if (sess?.driver_id) {
        const { data: drv } = await supabase
          .from("drivers")
          .select("user_id")
          .eq("id", sess.driver_id)
          .maybeSingle();
        driverUserId = drv?.user_id ?? null;
      }
    }
    const result = await chargeFee(supabase, {
      riderId: user.id,
      driverUserId,
      feeJmd,
      rideId: hail.id,
      feeType: "cancellation",
      label: `${hail.pickup_name} → ${hail.dropoff_name} (Route Taxi)`,
    });
    feeCharged = result.ok;
    feeUncollected = !result.ok;
    if (!result.ok) {
      // Wallet too low — the cancellation still stands; record it on
      // the hail so admin can follow up.
      await supabase
        .from("route_hails")
        .update({
          cancellation_reason: `${body.reason?.slice(0, 150) ?? "Rider cancelled"} · J$${feeJmd} fee uncollected`,
        })
        .eq("id", id);
    }
  }

  // Rider self-cancel confirmation email. Best-effort — we use
  // user.email from the JWT so no extra lookup is needed.
  if (user.email) {
    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    void sendRiderHailCancelledEmail(user.email, {
      riderFirstName: riderProfile?.full_name ?? null,
      hailId: hail.id,
      pickup: hail.pickup_name,
      dropoff: hail.dropoff_name,
      cancelledBy: "rider",
      reason: body.reason ?? null,
      cancellationFeeJmd: feeCharged ? feeJmd : null,
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    cancellationFeeJmd: feeJmd,
    feeCharged,
    feeUncollected,
    journeyRefundedJmd: hail.journey_id ? journeyRefundedJmd : 0,
  });
}
