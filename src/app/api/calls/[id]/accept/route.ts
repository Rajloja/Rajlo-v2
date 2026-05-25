import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  isLiveKitConfigured,
  livekitWsUrl,
  mintCallToken,
} from "@/lib/livekit";

/**
 * POST /api/calls/[id]/accept
 *
 * Callee accepts an incoming call. Validates:
 *   1. Caller is the actual callee on the row.
 *   2. Call is still in `ringing` (not already accepted, ended, etc.)
 *
 * Returns a LiveKit token so the callee's client can join the room.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      { error: "voice_calls_unavailable" },
      { status: 503 },
    );
  }

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
    .select("id, caller_id, callee_id, room_name, status")
    .eq("id", id)
    .maybeSingle();
  if (!call) {
    return NextResponse.json({ error: "call_not_found" }, { status: 404 });
  }
  if (call.callee_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!["initiated", "ringing"].includes(call.status)) {
    return NextResponse.json(
      {
        error: "call_not_ringing",
        message: `Call is ${call.status}, can't accept.`,
      },
      { status: 409 },
    );
  }

  // Resolve a friendly display name for the callee so the caller's
  // in-call UI can label them.
  const displayName = await resolveDisplayName(supabase, user.id);

  const token = await mintCallToken({
    roomName: call.room_name,
    identity: user.id,
    displayName,
  });

  await supabase
    .from("calls")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", call.id);

  return NextResponse.json({
    call: { id: call.id, roomName: call.room_name, status: "accepted" },
    token,
    livekitUrl: livekitWsUrl(),
  });
}

async function resolveDisplayName(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
): Promise<string> {
  // Try driver first (they're a less-common identity), then profile.
  const { data: driver } = await supabase
    .from("drivers")
    .select("first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (driver) {
    const n = [driver.first_name, driver.last_name].filter(Boolean).join(" ");
    if (n) return n;
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (profile?.full_name as string | null) ?? "User";
}
