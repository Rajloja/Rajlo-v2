import { redirect } from "next/navigation";
import { PortalLayout } from "@/components/portal-layout";
import { AdminAccessBeacon } from "@/components/admin-access-beacon";
import { adminNav, safetyOfficerNav } from "@/lib/mock-data";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  asAdminRole,
  userHasPermission,
  userPermissions,
} from "@/lib/admin-rbac";
import { requiredPermissionForAdminPath } from "@/lib/admin-route-permissions";
import { AdminPermissionsProvider } from "@/components/admin-permissions";

/**
 * Admin / officer portal shell.
 *
 * Both `admin` and `safety_officer` roles route through this layout —
 * officers need access to the safety queue + live trips, which live
 * under /admin/* alongside the full ops console. We branch on the
 * authenticated user's profile.role so officers only see the scoped
 * nav (Safety + Live trips) and don't even render the rest of the
 * admin sidebar that they wouldn't have permission for at the API
 * layer anyway.
 *
 * Anyone else hitting /admin gets bounced to /sign-in (no auth) or
 * the rider dashboard (signed in but wrong role).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in?from=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, admin_role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  if (role !== "admin" && role !== "safety_officer") {
    redirect("/rider");
  }

  const isAdmin = role === "admin";

  // Scope the sidebar to the viewer's RBAC tier: a nav item only shows
  // if its route requires no specific permission, or the viewer's tier
  // grants it. The proxy enforces the same map server-side — this just
  // keeps lower tiers from seeing menu items they'd be 403'd out of.
  const adminRole = asAdminRole(profile?.admin_role);
  const nav = isAdmin
    ? adminNav.filter((item) => {
        const needed = requiredPermissionForAdminPath(item.href);
        return !needed || userHasPermission(role, adminRole, needed);
      })
    : safetyOfficerNav;

  // The viewer's effective RBAC permissions — handed to client pages
  // (via context) so they can scope what they render to the tier.
  const permissions = userPermissions(role, adminRole);

  return (
    <AdminPermissionsProvider permissions={permissions}>
      <PortalLayout
        title={isAdmin ? "Admin/Ops Portal" : "Safety Operations"}
        subtitle={
          isAdmin
            ? "Verification operations, pricing controls, and incident workflows."
            : "Safety queue, live trips, and rider chat — scoped to safety scope."
        }
        nav={nav}
      >
        {/* Records an admin_access_logs entry once per session for the
           security dashboard's access history. */}
        {isAdmin && <AdminAccessBeacon />}
        {children}
      </PortalLayout>
    </AdminPermissionsProvider>
  );
}
