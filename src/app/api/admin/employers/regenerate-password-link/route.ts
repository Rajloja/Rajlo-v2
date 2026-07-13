import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { sendDriverPasswordSetupEmail } from "@/lib/email-templates";
import { APP_URL } from "@/lib/email-render";

/**
 * POST /api/admin/employers/regenerate-password-link
 *
 * Issues a fresh password-setup link for an employer-onboarded driver
 * whose original link is lost / expired / consumed and never used.
 * The DB helper `supersede_driver_password_token(uuid)` marks every
 * currently-active token for this driver as superseded, then we
 * INSERT a new token and email the driver.
 *
 * Body: { driverExternalId?: string }  OR  { driverUserId?: string }
 *   Pass whichever id is convenient — the admin verification-detail
 *   page has the external id; direct admin tooling can pass the auth
 *   user id. Exactly one is required.
 *
 * Admin-only. Writes an admin_audit_logs entry.
 */

type Body = {
  driverExternalId?: unknown;
  driverUserId?: unknown;
};

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;

  const body = (await request.json().catch(() => ({}))) as Body;
  const externalId =
    typeof body.driverExternalId === "string" ? body.driverExternalId : null;
  const userId =
    typeof body.driverUserId === "string" ? body.driverUserId : null;

  if (!externalId && !userId) {
    return NextResponse.json(
      { error: "Provide driverExternalId or driverUserId." },
      { status: 400 },
    );
  }

  // Resolve the driver row + its owning auth.users id.
  let driverQuery = supabase
    .from("drivers")
    .select(
      "id, external_id, user_id, first_name, last_name, email, onboarded_by_employer_id",
    );
  driverQuery = externalId
    ? driverQuery.eq("external_id", externalId)
    : driverQuery.eq("user_id", userId!);
  const { data: driver } = await driverQuery.maybeSingle();

  if (!driver || !driver.user_id) {
    return NextResponse.json(
      { error: "Driver not found." },
      { status: 404 },
    );
  }
  if (!driver.email) {
    return NextResponse.json(
      {
        error:
          "Driver has no email on file — can't send a password-setup link.",
      },
      { status: 400 },
    );
  }

  // Mark every active token for this driver as superseded.
  const { error: supersedeErr } = await supabase.rpc(
    "supersede_driver_password_token",
    { p_driver_user_id: driver.user_id },
  );
  if (supersedeErr) {
    return NextResponse.json(
      { error: `Couldn't supersede old tokens: ${supersedeErr.message}` },
      { status: 500 },
    );
  }

  // Issue a fresh token.
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("driver_password_setup_tokens")
    .insert({
      driver_user_id: driver.user_id,
      // Not issued by an employer — track this as an admin action by
      // setting the employer id to null.
      issued_by_employer_id: null,
    })
    .select("token")
    .single();
  if (tokenErr || !tokenRow) {
    return NextResponse.json(
      { error: tokenErr?.message ?? "Couldn't issue new token." },
      { status: 500 },
    );
  }

  // Look up the original employer's name for the email (if any).
  let employerName: string | null = null;
  if (driver.onboarded_by_employer_id) {
    const { data: employer } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", driver.onboarded_by_employer_id)
      .maybeSingle();
    employerName = employer?.full_name ?? null;
  }

  const setupUrl = `${APP_URL}/auth/set-password?token=${encodeURIComponent(tokenRow.token as string)}`;
  const composedName =
    [driver.first_name, driver.last_name].filter(Boolean).join(" ") || null;

  await sendDriverPasswordSetupEmail(driver.email, {
    fullName: composedName,
    setupUrl,
    onboardedByEmployerName: employerName,
  }).catch((err) => {
    console.error(`regenerate-password-link email failed: ${err}`);
  });

  await logAdminAction(supabase, actor, {
    targetType: "driver",
    targetId: driver.id,
    targetLabel: composedName ?? driver.external_id,
    action: "update",
    summary: `${actor.label} regenerated password setup link for driver ${driver.external_id}`,
  });

  return NextResponse.json({ ok: true });
}
