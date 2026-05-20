import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";
import { asAdminRole } from "@/lib/admin-rbac";

/**
 * GET /api/admin/security
 *
 * Powers the admin security dashboard:
 *   - admins:         the admin roster with each one's RBAC tier +
 *                     suspension state
 *   - accessLogs:     recent admin session access entries
 *   - securityEvents: recent privileged / notable admin events
 *
 * Gated by `manage_security` — technical admins and super admins.
 */

type ProfileRow = { id: string; full_name: string | null };

export async function GET() {
  const gate = await requirePermission("manage_security");
  if (gate.error) return gate.error;
  const { supabase } = gate;

  // Admin roster.
  const { data: adminRows } = await supabase
    .from("profiles")
    .select("id, full_name, admin_role, admin_suspended")
    .eq("role", "admin")
    .order("full_name", { ascending: true });

  // Recent access logs + security events. Over-fetch each by one to
  // surface "more available" hints without inline pagination — the
  // audit log is the canonical archive for older entries.
  const ACCESS_CAP = 60;
  const EVENT_CAP = 60;
  const [{ data: accessRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("admin_access_logs")
      .select("id, admin_user_id, ip_address, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(ACCESS_CAP + 1),
    supabase
      .from("admin_security_events")
      .select(
        "id, admin_user_id, event_type, severity, description, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(EVENT_CAP + 1),
  ]);
  const accessFetched = accessRows ?? [];
  const eventFetched = eventRows ?? [];
  const hasMoreAccess = accessFetched.length > ACCESS_CAP;
  const hasMoreEvents = eventFetched.length > EVENT_CAP;
  const trimmedAccess = hasMoreAccess
    ? accessFetched.slice(0, ACCESS_CAP)
    : accessFetched;
  const trimmedEvents = hasMoreEvents
    ? eventFetched.slice(0, EVENT_CAP)
    : eventFetched;

  // Resolve admin names for every id referenced by logs/events.
  const ids = new Set<string>();
  for (const r of trimmedAccess)
    if (r.admin_user_id) ids.add(r.admin_user_id as string);
  for (const r of trimmedEvents)
    if (r.admin_user_id) ids.add(r.admin_user_id as string);
  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const { data: names } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...ids]);
    for (const p of (names ?? []) as ProfileRow[]) {
      nameById.set(p.id, p.full_name ?? "Admin");
    }
  }

  return NextResponse.json({
    admins: (adminRows ?? []).map((a) => ({
      id: a.id,
      name: a.full_name ?? "Unnamed admin",
      adminRole: asAdminRole(a.admin_role as string | null),
      suspended: Boolean(a.admin_suspended),
    })),
    accessLogs: trimmedAccess.map((r) => ({
      id: r.id,
      admin: r.admin_user_id
        ? (nameById.get(r.admin_user_id as string) ?? "Admin")
        : "Unknown",
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    })),
    securityEvents: trimmedEvents.map((r) => ({
      id: r.id,
      admin: r.admin_user_id
        ? (nameById.get(r.admin_user_id as string) ?? "Admin")
        : "System",
      eventType: r.event_type,
      severity: r.severity,
      description: r.description,
      createdAt: r.created_at,
    })),
    pagination: {
      hasMoreAccessLogs: hasMoreAccess,
      hasMoreSecurityEvents: hasMoreEvents,
    },
  });
}
