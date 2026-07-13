import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  sendTripCompletedEmail,
  sendDriverTripCompletedEmail,
} from "@/lib/email-templates";
import { notifyRider } from "@/lib/notify";
import { resolveDriverEmail } from "@/lib/driver-email-resolver";
import { creditWallet, debitWallet } from "@/lib/wallet";
import {
  consumeHoldPortion,
  getActiveHoldForRide,
  releaseHold,
} from "@/lib/wallet-holds";
import { splitFare } from "@/lib/fare-engine";
import {
  noShowWaitElapsed,
  chargeFee,
  NO_SHOW_FEE_JMD,
  FEE_UNCOLLECTED_STATUS,
} from "@/lib/cancellation-fees";

/**
 * POST /api/driver/rides/[id]/status
 *
 * Drives the ride status state-machine forward. Only the driver assigned
 * to the ride can call this, and only valid transitions are allowed:
 *
 *   accepted    → arrived
 *   arrived     → in_progress
 *   in_progress → completed
 *
 * Each transition stamps the matching timestamp column + writes a
 * ride_events row for the audit trail.
 *
 * A fourth action, `no_show`, is not a forward transition — it
 * cancels an `arrived` ride after the driver has waited the full
 * pickup window and charges the rider the no-show fee.
 *
 * Body: { action: "arrived" | "start" | "complete" | "no_show" }
 */

type Action = "arrived" | "start" | "complete" | "no_show";

const TRANSITIONS: Record<
  Exclude<Action, "no_show">,
  { from: string; to: string; tsColumn: string; eventName: string }
