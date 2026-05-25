import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/calls/[id]
 *
 * Returns the call row + the caller's display name. Used by the
 * incoming-call provider on page load when the user lands via a
 * push-notification link like `/driver/route-taxi?call={id}` — by
 * that point the row has already been INSERTed so the Realtime
 * subscription doesn't fire. The provider fetches the row directly,
 * confirms the viewer is the callee, and pops the full-screen
 * ringer.
 *
 * Authorization: only the caller or callee on the row can read it.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const { data: call } = await supabase
    .from("calls")
    .select(
      "id, caller_id, callee_id, caller_role, room_name, status, started_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!call) {
    return NextResponse.json({ error: "call_not_found" }, { status: 404 });
  }
  if (call.caller_id !== user.id && call.callee_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Resolve the caller's display name — drivers and riders share
  // the same auth.users table, so we try drivers first (it's the
  // smaller table) then profiles.
  let callerName = "Caller";
  const { data: driver } = await supabase
    .from("drivers")
    .select("first_name, last_name")
    .eq("user_id", call.caller_id)
    .maybeSingle();
  if (driver) {
    const n = [driver.first_name, driver.last_name].filter(Boolean).join(" ");
    if (n) callerName = n;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", call.caller_id)
      .maybeSingle();
    if (profile?.full_name) callerName = profile.full_name as string;
  }

  return NextResponse.json({
    call: {
      id: call.id,
      status: call.status,
      callerId: call.caller_id,
      calleeId: call.callee_id,
      callerRole: call.caller_role,
      callerName,
      roomName: call.room_name,
      startedAt: call.started_at,
      viewerIsCallee: call.callee_id === user.id,
    },
  });
}
