import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/employer/drivers/[externalId]
 *
 * Detail view of a single driver THIS employer onboarded. Same
 * strict scoping as the list endpoint — 404 if the driver exists
 * but was onboarded by someone else. That way employers don't get
 * a "you can't see this" 403 signal that leaks whether an id exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const { externalId } = await params;

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

  const { data: driver } = await supabase
    .from("drivers")
    .select(
      "id, external_id, first_name, last_name, email, phone, plate_number, vehicle_make, vehicle_model, vehicle_year, onboarding_status, activated, submitted_at, admin_note, onboarded_by_employer_id",
    )
    .eq("external_id", externalId)
    .maybeSingle();

  if (!driver || driver.onboarded_by_employer_id !== user.id) {
    // 404 for both "no row" and "wrong owner" — don't leak existence.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Fetch doc status snapshot so the employer can see which docs the
  // admin has already approved/rejected — helps them tell the driver
  // "you just need to re-upload the badge" without back-and-forth.
  const { data: docs } = await supabase
    .from("driver_documents")
    .select("doc_key, label, status, note")
    .eq("driver_id", driver.id)
    .order("doc_key", { ascending: true });

  // Password setup token state — was the driver able to set their
  // password yet? Helps the employer chase them if they haven't.
  const { data: token } = await supabase
    .from("driver_password_setup_tokens")
    .select("consumed_at, superseded_at, created_at")
    .eq("driver_user_id", driver.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let passwordSetupStatus:
    | "pending"
    | "completed"
    | "superseded"
    | "no_token" = "no_token";
  if (token) {
    if (token.consumed_at) passwordSetupStatus = "completed";
    else if (token.superseded_at) passwordSetupStatus = "superseded";
    else passwordSetupStatus = "pending";
  }

  return NextResponse.json({
    driver: {
      externalId: driver.external_id,
      fullName: [driver.first_name, driver.last_name].filter(Boolean).join(" "),
      email: driver.email,
      phone: driver.phone,
      plateNumber: driver.plate_number,
      vehicle:
        driver.vehicle_make && driver.vehicle_model
          ? `${driver.vehicle_year ?? ""} ${driver.vehicle_make} ${driver.vehicle_model}`.trim()
          : null,
      onboardingStatus: driver.onboarding_status,
      activated: driver.activated,
      submittedAt: driver.submitted_at,
      adminNote: driver.admin_note,
      passwordSetupStatus,
    },
    docs: (docs ?? []).map((d) => ({
      docKey: d.doc_key,
      label: d.label,
      status: d.status,
      note: d.note,
    })),
  });
}