> = {
  arrived: {
    from: "accepted",
    to: "arrived",
    tsColumn: "arrived_at",
    eventName: "arrived",
  },
  start: {
    from: "arrived",
    to: "in_progress",
    tsColumn: "started_at",
    eventName: "started",
  },
  complete: {
    from: "in_progress",
    to: "completed",
    tsColumn: "completed_at",
    eventName: "completed",
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action as Action | undefined;

  if (!action || (action !== "no_show" && !(action in TRANSITIONS))) {
    return NextResponse.json(
      { error: "action must be one of: arrived, start, complete, no_show" },
      { status: 400 },
    );
  }

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

  // The caller must be the driver assigned to this ride.
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, external_id, activated, deactivated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!driver.activated || driver.deactivated_at) {
    return NextResponse.json(
      { error: "Your driver account isn't currently active" },
      { status: 403 },
    );
  }

  // ─── No-show cancellation (driver-triggered) ───
  // The driver waited the full no-show window after marking `arrived`
  // and the rider never boarded. Cancels the ride and charges the
  // rider the no-show fee (driver keeps 80%).
  if (action === "no_show") {
    const { data: nsRide } = await supabase
      .from("rides")
      .select(
        "id, status, arrived_at, rider_id, carpool_group_id, pickup_name, dropoff_name",
      )
      .eq("id", id)
      .eq("driver_id", driver.id)
      .maybeSingle();
    if (!nsRide) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (nsRide.carpool_group_id) {
      return NextResponse.json(
        {
          error:
            "A no-show on a shared carpool trip can't be self-served — contact support.",
        },
        { status: 409 },
      );
    }
    if (nsRide.status !== "arrived") {
      return NextResponse.json(
        {
          error:
            "A no-show can only be reported after you've marked Arrived.",
        },
        { status: 409 },
      );
    }
    const wait = noShowWaitElapsed(nsRide.arrived_at, "private");
    if (!wait.eligible) {
      const remainingMin = Math.ceil((wait.waitSec - wait.elapsedSec) / 60);
      return NextResponse.json(
        {
          error: `Wait the full ${Math.round(wait.waitSec / 60)}-minute pickup window before reporting a no-show — about ${remainingMin} min left.`,
          waitSecRemaining: Math.max(
            0,
            Math.round(wait.waitSec - wait.elapsedSec),
          ),
        },
        { status: 409 },
      );
    }

    const cancelledAt = new Date().toISOString();
    const { data: nsCancelled } = await supabase
      .from("rides")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        cancellation_reason: "rider_no_show",
      })
      .eq("id", nsRide.id)
      .eq("status", "arrived")
      .select("id")
      .maybeSingle();
    if (!nsCancelled) {
      return NextResponse.json(
        { error: "Ride is no longer in the 'arrived' state." },
        { status: 409 },
      );
    }

    const label = `${nsRide.pickup_name} → ${nsRide.dropoff_name}`;
    const fee = await chargeFee(supabase, {
      riderId: nsRide.rider_id,
      driverUserId: user.id,
      feeJmd: NO_SHOW_FEE_JMD,
      rideId: nsRide.id,
      feeType: "no_show",
      label,
    });
    await supabase
      .from("rides")
      .update({
        settlement_status: fee.ok
          ? fee.driverCredited
            ? "no_show_fee_settled"
            : "cancel_fee_driver_credit_failed"
          : FEE_UNCOLLECTED_STATUS,
        settlement_error: fee.ok
          ? null
          : `No-show fee JMD ${NO_SHOW_FEE_JMD} uncollected: ${fee.error.slice(0, 400)}`,
      })
      .eq("id", nsRide.id);

    await supabase.from("ride_events").insert({
      ride_id: nsRide.id,
      event: "cancelled",
      actor_role: "driver",
      actor_id: driver.external_id,
      metadata: {
        reason: "rider_no_show",
        noShowFeeJmd: NO_SHOW_FEE_JMD,
        feeCharged: fee.ok,
        feeUncollected: !fee.ok,
      },
    });

    void notifyRider(supabase, {
      riderId: nsRide.rider_id,
      kind: "trip",
      title: "Trip cancelled — no-show",
      body: fee.ok
        ? `Your driver waited at ${nsRide.pickup_name}. A JMD ${NO_SHOW_FEE_JMD} no-show fee was charged.`
        : `Your driver waited at ${nsRide.pickup_name}. A JMD ${NO_SHOW_FEE_JMD} no-show fee is outstanding.`,
      href: `/rider/history/${nsRide.id}`,
      cta: "View trip",
      pushTag: `ride-${nsRide.id}-status`,
      pushRenotify: true,
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      status: "cancelled",
      noShow: true,
      noShowFeeJmd: NO_SHOW_FEE_JMD,
      feeCharged: fee.ok,
    });
  }

  const transition = TRANSITIONS[action];

  // Look up the ride first so we know whether it's part of a carpool.
  // For carpool rides every status transition affects ALL rides in the
  // group together — when the driver taps "I've arrived" they're at
  // the (single) primary pickup and both rides move from accepted to
  // arrived; "Start trip" flips both to in_progress; "Complete"
  // completes both at once. The MVP doesn't support per-rider
  // sub-states (e.g. picked-up-A-but-still-driving-to-B); that's a
  // future refinement.
  const { data: target } = await supabase
    .from("rides")
    .select(
      "id, carpool_group_id, driver_id, start_pin, pin_verified_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!target || target.driver_id !== driver.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // PIN-verify gate. If the rider opted into a start PIN, the driver
  // must have entered the right code via /verify-pin before this
  // ride can move past `arrived`. For carpool rides we check ALL
  // legs that carry a PIN — both passengers' protections must clear
  // before the driver can roll.
  if (action === "start") {
    if (target.carpool_group_id) {
      const { data: legs } = await supabase
        .from("rides")
        .select("id, start_pin, pin_verified_at")
        .eq("carpool_group_id", target.carpool_group_id);
      const unverified = (legs ?? []).filter(
        (l) => l.start_pin && !l.pin_verified_at,
      );
      if (unverified.length > 0) {
        return NextResponse.json(
          { error: "pin_required", needsPin: true },
          { status: 412 },
        );
      }
    } else if (target.start_pin && !target.pin_verified_at) {
      return NextResponse.json(
        { error: "pin_required", needsPin: true },
        { status: 412 },
      );
    }
  }

  const now = new Date().toISOString();
  // Atomic state transition: only succeed if all targeted rides are
  // currently in the `from` state AND assigned to this driver.
  let updateQuery = supabase
    .from("rides")
    .update({
      status: transition.to,
      [transition.tsColumn]: now,
    })
    .eq("driver_id", driver.id)
    .eq("status", transition.from);

  if (target.carpool_group_id) {
    updateQuery = updateQuery.eq("carpool_group_id", target.carpool_group_id);
  } else {
    updateQuery = updateQuery.eq("id", id);
  }

  const { data: updated, error: updateError } = await updateQuery.select(
    "id, estimated_fare_jmd",
  );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error: `Ride is not in '${transition.from}' state, or you're not the assigned driver.`,
      },
      { status: 409 },
    );
  }

  // Per-ride settlement outcome, populated ONLY when action === "complete".
  // Threaded into the response so the driver's client can render a
  // "settled + JMD X" flash for the happy path and a warning banner
  // when settlement lands in one of the failure branches. Declared at
  // function scope (not inside the completion block below) so the
  // final return statement can always read it — for non-complete
  // actions it stays an empty array.
  type SettlementOutcome = {
    rideId: string;
    status:
      | "settled"
      | "rider_debit_failed"
      | "driver_credit_failed"
      | "skipped_zero_fare";
    earningsJmd: number | null;
    error: string | null;
  };
  const settlements: SettlementOutcome[] = [];

  // For "complete" we additionally backfill final_fare_jmd from each
  // ride's own estimate. We do it per-row so each rider's row gets
  // their own fare snapshot rather than a copy of the group's.
  if (action === "complete") {
    await Promise.all(
      updated.map((row) =>
        supabase
          .from("rides")
          .update({ final_fare_jmd: row.estimated_fare_jmd })
          .eq("id", row.id),
      ),
    );
    // Mark the carpool group itself as completed so the group row
    // tells a coherent story for any future analytics.
    if (target.carpool_group_id) {
      await supabase
        .from("carpool_groups")
        .update({ status: "completed" })
        .eq("id", target.carpool_group_id);
    }

    // Money movement on completion. SYNCHRONOUS — we wait for the
    // settlement to land (or fail and be recorded) before responding,
    // so the driver's UI never sees a "trip complete" without the
    // platform also knowing whether the money moved.
    //
    // Ordering per ride:
    //   1. Debit the rider their full fare.
    //   2. Credit the driver their earnings (fare − 15% commission).
    //   3. Stamp settlement_status + transaction IDs on the ride row.
    //
    // We do NOT roll back the completion if either leg fails — the
    // trip physically happened, the driver already drove it. Instead
    // we mark the ride as needing admin reconciliation. The
    // /admin/rides surface (TODO) filters on settlement_status to
    // surface any ride that never settled cleanly.
    const { data: completedRides } = await supabase
      .from("rides")
      .select(
        "id, rider_id, final_fare_jmd, estimated_fare_jmd, pickup_name, dropoff_name",
      )
      .in(
        "id",
        updated.map((u) => u.id),
      );

    for (const ride of (completedRides ?? []) as Array<{
      id: string;
      rider_id: string;
      final_fare_jmd: number | null;
      estimated_fare_jmd: number;
      pickup_name: string;
      dropoff_name: string;
    }>) {
      const fare = ride.final_fare_jmd ?? ride.estimated_fare_jmd;
      if (!fare || fare <= 0) {
        await supabase
          .from("rides")
          .update({ settlement_status: "skipped_zero_fare" })
          .eq("id", ride.id);
        settlements.push({
          rideId: ride.id,
          status: "skipped_zero_fare",
          earningsJmd: null,
          error: null,
        });
        continue;
      }
      const { driverEarningsJmd, commissionJmd } = splitFare(fare);
      const description = `Ride · ${ride.pickup_name} → ${ride.dropoff_name}`;

      // Pull the active hold placed at booking (if any). Rides created
      // BEFORE the private-ride-hold migration won't have one — fall
      // back to the pre-hold flow and let the debit succeed-or-fail on
      // its own. Post-migration rides ALWAYS have a hold because the
      // booking endpoint places one atomically with ride creation.
      const activeHold = await getActiveHoldForRide(supabase, ride.id);

      const debit = await debitWallet(
        supabase,
        ride.rider_id,
        fare,
        "ride_charge",
        { rideId: ride.id, description },
      );
      if (!debit.ok) {
        // Rider couldn't be charged. Under the hold model this should
        // now be much rarer — the hold reserved the estimated fare at
        // booking, so any subsequent withdrawal / transfer was
        // rejected as "insufficient available balance." The remaining
        // failure modes are (a) actual fare > estimated (rider added
        // stops or the driver stamped a final_fare_jmd above the
        // estimate), (b) admin manually released the hold, (c) trigger
        // race. Release the hold before we bail so the rider's locked
        // portion doesn't linger as a phantom — the debit failure
        // means the ride is going to admin-reconciliation regardless,
        // and stranded locks are a customer-support headache.
        if (activeHold) {
          await releaseHold(
            supabase,
            activeHold.id,
            "rider_debit_failed_on_complete",
          );
        }
        await supabase
          .from("rides")
          .update({
            settlement_status: "rider_debit_failed",
            settlement_error: debit.error.slice(0, 500),
            commission_jmd: commissionJmd,
            driver_earnings_jmd: driverEarningsJmd,
          })
          .eq("id", ride.id);
        settlements.push({
          rideId: ride.id,
          status: "rider_debit_failed",
          earningsJmd: driverEarningsJmd,
          error: debit.error.slice(0, 200),
        });
        continue;
      }

      // Debit succeeded — clear the hold. The hold amount MAY differ
      // from the actual fare (rider added a stop mid-trip that
      // ballooned the estimate, or driver stamped a lower final fare):
      //
      //   fare <= hold.amount → consume `fare`; releaseHold flips the
      //     remainder from `active` to `partial` (bookkeeping — money
      //     already moved via debitWallet).
      //   fare  > hold.amount → consume the full hold amount. The
      //     debit already succeeded which means the rider's raw balance
      //     covered the overage — the hold under-reserved but nothing
      //     is actually broken.
      if (activeHold) {
        const consumeAmount = Math.min(fare, activeHold.amountJmd);
        await consumeHoldPortion(supabase, activeHold.id, consumeAmount);
        // If any portion of the hold remains active after consume
        // (rider paid less than we reserved), release it back to the
        // rider's available balance. releaseHold on a fully-consumed
        // hold is a no-op — the status flipped to `consumed` inside
        // consumeHoldPortion when remaining hit 0.
        if (activeHold.amountJmd > consumeAmount) {
          await releaseHold(
            supabase,
            activeHold.id,
            "final_fare_below_estimate",
          );
        }
      }

      const credit = await creditWallet(
        supabase,
        user.id,
        driverEarningsJmd,
        "ride_earning",
        {
          rideId: ride.id,
          description,
          metadata: { gross_fare_jmd: fare, commission_jmd: commissionJmd },
        },
      );
      if (!credit.ok) {
        // Rider was charged but driver credit failed. The rider's
        // payment is REAL — we mark the ride for admin to manually
        // credit the driver via /admin/wallets/[userId]/adjust.
        await supabase
          .from("rides")
          .update({
            settlement_status: "driver_credit_failed",
            settlement_error: credit.error.slice(0, 500),
            commission_jmd: commissionJmd,
            driver_earnings_jmd: driverEarningsJmd,
            rider_charge_transaction_id: debit.transactionId,
            settled_at: new Date().toISOString(),
          })
          .eq("id", ride.id);
        settlements.push({
          rideId: ride.id,
          status: "driver_credit_failed",
          earningsJmd: driverEarningsJmd,
          error: credit.error.slice(0, 200),
        });
        continue;
      }

      await supabase
        .from("rides")
        .update({
          settlement_status: "settled",
          commission_jmd: commissionJmd,
          driver_earnings_jmd: driverEarningsJmd,
          rider_charge_transaction_id: debit.transactionId,
          driver_credit_transaction_id: credit.transactionId,
          settled_at: new Date().toISOString(),
        })
        .eq("id", ride.id);
      settlements.push({
        rideId: ride.id,
        status: "settled",
        earningsJmd: driverEarningsJmd,
        error: null,
      });
    }

    // Best-effort receipt email per affected rider. We pull each
    // ride's full record + driver name so the receipt has every detail.
    void (async () => {
      try {
        const ids = updated.map((u) => u.id);
        const [{ data: rideRows }, { data: driverFull }] = await Promise.all([
          supabase
            .from("rides")
            .select(
              "id, rider_id, pickup_name, dropoff_name, estimated_distance_km, started_at, completed_at, final_fare_jmd",
            )
            .in("id", ids),
          supabase
            .from("drivers")
            .select("first_name, last_name, email, user_id")
            .eq("id", driver.id)
            .maybeSingle(),
        ]);
        if (!rideRows) return;

        const driverName =
          [driverFull?.first_name, driverFull?.last_name]
            .filter(Boolean)
            .join(" ") || "Your driver";

        const riderIds = Array.from(new Set(rideRows.map((r) => r.rider_id)));
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", riderIds);
        const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
        const userLookups = await Promise.all(
          riderIds.map((id) =>
            supabase.auth.admin.getUserById(id).then((r) => ({
              id,
              email: r.data.user?.email ?? null,
            })),
          ),
        );
        const emailMap = new Map(userLookups.map((u) => [u.id, u.email]));

        // Resolve driver-side email once for the earnings receipts.
        const driverEmail = driverFull
          ? await resolveDriverEmail(supabase, driverFull)
          : null;

        await Promise.all(
          rideRows.flatMap((row) => {
            const email = emailMap.get(row.rider_id);
            const durationMinutes =
              row.started_at && row.completed_at
                ? Math.max(
                    1,
                    Math.round(
                      (new Date(row.completed_at).getTime() -
                        new Date(row.started_at).getTime()) /
                        60_000,
                    ),
                  )
                : null;
            const fare = `JMD ${Math.round(row.final_fare_jmd ?? 0).toLocaleString("en-JM")}`;
            const riderFullName =
              profileMap.get(row.rider_id)?.full_name ?? null;
            const tasks: Array<Promise<unknown>> = [
              notifyRider(supabase, {
                riderId: row.rider_id,
                kind: "trip",
                title: "Trip complete · rate your driver",
                body: `${row.dropoff_name} · ${fare}. Tap to rate ${driverName.split(" ")[0]}.`,
                href: `/rider/history/${row.id}?rate=1`,
                cta: "Rate this trip",
                pushTag: `ride-${row.id}-status`,
              }),
            ];
            if (email) {
              tasks.push(
                sendTripCompletedEmail(email, {
                  riderFirstName: riderFullName,
                  rideId: row.id,
                  pickup: row.pickup_name,
                  dropoff: row.dropoff_name,
                  fareJMD: row.final_fare_jmd,
                  distanceKm: row.estimated_distance_km,
                  durationMinutes,
                  driverName,
                  completedAt: row.completed_at,
                }).catch(() => null),
              );
            }
            // Driver earnings receipt — one per completed ride
            // (carpool: one earnings email per leg).
            if (driverEmail) {
              tasks.push(
                sendDriverTripCompletedEmail(driverEmail, {
                  driverName,
                  rideId: row.id,
                  pickup: row.pickup_name,
                  dropoff: row.dropoff_name,
                  fareJMD: row.final_fare_jmd,
                  distanceKm: row.estimated_distance_km,
                  durationMinutes,
                  riderFirstName: riderFullName?.split(" ")[0] ?? null,
                  completedAt: row.completed_at,
                }).catch(() => null),
              );
            }
            return tasks;
          }),
        );
      } catch {
        /* best-effort */
      }
    })();
  }

  // One audit row per ride affected — the per-ride event log stays a
  // complete narrative for each rider's view.
  await supabase.from("ride_events").insert(
    updated.map((row) => ({
      ride_id: row.id,
      event: transition.eventName,
      actor_role: "driver",
      actor_id: driver.external_id,
      metadata: {
        from: transition.from,
        to: transition.to,
        carpoolGroupId: target.carpool_group_id,
      },
    })),
  );

  // In-app inbox + push for arrival / start. Trip completion has its
  // own bespoke push below alongside the receipt email.
  //
  // For "arrived" we deliberately include the vehicle make / model /
  // colour / plate in the body so the rider has all the visual
  // identifiers on their lock screen — they can confirm the right
  // car before they get in without unlocking their phone.
  if (action === "arrived" || action === "start") {
    void (async () => {
      try {
        const ids = updated.map((u) => u.id);
        const [{ data: rideRows }, { data: driverFull }] = await Promise.all([
          supabase
            .from("rides")
            .select("id, rider_id, dropoff_name")
            .in("id", ids),
          supabase
            .from("drivers")
            .select(
              "plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color",
            )
            .eq("id", driver.id)
            .maybeSingle(),
        ]);
        if (!rideRows) return;

        const vehicle = driverFull
          ? [
              driverFull.vehicle_year ? String(driverFull.vehicle_year) : null,
              driverFull.vehicle_color,
              driverFull.vehicle_make,
              driverFull.vehicle_model,
            ]
              .filter(Boolean)
              .join(" ") || null
          : null;
        const plate = driverFull?.plate_number ?? null;

        await Promise.all(
          rideRows.map((row) =>
            notifyRider(supabase, {
              riderId: row.rider_id,
              kind: "trip",
              title:
                action === "arrived"
                  ? "Your driver is here!"
                  : "Trip started",
              body:
                action === "arrived"
                  ? // Lead with what to look for: "Look for the
                    // 2022 Silver Honda Civic · plate JM-AB-1234".
                    [
                      vehicle ? `Look for the ${vehicle}` : null,
                      plate ? `plate ${plate}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") ||
                    "Confirm the plate before you step in. Let's go!"
                  : `On the way to ${row.dropoff_name}.`,
              href: `/rider/live-trip?id=${row.id}`,
              cta:
                action === "arrived" ? "Open live trip" : "Track on map",
              pushTag: `ride-${row.id}-status`,
              pushRenotify: action === "arrived",
            }),
          ),
        );
      } catch {
        /* best-effort */
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    status: transition.to,
    affectedRideIds: updated.map((r) => r.id),
    // Empty for non-complete actions. On complete: one row per ride
    // touched. Driver client reads this to decide whether to show the
    // happy-path flash or the "trip completed but payment needs
    // reconciliation" warning banner.
    settlements,
  });
}
