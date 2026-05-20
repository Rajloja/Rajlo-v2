import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";

/**
 * GET /api/admin/moderation
 *
 * Moderation dashboard data — gated by `view_incidents` (every
 * moderation tier holds it):
 *   - recentActions: the latest enforcement actions taken
 *   - activeHolds:   unreleased driver payout holds
 */

type ProfileRow = { id: string; full_name: string | null };

export async function GET() {
  const gate = await requirePermission("view_incidents");
  if (gate.error) return gate.error;
  const { supabase } = gate;

  // Two-bucket dashboard. Recent actions over-fetch by one so we can
  // surface "more available" without paginating inline; active holds
  // stay unbounded but unresolved-only.
  const ACTIONS_CAP = 60;
  const HOLDS_CAP = 100;

  const [{ data: actions }, { data: holds }] = await Promise.all([
    supabase
      .from("moderation_actions")
      .select(
        "id, admin_label, target_user_id, target_label, action_type, reason, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(ACTIONS_CAP + 1),
    supabase
      .from("payout_holds")
      .select(
        "id, driver_user_id, reason, hold_amount, created_by_label, created_at",
      )
      .is("released_at", null)
      .order("created_at", { ascending: false })
      .limit(HOLDS_CAP + 1),
  ]);

  const actionRows = actions ?? [];
  const holdRowsAll = holds ?? [];
  const hasMoreActions = actionRows.length > ACTIONS_CAP;
  const hasMoreHolds = holdRowsAll.length > HOLDS_CAP;
  const trimmedActions = hasMoreActions
    ? actionRows.slice(0, ACTIONS_CAP)
    : actionRows;
  const trimmedHolds = hasMoreHolds
    ? holdRowsAll.slice(0, HOLDS_CAP)
    : holdRowsAll;

  // Resolve driver names for the active holds.
  const nameById = new Map<string, string>();
  if (trimmedHolds.length > 0) {
    const { data: names } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [
        ...new Set(trimmedHolds.map((h) => h.driver_user_id as string)),
      ]);
    for (const p of (names ?? []) as ProfileRow[]) {
      nameById.set(p.id, p.full_name ?? "Unnamed driver");
    }
  }

  return NextResponse.json({
    recentActions: trimmedActions.map((a) => ({
      id: a.id,
      admin: a.admin_label ?? "Admin",
      targetUserId: a.target_user_id,
      targetName: a.target_label ?? "Unnamed user",
      actionType: a.action_type,
      reason: a.reason,
      createdAt: a.created_at,
    })),
    activeHolds: trimmedHolds.map((h) => ({
      id: h.id,
      driverUserId: h.driver_user_id,
      driverName: nameById.get(h.driver_user_id as string) ?? "Unnamed driver",
      reason: h.reason,
      holdAmount: h.hold_amount,
      createdBy: h.created_by_label ?? "Admin",
      createdAt: h.created_at,
    })),
    pagination: {
      hasMoreActions,
      hasMoreHolds,
    },
  });
}
