import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/auth/set-password/verify?token=<uuid>
 *
 * Read-only check that a password-setup token is still usable — the
 * landing page hits this on mount to decide whether to render the
 * "set password" form or the "sorry, this link is dead" message.
 *
 * Returns { valid: bool, reason?: string, driverEmail?: string }.
 * Deliberately does NOT include any driver identity beyond the email
 * on the account (which the driver already knows — it's their own).
 * No RLS bypass leakage: the endpoint uses service_role internally but
 * returns only the minimal shape the client needs.
 *
 * Public — no auth. Callers include browsers loading the set-password
 * page for the first time, before any Rajlo session exists.
 */

const MAX_TOKEN_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ valid: false, reason: "Missing token." });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { valid: false, reason: "Service temporarily unavailable." },
      { status: 500 },
    );
  }

  const { data: row } = await supabase
    .from("driver_password_setup_tokens")
    .select("token, driver_user_id, created_at, consumed_at, superseded_at")
    .eq("token", token)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({
      valid: false,
      reason: "This link isn't recognised. Check your email for the correct one.",
    });
  }
  if (row.consumed_at) {
    return NextResponse.json({
      valid: false,
      reason:
        "This link has already been used. Sign in with the password you set, or ask Rajlo to send a new link.",
    });
  }
  if (row.superseded_at) {
    return NextResponse.json({
      valid: false,
      reason:
        "This link was replaced by a newer one. Check your inbox for the most recent Rajlo email.",
    });
  }
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > MAX_TOKEN_AGE_MS) {
    return NextResponse.json({
      valid: false,
      reason: "This link is over a year old and has expired. Ask Rajlo for a fresh one.",
    });
  }

  // Fetch the user's email + role so the landing page can render
  // "for user@example.com" and tailor its copy (drivers get a
  // "documents under review" footnote; employers don't need that).
  const [{ data: authData }, { data: profile }] = await Promise.all([
    supabase.auth.admin.getUserById(row.driver_user_id),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", row.driver_user_id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    valid: true,
    driverEmail: authData.user?.email ?? null,
    role: profile?.role ?? null,
  });
}
