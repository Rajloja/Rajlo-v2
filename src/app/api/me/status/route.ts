import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/me/status
 *
 * Tiny, cheap endpoint the client's DeactivatedGate polls to detect
 * mid-session account deactivation. Returns `{ active }` — false when
 * the signed-in user's `profiles.deactivated_at` is set (i.e. an admin
 * deactivated them while they were logged in). The gate then shows the
 * "Account deactivated — contact support" screen instead of letting the
 * session limp on until the banned token finally fails.
 *
 * 401 when there's no session (the normal auth guards handle that).
 */
export async function GET() {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ active: false, signedIn: false }, { status: 401 });
  }

  const { data: profile } = await auth
    .from("profiles")
    .select("deactivated_at, role")
    .eq("id", user.id)
    .maybeSingle();

  const deactivated = !!profile?.deactivated_at;

  return NextResponse.json({
    signedIn: true,
    active: !deactivated,
    role: profile?.role ?? "rider",
  });
}
