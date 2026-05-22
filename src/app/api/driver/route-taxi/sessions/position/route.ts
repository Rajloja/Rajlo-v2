import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { haversineKm, isWithinJamaica } from "@/lib/jamaica";
import { prebroadcastNextLeg } from "@/lib/route-journey-progress";

/** Distance (km) from the current leg's dropoff at which we kick the
 *  next-leg broadcast. ~3 km ≈ 4–5 minutes at typical route-taxi
 *  speed; matches the rider-facing "we'll let your next driver know
 *  about 5 minutes ahead" promise. */
const TRANSFER_PREBROADCAST_KM = 3;

/**
 * POST /api/driver/route-taxi/sessions/position
 *
 * Driver pushes their current GPS to their active session. Drives:
 *   - Proximity-sorted hails (closest pickup first) on the driver's monitor
 *   - "X km away" labels on the rider's live status banner
 *   - Future: route-direction filtering, ETA estimates
 *
 * Body: { lat: number, lng: number }
 *
 * The browser fires this every ~15s while a session is on screen
 * (cheap — single UPDATE on the driver_sessions row). We reject coords
 * outside Jamaica's bounding box as a sanity gate against stuck-on-zero
 * fixes or test devices in the wrong country.
 */
type PositionBody = { lat?: unknown; lng?: unknown };

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PositionBody;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isWithinJamaica({ lat, lng })) {
    return NextResponse.json(
      {
        error: "out_of_bounds",
        message: "GPS coordinates are outside Jamaica.",
      },
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

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json(
      { error: "Driver record not found" },
      { status: 404 },
    );
  }

  // Update only the active session — silently no-op if nothing's open
  // (a stale beacon from a stale tab shouldn't error the page).
  const { data: sessions, error } = await supabase
    .from("driver_sessions")
    .update({
      current_lat: lat,
      current_lng: lng,
      last_position_at: new Date().toISOString(),
    })
    .eq("driver_id", driver.id)
    .eq("status", "active")
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Predictive transfer broadcast — if this driver is carrying a
  // rider on a multi-leg journey AND is now within
  // TRANSFER_PREBROADCAST_KM of their dropoff, kick the next leg's
  // hail + broadcast a few minutes early. The helper is idempotent
  // against `transfer_broadcast_at` so a chatty GPS only fires it
  // once per leg.
  //
  // Best-effort: any error in this branch is swallowed so the GPS
  // beacon stays cheap. The fallback is the existing "broadcast at
  // leg completion" path in /api/driver/route-taxi/hails/[id].
  const sessionId = (sessions ?? [])[0]?.id as string | undefined;
  if (sessionId) {
    void (async () => {
      try {
        const { data: hailRow } = await supabase
          .from("route_hails")
          .select(
            "id, rider_id, route_id, session_id, journey_id, leg_order, is_transfer_leg, status, fare_jmd, pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng, transfer_broadcast_at",
          )
          .eq("session_id", sessionId)
          .eq("status", "picked_up")
          .not("journey_id", "is", null)
          .is("transfer_broadcast_at", null)
          .maybeSingle();
        if (!hailRow) return;
        type HailWithJourney = {
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
          transfer_broadcast_at: string | null;
        };
        const hail = hailRow as HailWithJourney;
        // Skip the final leg — no next-leg to broadcast.
        const { data: journeyRow } = await supabase
          .from("route_journeys")
          .select("planned_leg_count")
          .eq("id", hail.journey_id as string)
          .maybeSingle();
        const plannedLegCount =
          (journeyRow as { planned_leg_count: number } | null)
            ?.planned_leg_count ?? 0;
        if (!hail.leg_order || hail.leg_order >= plannedLegCount) return;

        const km = haversineKm(
          { lat, lng },
          { lat: hail.dropoff_lat, lng: hail.dropoff_lng },
        );
        if (km > TRANSFER_PREBROADCAST_KM) return;

        // Look up the rider's first name for the heads-up body.
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", hail.rider_id)
          .maybeSingle();
        await prebroadcastNextLeg(supabase, {
          hail,
          riderFirstName:
            (profile as { full_name: string | null } | null)?.full_name ??
            null,
        });
      } catch {
        /* swallowed — see comment above */
      }
    })();
  }

  return NextResponse.json({ ok: true });
}
