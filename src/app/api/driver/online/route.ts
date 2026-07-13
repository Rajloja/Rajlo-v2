import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getOutstandingLegalDocuments } from "@/lib/legal-consent";
import {
  checkDriverOperationEligibility,
  eligibilityErrorPayload,
} from "@/lib/driver-eligibility";

/**
 * GET / PATCH /api/driver/online
 *
 * GET    → returns { online: boolean, wentOnlineAt: string | null }
 * PATCH  → body { online: boolean }, persists the flip + stamps the
 *          went_online_at timestamp when transitioning offline → online.
 *
 * Only activated, non-deactivated drivers are allowed to flip the
 * flag. A pending / rejected driver has no business broadcasting GPS,
 * so we 403 them rather than silently no-op.
 */

export async function GET() {
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
    .select("is_online, went_online_at, activated, deactivated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!driver) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    online: !!driver.is_online,
    wentOnlineAt: driver.went_online_at ?? null,
  });
}

type PatchBody = { online?: unknown };

export async function PATCH(request: Request) {
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

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (typeof body.online !== "boolean") {
    return NextResponse.json(
      { error: "online must be a boolean" },
      { status: 400 },
    );
  }
  const desired = body.online;

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, is_online, activated, deactivated_at")
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

  // Active-trip gate: a driver with an in-flight ride must NOT be
  // able to flip themselves offline. The rider would see the marker
  // freeze, the ETA would die, and ops would have to scramble. If
  // the driver genuinely needs to bail mid-trip they should cancel
  // the ride explicitly via the active-trip screen — that flow has
  // proper notification + refund logic.
  if (!desired) {
    const { count: activeCount } = await supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id)
      .in("status", ["accepted", "arrived", "in_progress"]);
    if (activeCount && activeCount > 0) {
      return NextResponse.json(
        {
          error: "active_trip",
          message:
            "You can't go offline while a trip is in progress. Finish or cancel the current ride first.",
        },
        { status: 409 },
      );
    }
  }

  // Document-expiry gate: the daily cron sweeps expired docs to the
  // 'expired' status + auto-suspends, but there's a window (up to
  // ~24 h) between a doc's midnight expiry and the next cron pass
  // where the driver row is still activated=true. Real-time check
  // here closes that window — if any required doc has expires_on
  // before today, we auto-suspend the driver inline (mirroring the
  // cron's behaviour) and reject the online-toggle with a structured
  // error the client can route to /driver/renew from.
  //
  // Skipped for `desired=false` (going offline is safety-neutral —
  // no reason to block a driver from stopping just because a doc
  // lapsed while they were signed in).
  if (desired) {
    const eligibility = await checkDriverOperationEligibility(supabase, {
      driverId: driver.id,
    });
    if (!eligibility.eligible) {
      return NextResponse.json(eligibilityErrorPayload(eligibility), {
        status: 403,
      });
    }
  }

  // Legal-consent gate: a driver may not go online until they have
  // accepted every required policy at its current version. The consent
  // modal (LegalConsentGate) enforces this in the UI, but the server
  // is the source of truth — this 403 stops a tampered client.
  if (desired) {
    const outstanding = await getOutstandingLegalDocuments(
      auth,
      user.id,
      "driver",
    );
    if (outstanding.length > 0) {
      return NextResponse.json(
        {
          error: "legal_consent_required",
          message:
            "Review and accept RAJLO's updated policies before going online.",
          outstanding: outstanding.map((d) => ({
            key: d.key,
            title: d.title,
          })),
        },
        { status: 403 },
      );
    }
  }

  // Push-subscription gate: a driver going online MUST have at least
  // one active web-push subscription on file. Without it they'd never
  // get the wake-up notification when a rider hails — they'd have to
  // sit on the page staring at it, which defeats the point of being
  // "online but not eyes-on-screen".
  //
  // The UI also enforces this client-side (DriverReadinessGate), but
  // the server is the source of truth — a tampered or stale client
  // can't sneak past.
  if (desired) {
    const { count: pushCount } = await supabase
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!pushCount || pushCount === 0) {
      return NextResponse.json(
        {
          error: "push_required",
          message:
            "Enable push notifications before going online — riders' hails won't reach you otherwise.",
        },
        { status: 412 },
      );
    }
  }

  // Stamp went_online_at only on the offline → online transition. We
  // don't bump it on every PATCH so the "online for X minutes" timer
  // stays anchored to the actual session start.
  const update: Record<string, unknown> = { is_online: desired };
  if (desired && !driver.is_online) {
    update.went_online_at = new Date().toISOString();
  }
  if (!desired) {
    // Going offline — clear the timestamp so we don't show a stale
    // "online since…" if the driver never returns this session.
    update.went_online_at = null;
  }

  const { error } = await supabase
    .from("drivers")
    .update(update)
    .eq("id", driver.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    online: desired,
    wentOnlineAt:
      typeof update.went_online_at === "string"
        ? update.went_online_at
        : null,
  });
}
