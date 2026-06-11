import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * POST /api/driver/heartbeat
 *
 * Called periodically by the driver portal's `<DriverActivityTracker>`
 * while the driver is interacting with the app. Two responsibilities:
 *
 *   1. **Update the calling driver's `last_active_at`** so the
 *      auto-offline sweep (below) doesn't flip them off.
 *
 *   2. **Run the auto-offline sweep**: any driver who's `is_online`
 *      but hasn't sent a heartbeat in over an hour gets flipped
 *      offline. We do this lazily here (every heartbeat does the
 *      sweep) instead of via a scheduled cron because:
 *        - There's always at least one online driver pinging while
 *          the platform has any activity at all
 *        - One indexed UPDATE every few minutes is cheaper than a
 *          standalone cron worker
 *        - Self-healing: if heartbeats stop entirely, the next
 *          rider-side `select online drivers` will simply return
 *          none — exactly what we want.
 *
 * Body (optional):
 *   { setOffline?: boolean }
 *   When `setOffline: true`, the caller's `is_online` is also flipped
 *   to false in addition to the heartbeat update. Used by the client
 *   when it detects local idle (no user interaction for an hour) so
 *   the driver doesn't have to wait for the server-side sweep to
 *   notice — they're flipped offline immediately.
 *
 * Always returns 200 — the heartbeat is best-effort and never gates
 * the driver portal on the network call.
 */

// 1 hour of inactivity flips an online driver back offline. Adjust
// here if the platform ever wants a tighter or looser window.
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

type Body = { setOffline?: unknown };

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "no_service_role" });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const wantsOffline = body.setOffline === true;

  // Look up whether the caller has an active trip. If they do we
  // SKIP the auto-offline path entirely — a driver mid-trip is by
  // definition not idle, even if they haven't tapped the screen in
  // an hour (they're driving). This catches the real-world bug
  // where a driver on a long route gets force-flipped offline
  // during the trip because they were focused on the road.
  const { data: callerDriver } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  const callerDriverId = (callerDriver as { id?: string } | null)?.id ?? null;
  let callerHasActiveTrip = false;
  if (callerDriverId) {
    const { count } = await supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", callerDriverId)
      .in("status", ["accepted", "arrived", "in_progress"]);
    callerHasActiveTrip = (count ?? 0) > 0;
  }

  // Self heartbeat — refreshes last_active_at always. The
  // setOffline flag from the client (1hr idle) is HONOURED only
  // when there's no active trip in flight; otherwise we keep the
  // driver online so the rider's car keeps moving.
  const updates: Record<string, unknown> = {
    last_active_at: new Date().toISOString(),
  };
  if (wantsOffline && !callerHasActiveTrip) updates.is_online = false;

  await supabase
    .from("drivers")
    .update(updates)
    .eq("user_id", user.id);

  // Lazy expire — flip stale online drivers offline. Same active-trip
  // exemption: never sweep a driver who's currently on a ride.
  // Indexed by `idx_drivers_online_last_active` so this is a partial-
  // index scan over only currently-online drivers, not the whole table.
  const staleThreshold = new Date(
    Date.now() - STALE_THRESHOLD_MS,
  ).toISOString();
  // First find the drivers.id of every driver currently on an active
  // ride so we can exclude them. Cheaper than a NOT IN sub-select via
  // the supabase-js builder.
  const { data: activeRideRows } = await supabase
    .from("rides")
    .select("driver_id")
    .in("status", ["accepted", "arrived", "in_progress"]);
  const activeDriverIds = Array.from(
    new Set(
      ((activeRideRows ?? []) as Array<{ driver_id: string | null }>)
        .map((r) => r.driver_id)
        .filter((v): v is string => !!v),
    ),
  );
  let sweep = supabase
    .from("drivers")
    .update({ is_online: false })
    .eq("is_online", true)
    .lt("last_active_at", staleThreshold);
  if (activeDriverIds.length > 0) {
    // `.not("id", "in", "(...)")` — supabase-js wants a parenthesized
    // CSV list for IN/NOT IN filters.
    sweep = sweep.not("id", "in", `(${activeDriverIds.join(",")})`);
  }
  await sweep;

  return NextResponse.json({
    ok: true,
    activeTrip: callerHasActiveTrip,
  });
}
