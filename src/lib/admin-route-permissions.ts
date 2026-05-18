import type { AdminPermission } from "./admin-rbac";

/**
 * Central map: which RBAC permission each admin path requires.
 *
 * This is the SINGLE enforcement source. The proxy (src/proxy.ts)
 * checks it on every `/admin/*` page and `/api/admin/*` request, and
 * the admin layout filters the sidebar with it — so a tier can neither
 * see nor reach anything its permission set doesn't cover, legacy
 * routes included. Adding a new admin route is automatically covered
 * by the nearest matching prefix; map it explicitly when it needs a
 * different permission.
 *
 * Paths are normalised so `/api/admin/x` and `/admin/x` resolve the
 * same. Matching is longest-prefix-wins on segment boundaries, so
 * `/admin/security/beacon` can be looser than `/admin/security`.
 */

type Rule = { prefix: string; permission: AdminPermission };

const ROUTE_PERMISSIONS: Rule[] = [
  // ── Business analytics (revenue / growth / volume) — senior tiers ──
  { prefix: "/admin/analytics", permission: "view_analytics" },
  // ── Operations / monitoring ──
  // `/admin/stats` is the operational KPI strip (driver / ride / queue
  // counts) — every admin tier needs it. Its one financial field
  // (revenue) is gated separately inside the route itself.
  { prefix: "/admin/stats", permission: "view_operations" },
  { prefix: "/admin/activity", permission: "view_operations" },
  { prefix: "/admin/live-trips", permission: "view_operations" },
  { prefix: "/admin/ride-monitoring", permission: "view_operations" },
  { prefix: "/admin/route-sessions", permission: "view_operations" },
  { prefix: "/admin/rides", permission: "view_operations" },
  // ── Route-taxi catalogue ──
  { prefix: "/admin/routes", permission: "manage_routes" },
  // ── Incidents / safety / messaging ──
  { prefix: "/admin/ride-chat", permission: "view_incidents" },
  { prefix: "/admin/safety-alerts", permission: "view_incidents" },
  { prefix: "/admin/safety", permission: "view_incidents" },
  { prefix: "/admin/incidents", permission: "view_incidents" },
  { prefix: "/admin/moderation", permission: "view_incidents" },
  { prefix: "/admin/messages", permission: "view_incidents" },
  // ── User accounts ──
  { prefix: "/admin/users", permission: "manage_users" },
  { prefix: "/admin/drivers", permission: "manage_users" },
  // ── Driver verification ──
  { prefix: "/admin/verification-queue", permission: "review_drivers" },
  { prefix: "/admin/verification-detail", permission: "review_drivers" },
  { prefix: "/admin/verification", permission: "review_drivers" },
  { prefix: "/admin/vehicle-changes", permission: "review_drivers" },
  { prefix: "/admin/violations", permission: "review_drivers" },
  { prefix: "/admin/driver-violations", permission: "review_drivers" },
  { prefix: "/admin/document-url", permission: "review_drivers" },
  // ── Finance ──
  { prefix: "/admin/wallet-withdrawals", permission: "freeze_payout" },
  { prefix: "/admin/wallets", permission: "view_finance" },
  { prefix: "/admin/transactions", permission: "view_finance" },
  { prefix: "/admin/qr-charges", permission: "view_finance" },
  // ── Fraud ──
  { prefix: "/admin/fraud", permission: "view_fraud" },
  // ── Compliance / security / governance ──
  { prefix: "/admin/audit-logs", permission: "manage_security" },
  // The access beacon is pinged by EVERY admin on portal load — it
  // must stay loose; the security console itself is super-admin only.
  { prefix: "/admin/security/beacon", permission: "view_operations" },
  { prefix: "/admin/security", permission: "manage_admins" },
  { prefix: "/admin/admins", permission: "manage_admins" },
  { prefix: "/admin/safety-officers", permission: "manage_admins" },
  // ── Legal ──
  { prefix: "/admin/legal", permission: "edit_policies" },
];

/** True when `prefix` matches `path` on a segment boundary. */
function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The permission an admin path requires, or null when the path needs
 * no specific permission beyond being an admin (e.g. the `/admin`
 * dashboard, or an unmapped stub route).
 *
 * Accepts both `/admin/...` and `/api/admin/...`.
 */
export function requiredPermissionForAdminPath(
  rawPath: string,
): AdminPermission | null {
  // Normalise `/api/admin/x` → `/admin/x`.
  const path = rawPath.startsWith("/api/admin")
    ? rawPath.slice(4)
    : rawPath;
  if (path !== "/admin" && !path.startsWith("/admin/")) return null;

  let best: { len: number; permission: AdminPermission } | null = null;
  for (const rule of ROUTE_PERMISSIONS) {
    if (matches(path, rule.prefix)) {
      if (!best || rule.prefix.length > best.len) {
        best = { len: rule.prefix.length, permission: rule.permission };
      }
    }
  }
  return best?.permission ?? null;
}
