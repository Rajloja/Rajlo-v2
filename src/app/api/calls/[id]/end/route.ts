import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { pushToUser } from "@/lib/push";

/**
 * POST /api/calls/[id]/end
 *
 * Either party hangs up. Computes duration_seconds (if the call had
 * been accepted) and flips status to `ended`. The other party's
 * client sees this via Realtime and disconnects from LiveKit.
 *
 * Edge case: if a call is ended while still in `ringing`, we mark
 * status=`missed` instead — useful for support to distinguish
 * "rider hung up before driver picked up" (missed) from "they
 * actually talked and then hung up" (ended).
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
    .select("id, caller_id, callee_id, status, accepted_at, started_at")
    .eq("id", id)
    .maybeSingle();
  if (!call) {
    return NextResponse.json({ error: "call_not_found" }, { status: 404 });
  }
  if (call.caller_id !== user.id && call.callee_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (["ended", "missed", "declined"].includes(call.status)) {
    // Already terminal — idempotent.
    return NextResponse.json({ ok: true, already: true });
  }

  const now = new Date();
  const wasAccepted = call.status === "accepted" && call.accepted_at;
  const durationSeconds = wasAccepted
    ? Math.max(
        0,
        Math.round(
          (now.getTime() - new Date(call.accepted_at as string).getTime()) /
            1000,
        ),
      )
    : null;
  const nextStatus = wasAccepted ? "ended" : "missed";
  const endReason =
    call.caller_id === user.id ? "caller_hangup" : "callee_hangup";

  await supabase
    .from("calls")
    .update({
      status: nextStatus,
      ended_at: now.toISOString(),
      duration_seconds: durationSeconds,
      end_reason: endReason,
    })
    .eq("id", call.id);

  // If the CALLER hung up while the callee hadn't accepted yet, send
  // a data-only `call_cancelled` push to the callee. The native
  // Android RajloMessagingService picks this up and dismisses the
  // lockscreen IncomingCallActivity immediately — without this the
  // callee's phone keeps ringing until the in-app Realtime UPDATE
  // gets delivered, which can be 10+ seconds when the WebView is
  // asleep. Fire-and-forget so a flaky FCM doesn't block /end.
  if (
    !wasAccepted &&
    call.caller_id === user.id &&
    typeof call.callee_id === "string"
  ) {
    void pushToUser(supabase, call.callee_id, {
      // title / body aren't displayed (data-only) but the FCM SDK
      // still wants them present.
      title: "Call cancelled",
      body: "The caller hung up.",
      tag: `call-${call.id}`,
      androidDataOnly: true,
      data: {
        type: "call_cancelled",
        callId: call.id,
      },
    }).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    durationSeconds,
  });
}
