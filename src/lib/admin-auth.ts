import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAuthServerClient } from "./supabase-auth-server";
import { getSupabaseServerClient } from "./supabase-server";
import {
  asAdminRole,
  hasPermission,
  type AdminPermission,
  type AdminRole,
} from "./admin-rbac";

/**
 * Shared admin route gatekeeper.
 *
 * Every admin API endpoint should call `requireAdmin()` first — it
 * returns either an `error` response to send back, or a populated
 * `actor` + `supabase` (service-role) client ready to use. This keeps
 * the auth pattern in one place instead of copy-pasted across each
 * route handler.
 *
 * Returns:
 *   - { error: NextResponse }  — caller should immediately return the response
 *   - { actor, supabase }       — caller is authenticated as admin, proceed
 */

export type AdminActor = {
  userId: string;
  label: string;
  email: string | null;
  /** Set when the gate accepted a non-admin role (safety_officer).
   *  Endpoints can branch on this to restrict which fields a non-
   *  admin caller is allowed to mutate. */
  role: "admin" | "safety_officer";
  /** Granular admin tier (RBAC). Null for safety officers and for any
   *  admin not yet assigned a tier. Drives `requirePermission`. */
  adminRole: AdminRole | null;
};

type RequireAdminResult =
  | { error: NextResponse; actor?: never; supabase?: never }
  | { error?: never; actor: AdminActor; supabase: SupabaseClient };

export async function requireAdmin(): Promise<RequireAdminResult> {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await auth
    .from("profiles")
    .select("role, full_name, admin_role, admin_suspended")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  // A suspended admin is locked out of the entire admin surface.
  if ((profile as { admin_suspended?: boolean }).admin_suspended) {
    return {
      error: NextResponse.json(
        { error: "admin_suspended" },
        { status: 403 },
      ),
    };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Service role not configured" },
        { status: 500 },
      ),
    };
  }

  return {
    actor: {
      userId: user.id,
      label: profile.full_name ?? user.email ?? "Admin",
      email: user.email ?? null,
      role: "admin",
      adminRole: asAdminRole(
        (profile as { admin_role?: string | null }).admin_role,
      ),
    },
    supabase,
  };
}

/**
 * Permission-scoped admin gate. Calls `requireAdmin()` then checks the
 * caller's RBAC tier grants `permission` — a 403 otherwise. Use this on
 * any privileged endpoint instead of a bare `requireAdmin()`.
 */
export async function requirePermission(
  permission: AdminPermission,
): Promise<RequireAdminResult> {
  const gate = await requireAdmin();
  if (gate.error) return gate;
  if (!hasPermission(gate.actor.adminRole, permission)) {
    return {
      error: NextResponse.json(
        { error: "insufficient_permission", permission },
        { status: 403 },
      ),
    };
  }
  return gate;
}

/**
 * Same shape as `requireAdmin()` but also accepts callers whose
 * profiles.role is `safety_officer`. Use for endpoints that should
 * be reachable by both admins and the dedicated safety-ops team —
 * e.g. the safety queue, alert chat, live trips dashboard.
 *
 * The returned `actor.role` lets the handler still distinguish admin
 * (full powers) from safety_officer (scoped to safety actions) when
 * the difference matters (e.g. an admin can delete an alert; an
 * officer can only resolve / message).
 */
export async function requireSafetyOfficerOrAdmin(): Promise<RequireAdminResult> {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await auth
    .from("profiles")
    .select("role, full_name, admin_role, admin_suspended")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "safety_officer") {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  if ((profile as { admin_suspended?: boolean }).admin_suspended) {
    return {
      error: NextResponse.json(
        { error: "admin_suspended" },
        { status: 403 },
      ),
    };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Service role not configured" },
        { status: 500 },
      ),
    };
  }

  return {
    actor: {
      userId: user.id,
      label:
        profile.full_name ??
        user.email ??
        (profile.role === "admin" ? "Admin" : "Safety officer"),
      email: user.email ?? null,
      role: profile.role as "admin" | "safety_officer",
      adminRole: asAdminRole(
        (profile as { admin_role?: string | null }).admin_role,
      ),
    },
    supabase,
  };
}

/**
 * Append a row to admin_audit_logs. Fire-and-forget — failures are
 * logged but don't block the calling request, since the underlying
 * action (the user delete, the deactivation, etc.) has already
 * succeeded.
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  actor: AdminActor,
  entry: {
    targetType:
      | "rider"
      | "driver"
      | "admin"
      | "ride"
      | "system"
      | "employer";
    targetId?: string | null;
    targetLabel?: string | null;
    action: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("admin_audit_logs").insert({
    actor_id: actor.userId,
    actor_label: actor.label,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    target_label: entry.targetLabel ?? null,
    action: entry.action,
    summary: entry.summary,
    metadata: entry.metadata ?? null,
  });
  if (error) {
    console.error("admin_audit_logs insert failed:", error.message);
  }
}
