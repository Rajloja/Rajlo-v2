/**
 * Route taxi journey orchestrator.
 *
 * Handles the state machine for a multi-leg `route_journeys` row:
 *   - `settleLeg`       — called when a leg's driver hits "completed".
 *                          Consumes the hold portion, writes the
 *                          rider debit, credits the driver, and
 *                          bumps the journey's settled totals.
 *   - `advanceJourney`  — after a leg settles, decides what's next:
 *                          create the next leg's hail + broadcast it
 *                          (with predictive matcher nudge), or mark
 *                          the journey complete if that was the
 *                          final leg.
 *   - `cancelJourney`   — release whatever's left in the hold and
 *                          mark the journey cancelled. Already-
 *                          settled legs stay debited.
 *
 * All three operations are best-effort recoverable: if a step fails
 * we log and let admin tooling reconcile from the leg rows (the
 * source of truth) rather than blocking the rider/driver UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consumeHoldPortion,
  releaseHold,
  getHold,
} from "@/lib/wallet-holds";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { splitFare } from "@/lib/fare-engine";
import { notifyDriver, notifyRouteTaxiDrivers } from "@/lib/notify";
import {
  findTransferCandidates,
  TRANSFER_NEARBY_KM,
} from "@/lib/route-taxi-transfer-matcher";
import type { CorridorPath, CorridorLeg } from "@/lib/route-taxi-pathfinder";

type JourneyRow = {
  id: string;
  rider_id: string;
  status: "planning" | "active" | "completed" | "cancelled";
  total_fare_jmd: number;
  planned_leg_count: number;
  completed_leg_count: number;
  settled_fare_jmd: number;
  refunded_fare_jmd: number;
  plan: CorridorPath;
  destination_name: string;
  destination_lat: number | null;
  destination_lng: number | null;
  concession: boolean;
};

type HailRow = {
  id: string;
  rider_id: string;
  route_id: string;
  session_id: string | null;
  journey_id: string | null;
  leg_order: number | null;
  is_transfer_leg: boolean;
  status: string;
  fare_jmd: number;
  pickup_name: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_name: string;
  dropoff_lat: number;
  dropoff_lng: number;
};

/**
 * Resolve a journey by id. Returns null if not found.
 */
export async function getJourney(
  supabase: SupabaseClient,
  journeyId: string,
): Promise<JourneyRow | null> {
  const { data } = await supabase
    .from("route_journeys")
    .select(
      "id, rider_id, status, total_fare_jmd, planned_leg_count, completed_leg_count, settled_fare_jmd, refunded_fare_jmd, plan, destination_name, destination_lat, destination_lng, concession",
    )
    .eq("id", journeyId)
    .maybeSingle();
  return (data as JourneyRow | null) ?? null;
}

/**
 * Find the journey's active hold row (status='active'). Returns null
 * if no active hold exists — e.g. the journey was already cancelled
 * and the hold released, or settled flat to zero.
 */
