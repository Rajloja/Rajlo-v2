import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { creditWallet, debitWallet } from "@/lib/wallet";
import { getBalanceWithLock } from "@/lib/wallet-holds";
import { splitFare } from "@/lib/fare-engine";
import { notifyDriver } from "@/lib/notify";

/**
 * POST /api/rider/qr/confirm
 *
 * Body: { code: string }
 *
 * Atomic settlement of a QR pay charge:
 *   1. Re-validate the code (status, expiry, ownership).
 *   2. Atomically flip status to 'confirmed' with the rider's user id
 *      — this is the lock that prevents two devices confirming the
 *      same code simultaneously. The UPDATE includes
 *      `WHERE status = 'pending'` so a race loses cleanly.
 *   3. Debit rider wallet `amount_jmd` (cashless rule: insufficient
 *      balance → 402, no fudging).
 *   4. Credit driver wallet `driver_earnings_jmd` (fare − commission).
 *   5. Stamp the settlement amounts + transaction ids on the charge.
 *   6. Notify the driver — their UI is polling but the push lands
 *      in their pocket too.
 *
 * If step 3 fails (balance dropped between preview and confirm), we
 * roll the charge back to 'pending' so the rider can top up and
 * re-confirm without the driver having to mint a new code.
 */

type ConfirmBody = { code?: unknown };

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmBody;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || code.length !== 8) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const { data: charge } = await supabase
    .from("qr_charges")
    .select(
      "id, amount_jmd, description, status, expires_at, driver_user_id, driver_id",
    )
    .eq("code", code)
    .maybeSingle();

  if (!charge) {
    return NextResponse.json({ error: "code_not_found" }, { status: 404 });
  }
  if (charge.driver_user_id === user.id) {
    return NextResponse.json({ error: "self_pay" }, { status: 400 });
  }
  if (charge.status !== "pending") {
    return NextResponse.json(
      { error: charge.status === "confirmed" ? "already_paid" : "no_longer_valid" },
      { status: charge.status === "confirmed" ? 409 : 410 },
    );
  }
  if (new Date(charge.expires_at) < new Date()) {
    await supabase
      .from("qr_charges")
      .update({ status: "expired" })
      .eq("id", charge.id)
      .eq("status", "pending");
    return NextResponse.json(
      { error: "expired", message: "This charge expired — ask for a new code." },
      { status: 410 },
    );
  }

  // Lock the charge to this rider before any wallet movement.
  // Optimistic concurrency on `status = 'pending'` so two devices
  // racing to confirm the same code produce exactly one winner.
  const { data: locked, error: lockError } = await supabase
    .from("qr_charges")
    .update({
      status: "confirmed",
      rider_user_id: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", charge.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (lockError || !locked) {
    return NextResponse.json(
      { error: "race_lost", message: "Someone else just paid that code." },
      { status: 409 },
    );
  }

  const fareJmd = charge.amount_jmd as number;
  const { driverEarningsJmd, commissionJmd } = splitFare(fareJmd);

  // Pre-check available balance so we don't drain funds that are
  // locked for an in-flight multi-leg journey. The DB trigger only
  // blocks the raw negative case; the hold check is application-level.
  const { availableJmd, lockedJmd } = await getBalanceWithLock(
    supabase,
    user.id,
  );
  if (availableJmd < fareJmd) {
    // Roll the charge back so the driver's QR is still valid and the
    // rider can retry after topping up.
    await supabase
      .from("qr_charges")
      .update({
        status: "pending",
        rider_user_id: null,
        confirmed_at: null,
      })
      .eq("id", charge.id);
    return NextResponse.json(
      {
        error: "insufficient_balance",
        message: lockedJmd > 0
          ? `Top up your wallet — this charge is JMD $${fareJmd}. JMD $${lockedJmd} is locked for an active trip.`
          : `Top up your wallet — this charge is JMD $${fareJmd}.`,
        fareJmd,
        availableJmd,
        lockedJmd,
      },
      { status: 402 },
    );
  }

  // 1. Debit the rider.
  const debit = await debitWallet(supabase, user.id, fareJmd, "ride_charge", {
    description:
      charge.description ?? `QR pay · driver charge`,
    metadata: { qr_charge_id: charge.id, kind: "qr_pay" },
  });
  if (!debit.ok) {
    // Roll the charge back so the driver's QR is still valid and the
    // rider can retry after topping up.
    await supabase
      .from("qr_charges")
      .update({
        status: "pending",
        rider_user_id: null,
        confirmed_at: null,
      })
      .eq("id", charge.id);
    return NextResponse.json(
      {
        error: debit.insufficientFunds ? "insufficient_balance" : debit.error,
        message: debit.insufficientFunds
          ? `Top up your wallet — this charge is JMD $${fareJmd}.`
          : "Couldn't move the funds. Try again.",
        fareJmd,
      },
      { status: debit.insufficientFunds ? 402 : 500 },
    );
  }

  // 2. Credit the driver their earnings (after commission).
  const credit = await creditWallet(
    supabase,
    charge.driver_user_id,
    driverEarningsJmd,
    "ride_earning",
    {
      description: charge.description ?? "QR pay charge",
      metadata: {
        qr_charge_id: charge.id,
        kind: "qr_pay",
        gross_amount_jmd: fareJmd,
        commission_jmd: commissionJmd,
      },
    },
  );
  if (!credit.ok) {
    // The rider was already charged. Stamp the failure on the row so
    // admin can manually move the driver credit. Don't fail the
    // request — the rider's payment IS through.
    console.error(
      `qr-pay settlement: rider charged but driver credit failed (charge ${charge.id}): ${credit.error}`,
    );
  }

  // 3. Stamp settlement.
  await supabase
    .from("qr_charges")
    .update({
      commission_jmd: commissionJmd,
      driver_earnings_jmd: driverEarningsJmd,
      rider_charge_transaction_id: debit.transactionId,
      driver_credit_transaction_id: credit.ok ? credit.transactionId : null,
    })
    .eq("id", charge.id);

  // 4. Notify the driver. Best-effort.
  void notifyDriver(supabase, {
    driverUserId: charge.driver_user_id,
    kind: "system",
    title: `JMD $${fareJmd} paid`,
    body: `Your wallet credited JMD $${driverEarningsJmd}. Tap to view.`,
    href: "/driver/wallet",
    cta: "Open wallet",
    pushTag: `qr-charge-${charge.id}`,
    pushRenotify: false,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    fareJmd,
    riderBalanceAfter: debit.balanceAfter,
  });
}
