import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/employer/stats
 *
 * Aggregate onboarding stats for the calling employer — the four
 * numbers shown on their dashboard tiles. Filters strictly on
 * `onboarded_by_employer_id = <caller>` so an employer can never see
 * another employer's numbers.
 *
 * Auth: employer role only. Riders / drivers / admins get 403 (admins
 * have their own aggregate at /api/admin/employers/[id]).
 */
export async function GET() {
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
  if (profile?.role !== "employer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // One query, four counts — cheap enough that we don't cache. Group
  // by onboarding_status so the client can map each bucket to a tile.
  const { data: rows } = await supabase
    .from("drivers")
    .select("onboarding_status")
    .eq("onboarded_by_employer_id", user.id);

  const list = (rows ?? []) as Array<{ onboarding_status: string }>;
  const stats = {
    total: list.length,
    // "Pending" covers pending_review specifically — drafts are the
    // employer-side "haven't finished the wizard" state which we don't
    // actually persist as driver rows (drafts live in localStorage on
    // the wizard). So only pending_review flows in here.
    pending: list.filter((r) => r.onboarding_status === "pending_review")
      .length,
    approved: list.filter((r) => r.onboarding_status === "approved").length,
    rejected: list.filter((r) => r.onboarding_status === "rejected").length,
  };

  return NextResponse.json({ stats });
}
