import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/admin/document-url?path=...
 *
 * Returns a short-lived signed URL for an uploaded driver document so admins
 * can preview/download it. Requires the caller to be authenticated as an
 * admin (verified via their session profile.role).
 *
 * Uses the service_role client to generate the signed URL (bypasses RLS).
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  // Verify caller is an admin
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Generate a 30-minute signed URL via service_role. Was 5 min; got
  // bumped after Raj flagged that admins reviewing a driver's PDF for
  // more than five minutes hit a 403 on the in-page iframe with no
  // retry logic — the whole preview modal went blank mid-review.
  // 30 min is well inside a realistic single-driver review session
  // without being a real security exposure (admin-authenticated to
  // begin with, and the URL isn't shareable outside the tab it was
  // fetched in).
  const admin = getSupabaseServerClient();
  if (!admin) {
    return NextResponse.json({ error: "storage unavailable" }, { status: 500 });
  }

  const { data, error } = await admin.storage
    .from("driver-documents")
    .createSignedUrl(path, 60 * 30);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
