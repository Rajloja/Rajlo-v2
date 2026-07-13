import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { notifyRider } from "@/lib/notify";
import { PIN_MAX_ATTEMPTS } from "@/lib/pin-verify";
import { getActiveHoldForRide, releaseHold } from "@/lib/wallet-holds";

/**
 * POST /api/driver/rides/[id]/verify-pin
 *
 * Body: { pin: string }
 *
 * Driver-only. Checks the submitted PIN against the ride's `start_pin`.
 *   • Correct → stamp pin_verified_at; the next status transition to
 *     in_progress will be allowed.
 *   • Wrong (still under PIN_MAX_ATTEMPTS) → increment pin_attempts,
 *     return 401 with remainingAttempts so the driver UI can show how
 *     many tries are left.
 *   • Wrong AND attempt count just hit PIN_MAX_ATTEMPTS → cancel the
 *     ride with reason 'pin_mismatch' so the rider gets the right
 *     "you got into the wrong car" message via the existing cancelled
 *     flow, and the driver is bounced back to the dashboard.
 *
 * Locked to rides where:
 *   - caller is the assigned driver
 *   - ride status is 'arrived' (we don't accept PIN before pickup nor
 *     during a moving trip)
 *   - start_pin is set (rides without a PIN don't accept this call)
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!/^[0-9]{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN must be 4 digits" },
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

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, external_id, activated, deactivated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver || !driver.activated || driver.deactivated_at) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: ride } = await supabase
    .from("rides")
    .select(
      "id, rider_id, driver_id, status, start_pin, pin_verified_at, pin_attempts, pickup_name",
    )
    .eq("id", id)
    .maybeSingle();
  if (!ride || ride.driver_id !== driver.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!ride.start_pin) {
    return NextResponse.json(
      { error: "No PIN required for this ride" },
      { status: 400 },
    );
  }
  if (ride.status !== "arrived") {
    return NextResponse.json(
      {
        error:
          "PIN can only be entered after you've arrived at pickup and before the trip starts.",
      },
      { status: 409 },
    );
  }
  if (ride.pin_verified_at) {
    // Already verified — idempotent success so a double-tap on the
    // submit button doesn't show a confusing error.
    return NextResponse.json({ ok: true, verified: true });
  }

  const now = new Date().toISOString();

  // Correct PIN — stamp verified-at and move on.
  if (pin === ride.start_pin) {
    const { error: upErr } = await supabase
      .from("rides")
      .update({ pin_verified_at: now })
      .eq("id", ride.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    await supabase.from("ride_events").insert({
      ride_id: ride.id,
      event: "pin_verified",
      actor_role: "driver",
      actor_id: driver.external_id,
      metadata: { attemptsUsed: (ride.pin_attempts ?? 0) + 1 },
    });
    return NextResponse.json({ ok: true, verified: true });
  }

  // Wrong PIN — increment and decide.
  const nextAttempts = (ride.pin_attempts ?? 0) + 1;
  const remainingAttempts = Math.max(0, PIN_MAX_ATTEMPTS - nextAttempts);

  if (nextAttempts >= PIN_MAX_ATTEMPTS) {
    // 3rd strike — cancel the ride. Driver gets bounced; rider sees
    // the cancelled state with a PIN-specific explanation.
    const { error: cancelErr } = await supabase
      .from("rides")
      .update({
        pin_attempts: nextAttempts,
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: "pin_mismatch",
      })
      .eq("id", ride.id);
    if (cancelErr) {
      return NextResponse.json({ error: cancelErr.message }, { status: 500 });
    }
    await supabase.from("ride_events").insert({
      ride_id: ride.id,
      event: "cancelled",
      actor_role: "system",
      metadata: {
        reason: "pin_mismatch",
        triggeredBy: "driver",
        attempts: nextAttempts,
      },
    });
    // PIN safety cancel — rider never boarded, no fee, pure refund.
    // Release the booking-time hold so the rider can immediately
    // request a fresh ride with the same funds.
    const hold = await getActiveHoldForRide(supabase, ride.id);
    if (hold) {
      await releaseHold(supabase, hold.id, "pin_mismatch_cancel");
    }
    // Tell the rider their PIN protection cancelled the ride — that's
    // actually a working safety system, not a failure mode they should
    // feel surprised by.
    void notifyRider(supabase, {
      riderId: ride.rider_id,
      kind: "trip",
      title: "Trip cancelled — wrong PIN",
      body: "The driver entered the wrong PIN 3 times. Your trip was cancelled for safety. You can request a new ride at any time.",
      href: `/rider/history/${ride.id}`,
      cta: "View details",
      pushTag: `ride-${ride.id}-status`,
    }).catch(() => null);
    return NextResponse.json(
      {
        error: "Too many wrong attempts — trip cancelled.",
        cancelled: true,
        remainingAttempts: 0,
      },
      { status: 423 },
    );
  }

  await supabase
    .from("rides")
    .update({ pin_attempts: nextAttempts })
    .eq("id", ride.id);
  // 422 (Unprocessable Entity) — the request was valid auth-wise,
  // the submitted value just doesn't match. We deliberately avoid
  // 401 here because the global AuthFetchGuard treats any 401 from
  // a same-origin API as "session expired" and bounces the driver
  // to the login page, which is the exact thing a wrong-PIN entry
  // shouldn't do.
  return NextResponse.json(
    {
      error: "Wrong PIN.",
      remainingAttempts,
    },
    { status: 422 },
  );
}
