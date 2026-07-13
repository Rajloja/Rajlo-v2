import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/employer/drivers?filter=all|pending|approved|rejected
 *
 * Returns the calling employer's onboarded drivers. Same strict
 * scoping as /api/employer/stats — only rows where
 * `onboarded_by_employer_id = <caller>` are returned. Newest submitted
 * first so the employer's most recent onboarding is at the top of the
 * dashboard list.
 *
 * (The POST handler on this same route — driver creation — lives in
 * ./submit/route.ts to keep this file readable. The dashboard doesn't
 * need it.)
 */

const FILTER_TO_STATUS: Record<string, string[]> = {
  all: ["pending_review", "approved", "rejected", "deactivated"],
  pending: ["pending_review"],
  approved: ["approved"],
  rejected: ["rejected"],
};

export async function GET(request: NextRequest) {
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

  const filterParam = request.nextUrl.searchParams.get("filter") ?? "all";
  const statuses = FILTER_TO_STATUS[filterParam] ?? FILTER_TO_STATUS.all;

  const { data: drivers } = await supabase
    .from("drivers")
    .select(
      "id, external_id, first_name, last_name, email, onboarding_status, activated, submitted_at, admin_note",
    )
    .eq("onboarded_by_employer_id", user.id)
    .in("onboarding_status", statuses)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);

  type Row = {
    id: string;
    external_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    onboarding_status: string;
    activated: boolean;
    submitted_at: string | null;
    admin_note: string | null;
  };

  const rows = (drivers ?? []) as Row[];

  return NextResponse.json({
    drivers: rows.map((r) => ({
      driverId: r.id,
      externalId: r.external_id,
      fullName: [r.first_name, r.last_name].filter(Boolean).join(" "),
      email: r.email ?? "",
      onboardingStatus: r.onboarding_status,
      activated: r.activated,
      submittedAt: r.submitted_at,
      adminNote: r.admin_note,
    })),
  });
}
