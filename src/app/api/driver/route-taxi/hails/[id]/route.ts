import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { splitFare } from "@/lib/fare-engine";
import { notifyRider } from "@/lib/notify";
import {
  settleLeg,
  advanceJourney,
  cancelJourney,
  getJourney,
} from "@/lib/route-journey-progress";
import {
  sendDriverHailAcceptedEmail,
  sendDriverHailCompletedEmail,
  sendRiderHailAcceptedEmail,
  sendRiderHailCancelledEmail,
  sendRiderHailCompletedEmail,
} from "@/lib/email-templates";
import { resolveDriverEmail } from "@/lib/driver-email-resolver";

/**
 * PATCH /api/driver/route-taxi/hails/[id]
 *
 * Drives the route-hail state machine from the driver side. Body shape:
 *   { to: 'accepted' | 'picked_up' | 'completed' | 'cancelled',
 *     reason?: string }
 *
 * Allowed transitions:
 *   requested → accepted    (driver attaches their session, blocks a seat)
 *   accepted  → picked_up   (rider boarded)
 *   picked_up → completed   (rider dropped off; wallets settle here)
 *   accepted  → cancelled   (driver bails before pickup; seat freed)
 *   picked_up → cancelled   (rare — driver can't deliver; seat freed)
 *
 * Settlement (only at `completed`):
 *   1. Debit rider wallet `fare_jmd` (`ride_charge` kind, refs hail in metadata).
 *   2. Credit driver wallet `driver_earnings_jmd` from `splitFare(fare_jmd)`.
 *   3. Stamp `commission_jmd`, `driver_earnings_jmd`, `*_transaction_id`
 *      on the hail row so reconciliation is one query.
 *
 * If the rider debit fails (insufficient balance — shouldn't happen
 * because we gate at hail time, but the balance can drop in the
 * meantime), we leave the hail in a `picked_up` state and return 402
 * so the driver UI can prompt the rider to top up.
 */

type TransitionBody = {
  to?: "accepted" | "picked_up" | "completed" | "cancelled";
  reason?: string;
};

