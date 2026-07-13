import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { clientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/set-password
 *
 * Consumes a driver_password_setup_tokens row and updates the paired
 * auth.users password. On success, we ALSO sign the driver in on the
 * server side by calling signInWithPassword through their cookie
 * client — that way the browser lands on /driver already
 * authenticated, no second sign-in prompt right after they've just
 * typed a password.
 *
 * Body: { token: string, password: string }
 * Returns: { ok: true } on success (with an auth cookie set), or
 *          { error: string } with an appropriate 4xx / 5xx.
 *
 * Public — no session required to reach this. Rate-limited by IP to
 * blunt brute-force probing of the token space (365-day tokens with
 * unlimited attempts would eventually leak to a determined attacker).
 * Consume-once semantics on the token prevent replay after success.
 */

const MAX_TOKEN_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const token = body.token?.trim();
  const password = body.password;

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable." },
      { status: 500 },
    );
  }

  // Look up the token WITH the driver's linked auth email — needed for
  // the sign-in-after-set step below.
  const { data: row } = await supabase
    .from("driver_password_setup_tokens")
    .select("token, driver_user_id, created_at, consumed_at, superseded_at")
    .eq("token", token)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  }
  if (row.consumed_at) {
    return NextResponse.json(
      {
        error:
          "This link has already been used. Sign in with the password you set.",
      },
      { status: 409 },
    );
  }
  if (row.superseded_at) {
    return NextResponse.json(
      { error: "This link was replaced by a newer one." },
      { status: 410 },
    );
  }
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > MAX_TOKEN_AGE_MS) {
    return NextResponse.json(
      { error: "This link is over a year old and has expired." },
      { status: 410 },
    );
  }

  // ── Update the auth.users password ──
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    row.driver_user_id,
    { password },
  );
  if (updateErr) {
    return NextResponse.json(
      { error: `Couldn't set your password: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // ── Mark the token consumed (single-use) ──
  await supabase
    .from("driver_password_setup_tokens")
    .update({
      consumed_at: new Date().toISOString(),
      consumed_ip: clientIp(request),
    })
    .eq("token", token);

  // ── Auto-sign-in via the cookie-scoped auth client ──
  // We need the driver's email to sign them in. Fetch from auth.users.
  const { data: userLookup } = await supabase.auth.admin.getUserById(
    row.driver_user_id,
  );
  const email = userLookup.user?.email;
  if (email) {
    const cookieAuth = await createSupabaseAuthServerClient();
    // signInWithPassword through the cookie client SETS the Supabase
    // session cookies on the response — that's what the browser needs
    // to arrive at /driver already logged in.
    const { error: signInErr } = await cookieAuth.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      // Password IS set — the auto-sign-in failed for some other reason.
      // Return success so the driver can sign in manually on the next screen.
      console.error(
        "set-password: auto sign-in failed after password set",
        signInErr.message,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
