import { NextResponse } from "next/server";
import { logAdminAction, requireAdmin } from "@/lib/admin-auth";

/**
 * POST /api/admin/users/[id]/deactivate
 * POST /api/admin/users/[id]/deactivate?action=reactivate
 *
 * Body: { reason?: string }
 *
 * For drivers: also flips the driver row's `activated`/`deactivated_at`
 * AND bans the auth user — Supabase auth admin ban prevents new
 * sessions but keeps the row + history intact (vs. a delete which
 * would cascade-wipe ride history).
 *
 * For riders/admins: just bans the auth user. There's no platform
 * concept of an "active" rider — they can request rides whenever
 * signed in, and deactivation = sign-out + can't sign back in.
 *
 * `?action=reactivate` removes the ban + (for drivers) restores
 * `activated=true`. The driver still has to be in good standing
 * (no rejected onboarding) — if not, reactivation is rejected.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { actor, supabase } = gate;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "deactivate";
  const reactivate = action === "reactivate";

  if (id === actor.userId) {
    return NextResponse.json(
      { error: "You can't deactivate your own admin account." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    reason?: unknown;
  };
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Ban / unban the auth user. "100 years" effectively never; "none"
  // removes the ban.
  const { error: banError } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: reactivate ? "none" : "876000h",
  });
  if (banError) {
    return NextResponse.json({ error: banError.message }, { status: 500 });
  }

  // Account-level deactivation flag (all roles). The ban blocks new
  // sessions but a currently-logged-in user's token stays valid for up
  // to ~1h; this flag lets /api/me/status + the DeactivatedGate detect
  // it immediately and show the "Account deactivated" screen.
  await supabase
    .from("profiles")
    .update({ deactivated_at: reactivate ? null : new Date().toISOString() })
    .eq("id", id);

  // Driver-side bookkeeping
  if (profile.role === "driver") {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, external_id, activated, onboarding_status")
      .eq("user_id", id)
      .maybeSingle();
    if (driver) {
      if (reactivate) {
        if (driver.onboarding_status === "rejected") {
          return NextResponse.json(
            {
              error:
                "Driver was previously rejected — re-run verification before reactivating.",
            },
            { status: 400 },
          );
        }
        await supabase
          .from("drivers")
          .update({
            activated: true,
            deactivated_at: null,
            admin_note: reason ?? "Reactivated by admin",
          })
          .eq("id", driver.id);
      } else {
        await supabase
          .from("drivers")
          .update({
            activated: false,
            deactivated_at: new Date().toISOString(),
            admin_note: reason ?? "Deactivated by admin",
            is_online: false,
          })
          .eq("id", driver.id);
      }

      await supabase.from("driver_audit_logs").insert({
        driver_id: driver.id,
        actor_role: "admin",
        actor_id: actor.label,
        event: reactivate
          ? `Reactivated by ${actor.label}${reason ? ` — ${reason}` : ""}`
          : `Deactivated by ${actor.label}${reason ? ` — ${reason}` : ""}`,
      });
    }
  }

  await logAdminAction(supabase, actor, {
    targetType:
      profile.role === "driver"
        ? "driver"
        : profile.role === "admin"
          ? "admin"
          : "rider",
    targetId: id,
    targetLabel: profile.full_name ?? "Unnamed user",
    action: reactivate ? "reactivate" : "deactivate",
    summary: reactivate
      ? `${actor.label} reactivated ${profile.role} ${profile.full_name ?? id}`
      : `${actor.label} deactivated ${profile.role} ${profile.full_name ?? id}${
          reason ? ` — ${reason}` : ""
        }`,
    metadata: reason ? { reason } : undefined,
  });

  return NextResponse.json({ ok: true, reactivated: reactivate });
}