const ALLOWED: Record<string, string[]> = {
  requested: ["accepted"],
  accepted: ["picked_up", "cancelled"],
  picked_up: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

/**
 * Resolve a rider's email + first name in one round trip. Returns null
 * for either field when the lookup fails — callers should skip the
 * send rather than throw, since email failure must not block the trip
 * state machine.
 */
async function resolveRiderContact(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  riderId: string,
): Promise<{ email: string | null; firstName: string | null }> {
  if (!supabase) return { email: null, firstName: null };
  try {
    const [profileRes, authRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", riderId)
        .maybeSingle(),
      supabase.auth.admin.getUserById(riderId),
    ]);
    return {
      email: authRes.data.user?.email ?? null,
      firstName: profileRes.data?.full_name ?? null,
    };
  } catch {
    return { email: null, firstName: null };
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: hailId } = await ctx.params;
  if (!hailId) {
    return NextResponse.json({ error: "missing hail id" }, { status: 400 });
  }

  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: TransitionBody;
  try {
    body = (await request.json()) as TransitionBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const target = body.to;
  if (!target || !["accepted", "picked_up", "completed", "cancelled"].includes(target)) {
    return NextResponse.json(
      { error: "to must be one of accepted | picked_up | completed | cancelled" },
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

  // Resolve driver row. We pull the full vehicle profile (not just
  // plate) because the rider-facing accept notification packs
  // "{Year Color Make Model} · plate" into the body so they can
  // identify the car at a glance from the lock screen.
  const { data: driver } = await supabase
    .from("drivers")
    .select(
      "id, first_name, last_name, plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ error: "Driver record not found" }, { status: 404 });
  }

  // Load the hail + verify it's on the driver's route (for accept) or
  // their existing session (for the later transitions). Journey
  // columns are pulled too so the settlement / cancel branches know
  // whether to settle from a hold or take the legacy raw-debit path.
  const { data: hail, error: hailError } = await supabase
    .from("route_hails")
    .select(
      "id, rider_id, route_id, session_id, status, fare_jmd, distance_km, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, journey_id, leg_order, is_transfer_leg",
    )
    .eq("id", hailId)
    .maybeSingle();

  if (hailError || !hail) {
    return NextResponse.json({ error: "hail not found" }, { status: 404 });
  }

  // Validate the transition is legal from the current status.
  if (!ALLOWED[hail.status]?.includes(target)) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${hail.status} to ${target}`,
      },
      { status: 409 },
    );
  }

  // Driver's currently-active session — needed for accept (we attach
  // the hail to it) and for the post-accept transitions (must own the hail).
  const { data: session } = await supabase
    .from("driver_sessions")
    .select("id, route_id, vehicle_capacity, seats_taken, status")
    .eq("driver_id", driver.id)
    .eq("status", "active")
    .maybeSingle();

  if (target === "accepted") {
    if (!session) {
      return NextResponse.json(
        { error: "Start a session before accepting hails." },
        { status: 409 },
      );
    }
    if (session.route_id !== hail.route_id) {
      return NextResponse.json(
        { error: "Hail is on a different route than your session." },
        { status: 409 },
      );
    }
    if (session.seats_taken >= session.vehicle_capacity) {
      return NextResponse.json(
        { error: "Vehicle is full — end the trip or drop someone off first." },
        { status: 409 },
      );
    }
    if (hail.session_id) {
      return NextResponse.json(
        { error: "Another driver already accepted this hail." },
        { status: 409 },
      );
    }

    // Atomic claim. The chain `eq("status","requested").is("session_id",null)`
    // becomes ONE SQL `UPDATE … WHERE id=? AND status='requested' AND
    // session_id IS NULL` — Postgres row-locks during the update, so
    // only one concurrent caller can match the WHERE. Crucially we
    // `.select().maybeSingle()` so we can distinguish:
    //   - row returned → we won the claim
    //   - null returned → someone else got there first (no rows matched)
    // Without the .select() the previous code happily returned 200 OK
    // even when 0 rows were updated, which meant two racing drivers
    // could BOTH see "you accepted!" while only one actually owned it.
    const { data: claimed, error: acceptError } = await supabase
      .from("route_hails")
      .update({
        session_id: session.id,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", hail.id)
      .eq("status", "requested")
      .is("session_id", null)
      .select("id")
      .maybeSingle();

    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json(
        { error: "Another driver just accepted this hail." },
        { status: 409 },
      );
    }

    // Best-effort rider notification. Body lays out the car the
    // rider should look out for: "2022 Silver Toyota Hiace · plate
    // JM-AB-1234". Most route taxis are visually identifiable by
    // colour + make/model from the kerbside, so this is the highest-
    // value info to surface on the lock screen.
    const vehicleDesc = [
      driver.vehicle_year ? String(driver.vehicle_year) : null,
      driver.vehicle_color,
      driver.vehicle_make,
      driver.vehicle_model,
    ]
      .filter(Boolean)
      .join(" ");
    const bodyParts = [
      vehicleDesc || null,
      driver.plate_number ? `plate ${driver.plate_number}` : null,
    ].filter(Boolean);
    void notifyRider(supabase, {
      riderId: hail.rider_id,
      kind: "trip",
      title: `${driver.first_name ?? "Driver"} is on the way`,
      body:
        bodyParts.length > 0
          ? bodyParts.join(" · ")
          : `${driver.first_name ?? "Your driver"} accepted your route taxi.`,
      href: "/rider/route-taxi",
      cta: "View hail",
      pushTag: `route-hail-${hail.id}`,
      pushRenotify: true,
    }).catch(() => null);

    // Email parity with private rides: rider gets the driver-matched
    // email, driver gets a confirmation of their own tap.
    const driverFullName =
      [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
      "Driver";
    void (async () => {
      const rider = await resolveRiderContact(supabase, hail.rider_id);
      if (rider.email) {
        void sendRiderHailAcceptedEmail(rider.email, {
          riderFirstName: rider.firstName,
          hailId: hail.id,
          driverName: driverFullName,
          vehicle: vehicleDesc || null,
          plate: driver.plate_number,
          pickup: hail.pickup_name,
          dropoff: hail.dropoff_name,
        }).catch(() => null);
      }
      const driverEmail = await resolveDriverEmail(supabase, {
        user_id: user.id,
      });
      if (driverEmail) {
        void sendDriverHailAcceptedEmail(driverEmail, {
          driverName: driverFullName,
          hailId: hail.id,
          riderFirstName: rider.firstName,
          pickup: hail.pickup_name,
          dropoff: hail.dropoff_name,
          fareJMD: hail.fare_jmd as number,
        }).catch(() => null);
      }
    })();

    return NextResponse.json({ ok: true, status: "accepted" });
  }

  // Past-accept transitions: must own the hail via current session.
  if (!session || hail.session_id !== session.id) {
    return NextResponse.json(
      { error: "You don't own this hail." },
      { status: 403 },
    );
  }

  if (target === "picked_up") {
    // Drivers can no longer self-transition a hail to picked_up.
    // The rider scanning the driver's session QR is the only path
    // into `picked_up` — that's the trust gate that proves the
    // right rider got into the right car before any wallet debit
    // can fire on leg completion.
    //
    // Symmetric with the rider PIN flow on private rides: a driver
    // tap can't move the trip forward unilaterally.
    return NextResponse.json(
      {
        error: "rider_scan_required",
        message:
          "The rider needs to scan your session QR to start the trip — this prevents trips starting with the wrong car.",
      },
      { status: 409 },
    );
  }

  if (target === "completed") {
    const fareJmd = hail.fare_jmd as number;

    let driverEarningsJmd: number;
    let commissionJmd: number;
    let debitTxnId: string | null = null;
    let creditTxnId: string | null = null;
    let riderBalanceAfter: number | null = null;

    if (hail.journey_id) {
      // Multi-leg (or single-leg as a length-1 journey): settle this
      // leg through the journey orchestrator. It consumes the hold
      // portion, writes the debit + credit, and bumps the journey row.
      const journey = await getJourney(supabase, hail.journey_id as string);
      if (!journey) {
        return NextResponse.json(
          { error: "journey not found for this hail" },
          { status: 500 },
        );
      }
      const split = splitFare(fareJmd);
      driverEarningsJmd = split.driverEarningsJmd;
      commissionJmd = split.commissionJmd;
      const result = await settleLeg(
        supabase,
        hail as Parameters<typeof settleLeg>[1],
        journey,
        user.id,
      );
      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.warnings[0] ?? "settle_failed",
            message:
              "Rider's wallet can't cover this leg. Ask them to top up before they exit.",
          },
          { status: 402 },
        );
      }
      debitTxnId = result.transactionIds.debit;
      creditTxnId = result.transactionIds.credit;
      riderBalanceAfter = result.riderBalanceAfter;
      if (result.warnings.length > 0) {
        console.error(
          `route-taxi journey ${hail.journey_id} leg ${hail.leg_order} settle warnings:`,
          result.warnings,
        );
      }
    } else {
      // Legacy single-leg flow — no journey row, no hold. Direct
      // debit + credit, same as the original implementation.
      const split = splitFare(fareJmd);
      driverEarningsJmd = split.driverEarningsJmd;
      commissionJmd = split.commissionJmd;
      const debit = await debitWallet(
        supabase,
        hail.rider_id,
        fareJmd,
        "ride_charge",
        {
          description: `Route taxi · ${hail.pickup_name} → ${hail.dropoff_name}`,
          metadata: { route_hail_id: hail.id, kind: "route_taxi" },
        },
      );
      if (!debit.ok) {
        return NextResponse.json(
          {
            error: debit.insufficientFunds
              ? "rider_insufficient_balance"
              : debit.error,
            message: debit.insufficientFunds
              ? "Rider's wallet can't cover the fare. Ask them to top up before they exit."
              : "Wallet debit failed.",
          },
          { status: debit.insufficientFunds ? 402 : 500 },
        );
      }
      debitTxnId = debit.transactionId;
      riderBalanceAfter = debit.balanceAfter;

      const credit = await creditWallet(
        supabase,
        user.id,
        driverEarningsJmd,
        "ride_earning",
        {
          description: `Route taxi · ${hail.pickup_name} → ${hail.dropoff_name}`,
          metadata: {
            route_hail_id: hail.id,
            kind: "route_taxi",
            gross_fare_jmd: fareJmd,
            commission_jmd: commissionJmd,
          },
        },
      );
      if (!credit.ok) {
        console.error(
          `route-taxi settlement: rider charged but driver credit failed (hail ${hail.id}): ${credit.error}`,
        );
      } else {
        creditTxnId = credit.transactionId;
      }
    }

    // Stamp the hail with the settled amounts.
    const { error: completeError } = await supabase
      .from("route_hails")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        commission_jmd: commissionJmd,
        driver_earnings_jmd: driverEarningsJmd,
        charged_transaction_id: debitTxnId,
        driver_credit_transaction_id: creditTxnId,
      })
      .eq("id", hail.id);

    if (completeError) {
      return NextResponse.json(
        { error: completeError.message },
        { status: 500 },
      );
    }

    // For multi-leg journeys: kick off the next leg if any remain.
    // Best-effort — broadcast / matcher failures don't block the
    // driver's completion response.
    let nextLeg: { id: string; order: number } | null = null;
    if (hail.journey_id && hail.leg_order) {
      const rider = await resolveRiderContact(supabase, hail.rider_id);
      const advance = await advanceJourney(supabase, {
        journeyId: hail.journey_id as string,
        justCompletedLegOrder: hail.leg_order as number,
        transferLat: hail.dropoff_lat as number | null,
        transferLng: hail.dropoff_lng as number | null,
        riderFirstName: rider.firstName,
      });
      if (advance.kind === "next_leg_created") {
        nextLeg = {
          id: advance.hailId,
          order: (hail.leg_order as number) + 1,
        };
      }
    }

    void notifyRider(supabase, {
      riderId: hail.rider_id,
      kind: "trip",
      title: "Trip complete",
      body: `JMD $${fareJmd} debited from your wallet. Tap to rate.`,
      href: "/rider/route-taxi",
      cta: "Rate driver",
      pushTag: `route-hail-${hail.id}`,
      pushRenotify: true,
    }).catch(() => null);

    // Rider receipt + driver earnings emails.
    const driverFullName =
      [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
      "Driver";
    const distanceKm =
      typeof hail.distance_km === "number"
        ? hail.distance_km
        : Number(hail.distance_km);
    const completedAt = new Date().toISOString();
    void (async () => {
      const rider = await resolveRiderContact(supabase, hail.rider_id);
      if (rider.email) {
        void sendRiderHailCompletedEmail(rider.email, {
          riderFirstName: rider.firstName,
          hailId: hail.id,
          pickup: hail.pickup_name,
          dropoff: hail.dropoff_name,
          fareJMD: fareJmd,
          distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
          driverName: driverFullName,
          completedAt,
        }).catch(() => null);
      }
      const driverEmail = await resolveDriverEmail(supabase, {
        user_id: user.id,
      });
      if (driverEmail) {
        void sendDriverHailCompletedEmail(driverEmail, {
          driverName: driverFullName,
          hailId: hail.id,
          pickup: hail.pickup_name,
          dropoff: hail.dropoff_name,
          fareJMD: fareJmd,
          driverEarningsJMD: driverEarningsJmd,
          commissionJMD: commissionJmd,
          distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
          riderFirstName: rider.firstName,
          completedAt,
        }).catch(() => null);
      }
    })();

    return NextResponse.json({
      ok: true,
      status: "completed",
      fareJmd,
      driverEarningsJmd,
      commissionJmd,
      riderBalanceAfter,
      nextLeg,
    });
  }

  if (target === "cancelled") {
    const { error: cancelError } = await supabase
      .from("route_hails")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: body.reason ?? "Driver cancelled",
      })
      .eq("id", hail.id)
      .in("status", ["accepted", "picked_up"]);

    if (cancelError) {
      return NextResponse.json({ error: cancelError.message }, { status: 500 });
    }

    // For a journey leg, cascade the cancel up to the journey. The
    // unspent portion of the hold is refunded back to the rider's
    // available balance; settled legs stay debited. Phase 3 will
    // add intra-journey re-broadcast so a pre-pickup driver cancel
    // can find another driver without killing the whole journey —
    // for now, driver-cancel-on-journey = journey-cancel.
    let refundedJmd = 0;
    if (hail.journey_id) {
      const cancel = await cancelJourney(supabase, {
        journeyId: hail.journey_id as string,
        reason: body.reason ?? "Driver cancelled mid-journey",
        cancelledBy: "driver",
      });
      refundedJmd = cancel.refundedJmd;
      if (cancel.warnings.length > 0) {
        console.error(
          `route-taxi journey ${hail.journey_id} cancel warnings:`,
          cancel.warnings,
        );
      }
    }

    void notifyRider(supabase, {
      riderId: hail.rider_id,
      kind: "trip",
      title: "Driver cancelled",
      body: hail.journey_id
        ? body.reason ??
          `Your driver had to cancel — JMD $${refundedJmd} refunded to your wallet. Re-hail when you're ready.`
        : body.reason ??
          "Your driver had to cancel — hail another car when you're ready.",
      href: "/rider/route-taxi",
      cta: "Re-hail",
      pushTag: `route-hail-${hail.id}`,
      pushRenotify: true,
    }).catch(() => null);

    void (async () => {
      const rider = await resolveRiderContact(supabase, hail.rider_id);
      if (rider.email) {
        void sendRiderHailCancelledEmail(rider.email, {
          riderFirstName: rider.firstName,
          hailId: hail.id,
          pickup: hail.pickup_name,
          dropoff: hail.dropoff_name,
          cancelledBy: "driver",
          reason: body.reason ?? null,
          cancellationFeeJmd: null,
        }).catch(() => null);
      }
    })();

    return NextResponse.json({
      ok: true,
      status: "cancelled",
      refundedJmd: hail.journey_id ? refundedJmd : 0,
    });
  }

  return NextResponse.json({ error: "unhandled transition" }, { status: 500 });
}
