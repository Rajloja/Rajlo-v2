import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";

/**
 * Admin CRUD for employer accounts.
 *
 *   GET    /api/admin/employers
 *          → list every employer + a driver-count breakdown per bucket
 *
 *   POST   /api/admin/employers
 *          body: { email, fullName }
 *          → creates a Supabase auth user + profile with role='employer'
 *          + a magic-link invite so the employer sets their password on
 *          their first sign-in. Same "no admin sees / handles the
 *          password" property the driver-onboarding flow gives to
 *          drivers.
 *
 *   PATCH  /api/admin/employers
 *          body: { id, active? }
 *          → toggle active. Inactive employers can't sign in (we ban
 *          their auth user for ~100y — same tombstone shape as
 *          user-delete).
 *
 * All routes go through requireAdmin() which validates the caller is
 * an admin AND checks the `manage_employers` permission (routed via
 * the RBAC layer).
 */

type PostBody = { email?: unknown; fullName?: unknown };
type PatchBody = { id?: unknown; active?: unknown };

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  // Fetch every profile with role='employer' + join their auth email.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "employer")
    .order("full_name", { ascending: true });

  const employerIds = (profiles ?? []).map((p) => p.id);
  if (employerIds.length === 0) {
    return NextResponse.json({ employers: [] });
  }

  // Aggregate per-employer driver counts. One query — group in memory
  // to avoid N+1.
  const { data: drivers } = await supabase
    .from("drivers")
    .select("onboarded_by_employer_id, onboarding_status")
    .in("onboarded_by_employer_id", employerIds);

  type Row = {
    onboarded_by_employer_id: string;
    onboarding_status: string;
  };
  const rows = (drivers ?? []) as Row[];
  const statsByEmployer = new Map<
    string,
    { total: number; pending: number; approved: number; rejected: number }
  >();
  for (const r of rows) {
    const bucket = statsByEmployer.get(r.onboarded_by_employer_id) ?? {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    bucket.total += 1;
    if (r.onboarding_status === "pending_review") bucket.pending += 1;
    if (r.onboarding_status === "approved") bucket.approved += 1;
    if (r.onboarding_status === "rejected") bucket.rejected += 1;
    statsByEmployer.set(r.onboarded_by_employer_id, bucket);
  }

  // Fetch auth details for each employer — email + banned state.
  const authLookups = await Promise.all(
    employerIds.map((id) => supabase.auth.admin.getUserById(id)),
  );
  const authById = new Map(
    authLookups.map((r, i) => [
      employerIds[i],
      r.data.user
        ? {
            email: r.data.user.email ?? null,
            banned:
              Boolean(r.data.user.banned_until) &&
              new Date(r.data.user.banned_until!).getTime() > Date.now(),
            lastSignInAt: r.data.user.last_sign_in_at ?? null,
          }
        : { email: null, banned: false, lastSignInAt: null },
    ]),
  );

  const employers = (profiles ?? []).map((p) => {
    const stats = statsByEmployer.get(p.id) ?? {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    const authInfo = authById.get(p.id) ?? {
      email: null,
      banned: false,
      lastSignInAt: null,
    };
    return {
      id: p.id,
      fullName: p.full_name,
      email: authInfo.email,
      active: !authInfo.banned,
      lastSignInAt: authInfo.lastSignInAt,
      stats,
    };
  });

  return NextResponse.json({ employers });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email." },
      { status: 400 },
    );
  }
  if (!fullName) {
    return NextResponse.json(
      { error: "Enter the employer's full name." },
      { status: 400 },
    );
  }

  // Random password — the employer will use "Forgot password" on the
  // login page to set their own. We deliberately avoid the "invite
  // link" flow here because Supabase's built-in invite email uses the
  // Supabase-branded template, and Rajlo has its own visual language
  // for auth mail. "Sign up, ask them to forgot-password" gives them
  // the same UX with our own Resend-branded template.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const tempPassword = Buffer.from(bytes).toString("base64url");

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, onboarded_as_employer: true },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Couldn't create employer account." },
      { status: 400 },
    );
  }

  const employerId = created.user.id;
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert(
      { id: employerId, role: "employer", full_name: fullName },
      { onConflict: "id" },
    );
  if (profileErr) {
    await supabase.auth.admin.deleteUser(employerId).catch(() => null);
    return NextResponse.json(
      { error: `Failed to save profile: ${profileErr.message}` },
      { status: 500 },
    );
  }

  // Fire the password-reset email — Supabase handles the delivery.
  // The employer clicks "Set password", lands on /auth/reset-password,
  // and picks their own credentials.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/employer/login`,
  }).catch(() => null);

  await logAdminAction(supabase, actor, {
    targetType: "employer",
    targetId: employerId,
    targetLabel: fullName,
    action: "update",
    summary: `${actor.label} provisioned new employer ${fullName} (${email})`,
  });

  return NextResponse.json({
    ok: true,
    employer: { id: employerId, fullName, email },
  });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = typeof body.id === "string" ? body.id : null;
  const active = typeof body.active === "boolean" ? body.active : null;
  if (!id || active === null) {
    return NextResponse.json(
      { error: "Missing id or active flag." },
      { status: 400 },
    );
  }

  // ~100-year ban to deactivate; unban to reactivate. Same primitive
  // we use for user deletion tombstones.
  const banDuration = active ? "none" : "876600h";
  const { error } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: banDuration as "none" | `${number}h`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(supabase, actor, {
    targetType: "employer",
    targetId: id,
    targetLabel: `Employer ${id}`,
    action: active ? "update" : "delete",
    summary: `${actor.label} ${active ? "reactivated" : "deactivated"} employer ${id}`,
  });

  return NextResponse.json({ ok: true });
}
