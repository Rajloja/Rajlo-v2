import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { notifyDriver } from "@/lib/notify";

/**
 * POST /api/driver/violations/report
 *
 * The driver's client (or a server-side watcher) reports a location-
 * policy violation. Inserts a row in `driver_violations`. If the
 * driver now has ≥ 2 unresolved violations, also flips them
 * `deactivated_at = now()` with reason `location_violations` so they
 * can't go online again until an admin reviews + reactivates.
 *
 * Body: { kind, rideId?, details? }
 *   kind: 'location_off_mid_trip' | 'location_off_while_online'
 *         | 'permission_denied_at_toggle'
 *
 * Idempotent on (driver, ride, kind) within a 5-minute window — a
 * driver whose phone flickers location off/on every second shouldn't
 * rack up 50 violations in a minute.
 */

type Body = {
  kind?: unknown;
  rideId?: unknown;
  details?: unknown;
};

const ALLOWED_KINDS = new Set([
  "location_off_mid_trip",
  "location_off_while_online",
  "permission_denied_at_toggle",
  // The driver's device lost its internet connection during an active
  // trip — live location stopped reaching the rider. Recorded for the
  // safety team, but does NOT feed the 2-strike auto-deactivation: a
  // dropped signal (dead zone, tunnel) is often not the driver's
  // fault, so an admin reviews these rather than the system auto-
  // penalising. See the branch in POST below.
  "offline_mid_trip",
]);

const DEDUP_WINDOW_MIN = 5;

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const rideId = typeof body.rideId === "string" ? body.rideId : null;
  const details = typeof body.details === "string" ? body.details : null;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, user_id, deactivated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ error: "not_driver" }, { status: 403 });
  }

  // Dedup: same driver + same kind in last 5 minutes → don't write
  // again. Protects against flapping GPS firing the report endpoint
  // dozens of times per minute.
  const cutoff = new Date(
    Date.now() - DEDUP_WINDOW_MIN * 60 * 1000,
  ).toISOString();
  const { count: recent } = await supabase
    .from("driver_violations")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driver.id)
    .eq("kind", kind)
    .gte("created_at", cutoff);
  if (recent && recent > 0) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await supabase.from("driver_violations").insert({
    driver_id: driver.id,
    ride_id: rideId,
    kind,
    details,
  });

  // Connection-loss violations are recorded for the safety team but
  // are NOT run through the 2-strike auto-deactivation: a dropped
  // mobile signal often isn't the driver's fault, so an admin reviews
  // these instead of the system locking the driver out automatically.
  if (kind === "offline_mid_trip") {
    void notifyDriver(supabase, {
      driverUserId: driver.user_id as string,
      kind: "system",
      title: "Stay connected during trips",
      body: "Your phone lost its internet connection during a recent trip — your rider couldn't see your live location. Keep a stable connection while driving.",
      href: "/driver",
      pushTag: `violation-offline-${driver.id}`,
    }).catch(() => null);
    return NextResponse.json({ ok: true, recorded: true });
  }

  // Count unresolved violations across the driver's history.
  const { count: unresolvedCount } = await supabase
    .from("driver_violations")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driver.id)
    .is("resolved_at", null);

  let deactivated = false;
  if (
    (unresolvedCount ?? 0) >= 2 &&
    !driver.deactivated_at
  ) {
    // Two-strike auto-deactivation. Drops them offline immediately
    // and blocks future online toggles. The pending page shows a
    // "contact support" message because of `deactivation_reason`.
    await supabase
      .from("drivers")
      .update({
        deactivated_at: new Date().toISOString(),
        deactivation_reason: "location_violations",
        is_online: false,
      })
      .eq("id", driver.id);
    deactivated = true;

    // Notify the driver so they understand what just happened
    // instead of silently being locked out at next sign-in.
    void notifyDriver(supabase, {
      driverUserId: driver.user_id as string,
      kind: "system",
      title: "Account deactivated — location policy",
      body: "Your account was deactivated after multiple location-off events during trips. Contact ops@rajlo.com to review and reinstate.",
      href: "/driver",
      pushTag: `violation-deactivation-${driver.id}`,
      pushRenotify: true,
    }).catch(() => null);
  } else {
    // First strike — warn, don't deactivate.
    void notifyDriver(supabase, {
      driverUserId: driver.user_id as string,
      kind: "system",
      title: "Turn your location back on",
      body: "Rajlo needs location access while you're on a trip. Re-enable it now — another offence will pause your account.",
      href: "/driver",
      pushTag: `violation-warn-${driver.id}`,
      pushRenotify: true,
      requireInteraction: true,
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    unresolvedCount: unresolvedCount ?? 0,
    deactivated,
  });
}