async function getActiveJourneyHold(
  supabase: SupabaseClient,
  journeyId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("wallet_holds")
    .select("id")
    .eq("journey_id", journeyId)
    .eq("status", "active")
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/* ──────────────────────────────────────────────────────────────────
   Settlement — one leg done.
   ────────────────────────────────────────────────────────────────── */

export type SettleLegResult = {
  ok: boolean;
  driverEarningsJmd: number;
  commissionJmd: number;
  /** Rider wallet balance immediately after the debit. */
  riderBalanceAfter: number | null;
  /** Truthy if the debit succeeded but a downstream step (hold,
   *  driver credit, journey row update) failed. The leg is settled
   *  from the rider's perspective; admin tooling reconciles. */
  warnings: string[];
};

/**
 * Settle a single leg of a journey. Ordering matters:
 *   1. Rider debit (real money out) — the canonical source of truth.
 *   2. Consume the hold portion so available balance recomputes
 *      correctly (we don't want the same money showing as both
 *      "spent" and "locked").
 *   3. Driver credit.
 *   4. Journey row settled totals + completed_leg_count.
 *
 * Each step logs on failure but the function returns ok=true as long
 * as step 1 succeeded. The hail row's transition to `completed` is
 * the caller's responsibility (this helper doesn't touch it so we
 * keep the trigger and the API endpoint clean of overlap).
 */
export async function settleLeg(
  supabase: SupabaseClient,
  hail: HailRow,
  journey: JourneyRow,
  driverUserId: string,
): Promise<SettleLegResult & { transactionIds: { debit: string | null; credit: string | null } }> {
  const warnings: string[] = [];
  const fareJmd = hail.fare_jmd;
  const { driverEarningsJmd, commissionJmd } = splitFare(fareJmd);

  // 1. Rider debit — even though the hold is in place, the actual
  //    money movement still goes through the wallet trigger which
  //    enforces non-negative balance. Hold is application-level.
  const debit = await debitWallet(
    supabase,
    hail.rider_id,
    fareJmd,
    "ride_charge",
    {
      description: `Route taxi · leg ${hail.leg_order ?? "?"} · ${hail.pickup_name} → ${hail.dropoff_name}`,
      metadata: {
        route_hail_id: hail.id,
        route_journey_id: journey.id,
        leg_order: hail.leg_order,
        kind: "route_taxi",
      },
    },
  );
  if (!debit.ok) {
    return {
      ok: false,
      driverEarningsJmd,
      commissionJmd,
      riderBalanceAfter: null,
      warnings: [debit.error ?? "rider debit failed"],
      transactionIds: { debit: null, credit: null },
    };
  }

  // 2. Consume the hold portion. We look up the active hold by
  //    journey — there should be exactly one. If the lookup misses
  //    (e.g. the hold was already released) we log a warning rather
  //    than fail the settlement, since the rider debit already
  //    happened.
  const activeHold = await getActiveJourneyHold(supabase, journey.id);
  if (activeHold) {
    const consume = await consumeHoldPortion(
      supabase,
      activeHold.id,
      fareJmd,
    );
    if (!consume.ok) {
      warnings.push(
        `hold consume failed: ${consume.error} (hold=${activeHold.id})`,
      );
    }
  } else {
    warnings.push(`no active hold found for journey ${journey.id}`);
  }

  // 3. Credit the driver their share.
  let creditId: string | null = null;
  const credit = await creditWallet(
    supabase,
    driverUserId,
    driverEarningsJmd,
    "ride_earning",
    {
      description: `Route taxi · leg ${hail.leg_order ?? "?"} · ${hail.pickup_name} → ${hail.dropoff_name}`,
      metadata: {
        route_hail_id: hail.id,
        route_journey_id: journey.id,
        leg_order: hail.leg_order,
        kind: "route_taxi",
        gross_fare_jmd: fareJmd,
        commission_jmd: commissionJmd,
      },
    },
  );
  if (!credit.ok) {
    warnings.push(`driver credit failed: ${credit.error}`);
  } else {
    creditId = credit.transactionId;
  }

  // 4. Bump the journey row's settled totals.
  const newSettled = journey.settled_fare_jmd + fareJmd;
  const newCompletedCount = journey.completed_leg_count + 1;
  const isFinalLeg = newCompletedCount >= journey.planned_leg_count;
  const nextStatus: JourneyRow["status"] = isFinalLeg ? "completed" : "active";

  const { error: bumpError } = await supabase
    .from("route_journeys")
    .update({
      settled_fare_jmd: newSettled,
      completed_leg_count: newCompletedCount,
      status: nextStatus,
      completed_at: isFinalLeg ? new Date().toISOString() : null,
    })
    .eq("id", journey.id)
    .eq("status", "active"); // optimistic guard against double-settle

  if (bumpError) {
    warnings.push(`journey row update failed: ${bumpError.message}`);
  }

  return {
    ok: true,
    driverEarningsJmd,
    commissionJmd,
    riderBalanceAfter: debit.balanceAfter,
    warnings,
    transactionIds: { debit: debit.transactionId, credit: creditId },
  };
}

/* ──────────────────────────────────────────────────────────────────
   Advance — create the next leg's hail + broadcast.
   ────────────────────────────────────────────────────────────────── */

export type AdvanceResult =
  | { kind: "completed"; journeyId: string }
  | { kind: "next_leg_created"; journeyId: string; hailId: string; broadcastCount: number }
  | { kind: "no_op"; reason: string };

/**
 * After a leg settles, decide what's next:
 *
 *   - If the just-completed leg was the final one → journey is done.
 *   - Otherwise → create the next leg's hail row (status=requested,
 *     is_transfer_leg=true) using the saved plan, then broadcast.
 *     The broadcast goes to every active driver on the next corridor;
 *     within that, the predictive matcher pushes a higher-priority
 *     "transfer passenger coming" notification to drivers physically
 *     near the transfer point.
 *
 * The next-leg hail is unlocked — no specific driver is reserved.
 * The actual driver-rider lock happens when the rider scans the
 * driver's QR via /api/rider/route-taxi/journeys/[id]/claim.
 *
 * Idempotent: if the next leg already exists (re-call after a retry),
 * we no-op rather than double-create.
 */
export async function advanceJourney(
  supabase: SupabaseClient,
  args: {
    journeyId: string;
    /** Just-completed leg's order (1-indexed). */
    justCompletedLegOrder: number;
    /** Where the rider was dropped off — used by the predictive
     *  matcher to find nearby drivers. */
    transferLat: number | null;
    transferLng: number | null;
    riderFirstName?: string | null;
  },
): Promise<AdvanceResult> {
  const journey = await getJourney(supabase, args.journeyId);
  if (!journey) {
    return { kind: "no_op", reason: "journey_not_found" };
  }
  if (journey.status === "completed") {
    return { kind: "completed", journeyId: journey.id };
  }
  if (journey.status === "cancelled") {
    return { kind: "no_op", reason: "journey_cancelled" };
  }

  const nextLegOrder = args.justCompletedLegOrder + 1;
  if (nextLegOrder > journey.planned_leg_count) {
    // Journey row should already be marked completed by settleLeg.
    return { kind: "completed", journeyId: journey.id };
  }

  // Idempotency: bail if a hail for this leg already exists.
  const { data: existing } = await supabase
    .from("route_hails")
    .select("id, status")
    .eq("journey_id", journey.id)
    .eq("leg_order", nextLegOrder)
    .maybeSingle();
  if (existing) {
    return {
      kind: "no_op",
      reason: `leg ${nextLegOrder} already exists (status=${(existing as { status: string }).status})`,
    };
  }

  const plan = journey.plan;
  const nextLeg: CorridorLeg | undefined = plan.legs[nextLegOrder - 1];
  if (!nextLeg) {
    return { kind: "no_op", reason: "plan missing next leg" };
  }

  // Pickup of leg N+1 = dropoff of leg N (the transfer point). For
  // the final leg, the dropoff is the rider's typed destination so
  // we use the journey's destination_lat/lng + destination_name.
  const isFinalLeg = nextLegOrder === journey.planned_leg_count;
  const dropoffName = isFinalLeg ? journey.destination_name : nextLeg.destination;
  const dropoffLat = isFinalLeg ? journey.destination_lat : nextLeg.destinationLat;
  const dropoffLng = isFinalLeg ? journey.destination_lng : nextLeg.destinationLng;

  // Insert the leg's hail row.
  const { data: hailRow, error: insertError } = await supabase
    .from("route_hails")
    .insert({
      rider_id: journey.rider_id,
      route_id: nextLeg.routeId,
      session_id: null,
      pickup_name: nextLeg.origin,
      pickup_lat: args.transferLat ?? 0,
      pickup_lng: args.transferLng ?? 0,
      pickup_parish: null,
      dropoff_name: dropoffName,
      dropoff_lat: dropoffLat ?? 0,
      dropoff_lng: dropoffLng ?? 0,
      dropoff_parish: null,
      distance_km: nextLeg.distanceKm,
      fare_jmd: nextLeg.fareJmd,
      concession: journey.concession,
      status: "requested",
      journey_id: journey.id,
      leg_order: nextLegOrder,
      is_transfer_leg: true,
    })
    .select("id")
    .single();

  if (insertError || !hailRow) {
    return {
      kind: "no_op",
      reason: `next leg insert failed: ${insertError?.message ?? "unknown"}`,
    };
  }

  const hailId = hailRow.id as string;

  // Corridor-wide broadcast (same as a normal hail) — every active
  // driver on the next corridor sees it appear in their hail list.
  void notifyRouteTaxiDrivers(supabase, nextLeg.routeId, {
    kind: "ride_available",
    title: `Transfer passenger · leg ${nextLegOrder} of ${journey.planned_leg_count}`,
    body: `${nextLeg.origin} → ${dropoffName} · JMD ${nextLeg.fareJmd.toLocaleString("en-JM")}`,
    href: "/driver/route-taxi",
    pushTag: `route-hail-${hailId}`,
    pushRenotify: true,
    requireInteraction: true,
    pushOnly: true,
  }).catch(() => null);

  // Predictive nudge — push to drivers physically near the transfer
  // point with a stronger, more specific "you're 5 min from the
  // transfer" notification. Best-effort.
  let priorityCount = 0;
  try {
    const candidates = await findTransferCandidates(supabase, {
      routeId: nextLeg.routeId,
      transferLat: args.transferLat,
      transferLng: args.transferLng,
      maxKm: TRANSFER_NEARBY_KM,
    });
    const riderLabel = args.riderFirstName?.trim() || "A rider";
    await Promise.all(
      candidates.slice(0, 3).map((c) =>
        notifyDriver(supabase, {
          driverUserId: c.driverUserId,
          kind: "trip_update",
          title: "Transfer passenger arriving",
          body: `${riderLabel} just finished leg ${args.justCompletedLegOrder} at ${nextLeg.origin}. Heading your way for ${dropoffName} — JMD ${nextLeg.fareJmd.toLocaleString("en-JM")}.`,
          href: "/driver/route-taxi",
          pushTag: `route-hail-${hailId}`,
          pushRenotify: true,
          requireInteraction: true,
        }).catch(() => null),
      ),
    );
    priorityCount = Math.min(3, candidates.length);
  } catch {
    /* predictive nudge is best-effort */
  }

  return {
    kind: "next_leg_created",
    journeyId: journey.id,
    hailId,
    broadcastCount: priorityCount,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Predictive pre-broadcast — fire next-leg before current ends.
   ──────────────────────────────────────────────────────────────────
   Called from the driver-position endpoint when the carrying driver
   reports they're close to the leg's dropoff. We create the next
   leg's hail row (idempotent against `advanceJourney`) and broadcast
   it so candidate drivers on the next corridor have time to converge
   on the transfer point before the rider arrives.

   The current leg's `transfer_broadcast_at` is stamped so a chatty
   GPS doesn't re-fire the broadcast on every position update. */

export async function prebroadcastNextLeg(
  supabase: SupabaseClient,
  args: {
    /** Current leg's hail (the one the rider is onboard for). */
    hail: HailRow & { transfer_broadcast_at?: string | null };
    /** Driver carrying the rider — for the heads-up notification body. */
    riderFirstName?: string | null;
  },
): Promise<AdvanceResult> {
  const hail = args.hail;
  if (!hail.journey_id || !hail.leg_order) {
    return { kind: "no_op", reason: "not_a_journey_leg" };
  }
  if (hail.transfer_broadcast_at) {
    return { kind: "no_op", reason: "already_broadcast" };
  }

  // Stamp first — race-safe so a parallel position update can't
  // double-broadcast. Optimistic guard: only succeeds if the column
  // is still NULL.
  const { data: stamped, error: stampError } = await supabase
    .from("route_hails")
    .update({ transfer_broadcast_at: new Date().toISOString() })
    .eq("id", hail.id)
    .is("transfer_broadcast_at", null)
    .select("id")
    .maybeSingle();
  if (stampError) {
    return {
      kind: "no_op",
      reason: `stamp failed: ${stampError.message}`,
    };
  }
  if (!stamped) {
    // Lost the race — another position update beat us to it.
    return { kind: "no_op", reason: "already_broadcast" };
  }

  // Reuse advanceJourney's idempotent leg creation. Even though the
  // current leg hasn't completed yet, the next leg's hail is just a
  // `requested` row waiting on a driver — no state contradiction.
  // advanceJourney handles the "leg already exists" case as a no-op.
  return advanceJourney(supabase, {
    journeyId: hail.journey_id,
    justCompletedLegOrder: hail.leg_order,
    transferLat: hail.dropoff_lat as number | null,
    transferLng: hail.dropoff_lng as number | null,
    riderFirstName: args.riderFirstName,
  });
}

/* ──────────────────────────────────────────────────────────────────
   Cancel — release the hold, mark cancelled.
   ────────────────────────────────────────────────────────────────── */

export type CancelJourneyResult = {
  ok: boolean;
  refundedJmd: number;
  warnings: string[];
};

/**
 * Cancel a journey mid-flight. Releases the active hold (refunds the
 * unspent portion back to the rider's available balance) and marks
 * any in-flight leg hails as cancelled. Already-settled legs stay
 * debited (the rider got those rides; the driver got paid).
 *
 * If the journey is already terminal, this is a no-op.
 */
export async function cancelJourney(
  supabase: SupabaseClient,
  args: {
    journeyId: string;
    reason: string;
    cancelledBy: "rider" | "driver" | "system" | "admin";
  },
): Promise<CancelJourneyResult> {
  const warnings: string[] = [];
  const journey = await getJourney(supabase, args.journeyId);
  if (!journey) {
    return { ok: false, refundedJmd: 0, warnings: ["journey not found"] };
  }
  if (journey.status === "completed" || journey.status === "cancelled") {
    return {
      ok: true,
      refundedJmd: 0,
      warnings: [`already ${journey.status}`],
    };
  }

  // 1. Release the hold. Captures the refunded amount for the
  //    response — the rider's confirmation UI shows "JMD $X
  //    refunded to your wallet".
  let refundedJmd = 0;
  const activeHold = await getActiveJourneyHold(supabase, journey.id);
  if (activeHold) {
    const holdBefore = await getHold(supabase, activeHold.id);
    const beforeAmount = holdBefore?.amountJmd ?? 0;
    const release = await releaseHold(
      supabase,
      activeHold.id,
      `journey_cancel:${args.reason}`,
    );
    if (!release.ok) {
      warnings.push(`hold release failed: ${release.error}`);
    } else {
      refundedJmd = beforeAmount;
    }
  }

  // 2. Cancel any non-terminal leg hails. We don't refund per-leg
  //    here — the hold release covers the unsettled total.
  await supabase
    .from("route_hails")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: `${args.cancelledBy} cancelled journey: ${args.reason}`,
    })
    .eq("journey_id", journey.id)
    .in("status", ["requested", "accepted", "picked_up"]);

  // 3. Mark the journey itself cancelled.
  const { error: journeyError } = await supabase
    .from("route_journeys")
    .update({
      status: "cancelled",
      cancellation_reason: args.reason,
      cancelled_by: args.cancelledBy,
      cancelled_at: new Date().toISOString(),
      refunded_fare_jmd: refundedJmd,
    })
    .eq("id", journey.id)
    .in("status", ["planning", "active"]);

  if (journeyError) {
    warnings.push(`journey row update failed: ${journeyError.message}`);
  }

  return { ok: true, refundedJmd, warnings };
}
