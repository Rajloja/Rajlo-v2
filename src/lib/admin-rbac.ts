/**
 * RAJLO internal admin RBAC — the 5-tier privilege model.
 *
 * Each admin (a user with `profiles.role = 'admin'`) also carries a
 * granular `admin_role`. The permission each tier grants is defined
 * HERE, in code — not in the database — so the matrix is
 * version-controlled, reviewable, and can't be widened by tampering
 * with a DB row.
 *
 * Enforcement: API routes call `requirePermission(<permission>)` from
 * admin-auth.ts. A tier that lacks the permission gets a 403.
 */

/** The 5 internal admin tiers, least → most privileged. */
export const ADMIN_ROLES = [
  "support_agent",
  "moderator",
  "compliance",
  "technical_admin",
  "super_admin",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Every gated capability across the admin surface. The WHOLE admin
 *  panel — legacy pages + APIs included — is gated against these via
 *  the central route-permission map (lib/admin-route-permissions.ts).
 *  Adding a permission here without mapping a route just means no
 *  route requires it yet. */
export type AdminPermission =
  | "view_operations" // ops dashboard, live trips, ride monitoring, sessions
  | "view_analytics" // business-performance analytics — revenue, growth, volume
  | "manage_routes" // edit the route-taxi catalogue
  | "manage_users" // view + act on rider / driver accounts
  | "view_incidents" // incident reports + safety queue + messaging
  | "manage_incidents" // update / resolve / close incidents
  | "suspend_user" // temporary rider/driver suspension
  | "ban_user" // permanent account ban
  | "view_finance" // wallets, transactions, QR charges
  | "freeze_payout" // payouts, payout holds, wallet adjustments
  | "view_fraud" // see risk scores + fraud dashboards
  | "manage_fraud" // open/resolve fraud investigations, raise flags
  | "export_evidence" // export consent / incident / fraud evidence
  | "review_drivers" // driver verification, vehicle changes, violations
  | "edit_policies" // edit + publish legal policies
  | "manage_security" // audit logs + admin security console
  | "manage_admins"; // add admins, change roles, suspend admins

/** Human labels for the tiers — used in the admin UI. */
export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  support_agent: "Support agent",
  moderator: "Moderator",
  compliance: "Compliance / investigator",
  technical_admin: "Technical admin",
  super_admin: "Super admin",
};

/** One-line description of each tier — shown in the role picker.
 *  Worded to make the hierarchy explicit at a glance. */
export const ADMIN_ROLE_DESCRIPTION: Record<AdminRole, string> = {
  support_agent:
    "Front line — read-only incident review and live-ops visibility.",
  moderator:
    "Everything Support can do, plus incident handling, user suspensions and driver review.",
  compliance:
    "Everything Moderator can do, plus financial records, payouts, fraud cases, evidence exports and analytics.",
  technical_admin:
    "Specialist — infrastructure, security console and the route catalogue. No financial or user-data access.",
  super_admin:
    "Full access — everything Compliance can do, plus bans, policy publishing and admin management.",
};

/**
 * The permission matrix — built as a strict HIERARCHY.
 *
 * support_agent ⊂ moderator ⊂ compliance ⊂ super_admin: each rung is
 * literally the rung below it (spread in) plus its own additions, so
 * the hierarchy can never silently drift — a lower tier can't hold a
 * permission a higher tier lacks.
 *
 * `technical_admin` is deliberately NOT a rung in that ladder. It is a
 * SPECIALIST tier — platform infrastructure, the security console and
 * the route catalogue — with no financial or user-data access. It
 * sits beside the ladder, not inside it.
 */

/** Tier 1 — front line. Read-only operational + incident visibility. */
const SUPPORT_AGENT_PERMISSIONS: AdminPermission[] = [
  "view_operations",
  "view_incidents",
];

/** Tier 2 — Support + enforcement: works incidents, suspends users,
 *  reviews drivers and fraud signals. No finance, no analytics. */
