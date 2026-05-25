import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * POST /api/calls/[id]/decline
 *
 * Callee declines an incoming call. Flips status to `declined`. The
 * caller's client picks this up via the Realtime subscription on
 * `calls` and tears down its LiveKit connection.
 */
export async function POST(
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
    .select("id, callee_id, status")
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
      { error: "call_not_ringing" },
      { status: 409 },
    );
  }

  await supabase
    .from("calls")
    .update({
      status: "declined",
      ended_at: new Date().toISOString(),
      end_reason: "callee_declined",
    })
    .eq("id", call.id);

  return NextResponse.json({ ok: true });
}
