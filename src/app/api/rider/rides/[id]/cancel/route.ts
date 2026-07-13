import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { sendTripCancelledEmail } from "@/lib/email-templates";
import { notifyDriver } from "@/lib/notify";
import {
  riderCancellationFeeJmd,
  chargeFee,
  FEE_UNCOLLECTED_STATUS,
} from "@/lib/cancellation-fees";
import { getActiveHoldForRide, releaseHold } from "@/lib/wallet-holds";

/**
 * POST /api/rider/rides/[id]/cancel
 *
 * Rider cancels their own ride. Allowed only while the trip hasn't
 * actually started — once the driver has marked it `in_progress` the
 * rider can't unilaterally cancel from the app (they'd contact support
 * for a refund/dispute path which is a Phase-3 concern).
 *
 * A cancellation fee may apply (see lib/cancellation-fees.ts):
 *   - `requested` (no driver yet) ............ free
 *   - `accepted`, within 2 min of request .... free
 *   - `accepted`, after the grace window ..... J$100
 *   - `arrived` (driver at pickup) ........... J$200
 * The fee debits the rider's wallet and credits the driver 80%. If the
 * wallet can't cover it the cancellation still goes through, but the
 * ride is flagged fee-uncollected for admin reconciliation.
 *
 * Body: { reason?: string }
 */

const CANCELLABLE_BY_RIDER = ["requested", "accepted", "arrived"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || null;

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

  // Read the ride FIRST — the fee tier depends on the status *before*
  // the cancel, so we can't derive it from the post-update row.
  const { data: ride } = await supabase
    .from("rides")
    .select("id, status, requested_at, driver_id, pickup_name, dropoff_name")
    .eq("id", id)
    .eq("rider_id", user.id)
    .maybeSingle();

  if (!ride || !CANCELLABLE_BY_RIDER.includes(ride.status)) {
    return NextResponse.json(
      {
        error:
          "This ride can't be cancelled — it may already be in progress, completed, or cancelled.",
      },
      { status: 409 },
    );
  }

  const feeJmd = riderCancellationFeeJmd(ride.status, ride.requested_at);
  const now = new Date().toISOString();

  // Atomic flip — `.in(status, …)` guards against a race where the
  // driver advances the ride between our read and this write.
  const { data: cancelled, error } = await supabase
    .from("rides")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancellation_reason: reason,
    })
    .eq("id", id)
    .eq("rider_id", user.id)
    .in("status", CANCELLABLE_BY_RIDER)
    .select("id, pickup_name, dropoff_name, driver_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!cancelled) {
    return NextResponse.json(
      {
        error:
          "This ride can't be cancelled — it may already be in progress, completed, or cancelled.",
      },
      { status: 409 },
    );
  }

  // Release the booking-time wallet hold. The rider doesn't owe the
  // full estimated fare anymore (they cancelled) — the cancellation-fee
  // debit below runs against raw balance and doesn't need the hold to
  // still be in place. Releasing here (rather than after the fee)
  // makes sure any downstream failure — email, notify, etc. — can't
  // leave a phantom lock on the rider's wallet.
  const hold = await getActiveHoldForRide(supabase, cancelled.id);
  if (hold) {
    await releaseHold(supabase, hold.id, "ride_cancelled_by_rider");
  }

  // Resolve the assigned driver's user id once — needed both to credit
  // the fee and to push them the cancellation notice.
  let driverUserId: string | null = null;
  if (cancelled.driver_id) {
    const { data: d } = await supabase
      .from("drivers")
      .select("user_id")
      .eq("id", cancelled.driver_id)
      .maybeSingle();
    driverUserId = d?.user_id ?? null;
  }

  // ─── Charge the cancellation fee, if one applies ───
  let feeCharged = false;
  let feeUncollected = false;
  if (feeJmd > 0) {
    const label = `${cancelled.pickup_name} → ${cancelled.dropoff_name}`;
    const result = await chargeFee(supabase, {
      riderId: user.id,
      driverUserId,
      feeJmd,
      rideId: cancelled.id,
      feeType: "cancellation",
      label,
    });
    if (result.ok) {
      feeCharged = true;
      await supabase
        .from("rides")
        .update({
          settlement_status: result.driverCredited
            ? "cancel_fee_settled"
            : "cancel_fee_driver_credit_failed",
        })
        .eq("id", cancelled.id);
    } else {
      // Wallet too low (or another failure) — the cancellation still
      // stands, but flag the ride so admin can collect and the rider
      // is blocked from booking again until it clears.
      feeUncollected = true;
      await supabase
        .from("rides")
        .update({
          settlement_status: FEE_UNCOLLECTED_STATUS,
          settlement_error: `Cancellation fee JMD ${feeJmd} uncollected: ${result.error.slice(0, 400)}`,
        })
        .eq("id", cancelled.id);
    }
  }

  await supabase.from("ride_events").insert({
    ride_id: cancelled.id,
    event: "cancelled",
    actor_role: "rider",
    actor_id: user.id,
    metadata: {
      reason,
      cancellationFeeJmd: feeJmd,
      feeCharged,
      feeUncollected,
    },
  });

  // Best-effort confirmation email — rider just cancelled their own
  // ride, so we already have their auth user object in scope.
  if (user.email) {
    const { data: profile } = await auth
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    void sendTripCancelledEmail(user.email, {
      riderFirstName: profile?.full_name ?? null,
      rideId: cancelled.id,
      pickup: cancelled.pickup_name,
      dropoff: cancelled.dropoff_name,
      cancelledBy: "rider",
      reason,
    }).catch(() => null);
  }

  // If the trip had been accepted, push the assigned driver so they
  // know to free up and stop heading to the pickup.
  if (driverUserId) {
    void (async () => {
      try {
        // Include the rider's cancellation reason in the body so the
        // driver knows WHY the trip is gone (not just that it is).
        // Truncated to keep the push payload + Android notification
        // body readable on a phone.
        const reasonLine = reason
          ? `Reason: ${reason.slice(0, 120)}`
          : "No reason given.";
        await notifyDriver(supabase, {
          driverUserId,
          kind: "trip_update",
          title: "Rider cancelled the trip",
          body: `${cancelled.pickup_name} → ${cancelled.dropoff_name}. ${reasonLine}`,
          href: "/driver",
          cta: "Back to inbox",
          pushTag: `ride-${cancelled.id}-status`,
          pushRenotify: true,
        });
      } catch {
        /* best-effort */
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    cancellationFeeJmd: feeJmd,
    feeCharged,
    feeUncollected,
  });
}
