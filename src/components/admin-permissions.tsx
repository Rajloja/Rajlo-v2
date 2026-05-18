"use client";

import { createContext, useContext } from "react";
import type { AdminPermission } from "@/lib/admin-rbac";

/**
 * Makes the signed-in admin's effective RBAC permission set available
 * to client components inside the admin portal.
 *
 * The admin layout (a server component) resolves the viewer's tier and
 * permissions, then renders `<AdminPermissionsProvider>` so any client
 * page can scope what it shows — e.g. the dashboard hides the revenue
 * and analytics sections from tiers without `view_analytics`.
 *
 * This is UI scoping only. The server-side proxy + per-route checks
 * remain the real enforcement; this just stops lower tiers from seeing
 * panels they'd be 403'd out of anyway.
 */

const AdminPermissionsContext = createContext<AdminPermission[]>([]);

export function AdminPermissionsProvider({
  permissions,
  children,
}: {
  permissions: AdminPermission[];
  children: React.ReactNode;
}) {
  return (
    <AdminPermissionsContext.Provider value={permissions}>
      {children}
    </AdminPermissionsContext.Provider>
  );
}

/** All permissions the current admin viewer holds. */
export function useAdminPermissions(): AdminPermission[] {
  return useContext(AdminPermissionsContext);
}

/** Whether the current admin viewer holds a specific permission. */
export function useHasAdminPermission(permission: AdminPermission): boolean {
  return useContext(AdminPermissionsContext).includes(permission);
}