const MODERATOR_PERMISSIONS: AdminPermission[] = [
  ...SUPPORT_AGENT_PERMISSIONS,
  "manage_incidents",
  "manage_users",
  "suspend_user",
  "view_fraud",
  "review_drivers",
];

/** Tier 3 — Moderator + the financial / investigative reach: business
 *  analytics, wallets, payouts, fraud cases and evidence exports. */
const COMPLIANCE_PERMISSIONS: AdminPermission[] = [
  ...MODERATOR_PERMISSIONS,
  "view_analytics",
  "view_finance",
  "freeze_payout",
  "manage_fraud",
  "export_evidence",
];

/** Tier 4 — Compliance + the platform-governance powers: permanent
 *  bans, policy publishing, the security console and admin management.
 *  Spread from Compliance so it can never lack a lower tier's reach. */
const SUPER_ADMIN_PERMISSIONS: AdminPermission[] = [
  ...COMPLIANCE_PERMISSIONS,
  "manage_routes",
  "ban_user",
  "edit_policies",
  "manage_security",
  "manage_admins",
];

/** Specialist (OFF-ladder) — platform infrastructure, security config
 *  and the route catalogue. Deliberately no finance, no fraud cases,
 *  no user management — an infra role shouldn't see customer money or
 *  personal data. */
const TECHNICAL_ADMIN_PERMISSIONS: AdminPermission[] = [
  "view_operations",
  "view_incidents",
  "manage_routes",
  "manage_security",
];

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  support_agent: SUPPORT_AGENT_PERMISSIONS,
  moderator: MODERATOR_PERMISSIONS,
  compliance: COMPLIANCE_PERMISSIONS,
  technical_admin: TECHNICAL_ADMIN_PERMISSIONS,
  super_admin: SUPER_ADMIN_PERMISSIONS,
};

/** Permissions granted to a safety officer (profiles.role =
 *  'safety_officer'). Officers aren't `admin` tier — they get a fixed,
 *  narrow set: the safety queue, incidents, and operational trip
 *  visibility so they can intervene on a live ride. */
const SAFETY_OFFICER_PERMISSIONS: AdminPermission[] = [
  "view_operations",
  "view_incidents",
  "manage_incidents",
];

/**
 * Does an admin tier grant a permission?
 *
 * A null role (an `admin` profile that predates RBAC assignment, or
 * one never given a tier) grants NOTHING — least privilege. A
 * super_admin then assigns the proper tier from the admin panel.
 */
export function hasPermission(
  role: AdminRole | null | undefined,
  permission: AdminPermission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** All permissions a tier holds — handy for the admin UI. */
export function permissionsFor(role: AdminRole | null | undefined): AdminPermission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Narrow an arbitrary string to a valid AdminRole, or null. */
export function asAdminRole(value: string | null | undefined): AdminRole | null {
  return value && (ADMIN_ROLES as readonly string[]).includes(value)
    ? (value as AdminRole)
    : null;
}

/**
 * The effective permission set for a user, resolved from BOTH their
 * `profiles.role` and (for admins) their `admin_role` tier.
 *
 *   - safety_officer → the fixed officer set
 *   - admin          → their RBAC tier's set (none if no tier assigned)
 *   - anyone else    → nothing (riders/drivers have no admin reach)
 */
export function userPermissions(
  role: string | null | undefined,
  adminRole: AdminRole | null | undefined,
): AdminPermission[] {
  if (role === "safety_officer") return SAFETY_OFFICER_PERMISSIONS;
  if (role === "admin") return permissionsFor(adminRole);
  return [];
}

/** Whether a user (by profile role + admin tier) holds a permission. */
export function userHasPermission(
  role: string | null | undefined,
  adminRole: AdminRole | null | undefined,
  permission: AdminPermission,
): boolean {
  return userPermissions(role, adminRole).includes(permission);
}
