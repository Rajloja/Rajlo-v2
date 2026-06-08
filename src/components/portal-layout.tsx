import { MobileDrawer } from "./mobile-drawer";
import type { IconName } from "./icons";

type NavLink = {
  label: string;
  href: string;
  icon: IconName;
};

type PortalLayoutProps = {
  title: string;
  subtitle: string;
  nav: NavLink[];
  children: React.ReactNode;
  /** Forwarded to MobileDrawer — admin surface enables a search box
   *  above the nav so the admin can jump straight to a section
   *  without scanning ~25 items. Off for rider/driver. */
  searchable?: boolean;
  /** Forwarded to MobileDrawer — when set, the drawer polls this
   *  URL for pending-item counts and renders them as small badges
   *  next to each nav item. Admin sidebar uses
   *  `/api/admin/sidebar-counts`. */
  badgesFetchUrl?: string;
};

export function PortalLayout({
  title,
  subtitle,
  nav,
  children,
  searchable,
  badgesFetchUrl,
}: PortalLayoutProps) {
  return (
    <MobileDrawer
      title={title}
      subtitle={subtitle}
      nav={nav}
      searchable={searchable}
      badgesFetchUrl={badgesFetchUrl}
    >
      {/* Mobile gutter mirrors the top navbar's `px-4` so the
         page content lines up with the logo + menu button on the
         left edge. Desktop keeps the tighter halved `px-2` since
         the sidebar already provides visual breathing room. */}
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-2 md:py-6">
        {children}
      </div>
    </MobileDrawer>
  );
}