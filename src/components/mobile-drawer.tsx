"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Logo } from "./logo";
import { Icon, type IconName } from "./icons";
import { NATIVE_DRIVER_TAB_HREFS, isTopTabPath } from "./native-bottom-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { clearSessionPolicy } from "@/lib/session-policy";
import { useT } from "@/lib/i18n";
import { isNativeApp } from "@/lib/native";

type NavLink = {
  label: string;
  /** Optional i18n key — when present, the label flips between English
   *  and Patois based on the rider's language preference. Falls back
   *  to the literal `label` if no translation exists. */
  labelKey?: string;
  href: string;
  icon: IconName;
};

type MobileDrawerProps = {
  title: string;
  subtitle: string;
  nav: NavLink[];
  children: React.ReactNode;
  /** When set, the drawer renders a search input above the nav and
   *  filters items by label as the admin types. Off for rider/driver
   *  surfaces — their nav is short enough to scan visually. */
  searchable?: boolean;
  /** When set, the drawer polls this URL for `{counts: {href: number}}`
   *  every BADGE_POLL_MS and renders the count as a small badge on the
   *  matching nav item. Used by the admin sidebar so the admin sees
   *  "you have 3 payouts to action" at a glance from anywhere in the
   *  console. */
  badgesFetchUrl?: string;
};

/** How often to re-fetch the sidebar badge counts (admin only). 30s
 *  is responsive enough for "you have a new pending thing" without
 *  hammering the DB. Refresh also fires on tab focus. */
const BADGE_POLL_MS = 30_000;

/**
 * Dark sidebar with brand-red accents on the active item + user profile
 * footer with sign-out. Used by all rider/driver/admin portal pages.
 *
 * Why dark, not red: the sidebar is on-screen all day, so a neutral chrome
 * keeps the main content (which uses red for CTAs and badges) actually
 * legible. Red is reserved for the active nav item, the chevron, and a
 * faint corner bloom for brand presence.
 *
 * Layout: fixed-width sidebar on the left (md+), drawer overlay on mobile.
 */
export function MobileDrawer({
  // title + subtitle accepted for backward compat with PortalLayout's props,
  // but no longer rendered — Logo at top is enough chrome.
  title: _title,
  subtitle: _subtitle,
  nav,
  children,
  searchable = false,
  badgesFetchUrl,
}: MobileDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Sidebar search query — only used when `searchable` is true.
  // Filters the rendered nav list by case-insensitive label substring.
  const [navQuery, setNavQuery] = useState("");
  // Per-href badge counts fetched from `badgesFetchUrl`. Stays empty
  // for surfaces that don't enable badges (rider/driver).
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<{
    full_name: string | null;
    email: string | null;
    role: string | null;
    avatar_url: string | null;
  } | null>(null);
  // Tracks the initial fetch separately from `profile` so we can show
  // a real skeleton instead of a misleading "Loading…" string that
  // sticks around even after the request resolves with empty fields.
  const [profileLoading, setProfileLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();

  // In the Capacitor driver app, the five most-used surfaces (Home,
  // Trip, Earnings, History, Me) live in the bottom tab bar — so we
  // hide them from the drawer to avoid duplicate navigation paths.
  // On the web, or for rider/admin nav, the drawer remains the full
  // navigation primitive.
  const native = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );
  const onDriverRoute = (pathname ?? "").startsWith("/driver");
  const baseVisibleNav =
    native && onDriverRoute
      ? nav.filter((item) => !NATIVE_DRIVER_TAB_HREFS.has(item.href))
      : nav;

  // Search filter — case-insensitive substring on the rendered label.
  // Falls through unchanged when search isn't enabled or the query is
  // empty. Matching on the resolved (possibly Patois) label so the
  // search behaviour matches what the admin sees on screen.
  const trimmedQuery = navQuery.trim().toLowerCase();
  const visibleNav =
    searchable && trimmedQuery
      ? baseVisibleNav.filter((item) => {
          const display = (
            item.labelKey ? t(item.labelKey, item.label) : item.label
          ).toLowerCase();
          return display.includes(trimmedQuery);
        })
      : baseVisibleNav;

  // Badge polling. Fetches `{counts: {href: number}}` from the
  // optional `badgesFetchUrl`, re-fires on tab focus and every
  // BADGE_POLL_MS so the admin's at-a-glance numbers stay fresh.
  useEffect(() => {
    if (!badgesFetchUrl) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const res = await fetch(badgesFetchUrl, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as {
          counts?: Record<string, number>;
        };
        if (!cancelled) setBadges(json.counts ?? {});
      } catch {
        /* swallow — sidebar shouldn't error-out if counts are flaky */
      }
    };
    void fetchCounts();
    const interval = window.setInterval(fetchCounts, BADGE_POLL_MS);
    const onFocus = () => void fetchCounts();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [badgesFetchUrl]);

  // In the native driver app, pages that are NOT one of the bottom-nav
  // tabs (wallet, route taxi, notifications, deep details, etc.) lose
  // the bottom bar and get a back-button on the left of the top bar
  // instead — the standard "pushed view" pattern in real native apps.
  const showBackButton = native && onDriverRoute && !isTopTabPath(pathname);

  // Fetch the signed-in user's profile for the footer block. We do
  // two parallel fetches: one for name/email/role from the profiles
  // table, and one for the avatar URL via /api/me/avatar — the
  // server endpoint resolves the verified TA selfie for drivers
  // (signed storage URL) and falls through to the OAuth picture for
  // riders. This keeps the storage signing on the server.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setProfileLoading(false);
        return;
      }

      // `.maybeSingle()` rather than `.single()` so a missing profile
      // row (rare — happens if the auth-migration trigger never ran
      // for this user, or for a Google OAuth user whose row pre-dates
      // the avatar trigger) doesn't blow up the whole fetch. We
      // fallback to OAuth metadata in that case.
      const [{ data }, avatarRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, role, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        fetch("/api/me/avatar").then((r) =>
          r.ok ? (r.json() as Promise<{ avatarUrl: string | null }>) : null,
        ),
      ]);
      if (cancelled) return;

      // Resolve the display name through every available source. Google
      // OAuth puts the user's name under `name` in raw_user_meta_data
      // (sometimes also `full_name` after Supabase normalisation). If
      // neither the profiles row nor the metadata yields a name, fall
      // back to the local-part of the email so the sidebar never shows
      // a perpetual "Loading…" — that's worse UX than "raj" or similar.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metaName =
        (typeof meta.full_name === "string" ? meta.full_name : null) ??
        (typeof meta.name === "string" ? meta.name : null);
      const emailLocal = user.email ? user.email.split("@")[0] : null;
      const resolvedName = data?.full_name ?? metaName ?? emailLocal ?? null;

      const metaAvatar =
        (typeof meta.avatar_url === "string" ? meta.avatar_url : null) ??
        (typeof meta.picture === "string" ? meta.picture : null);

      setProfile({
        full_name: resolvedName,
        email: user.email ?? null,
        role: data?.role ?? null,
        avatar_url:
          avatarRes?.avatarUrl ?? data?.avatar_url ?? metaAvatar ?? null,
      });
      setProfileLoading(false);

      // Backfill: if profiles.full_name was null but we resolved a
      // name from OAuth metadata, persist it so future loads get the
      // name without going through the fallback chain. Best-effort —
      // the UI is already up-to-date either way.
      if (!data?.full_name && metaName) {
        void fetch("/api/me/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName: metaName }),
        }).catch(() => null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    // Portal detection — derived from the current PATH, not the
    // loaded profile.role. The path is the source of truth for
    // "which login screen should I return to", because any account
    // permitted on `/admin/*` (admin, safety_officer, support, etc.)
    // should return to the admin login regardless of their specific
    // role string. The previous logic preferred profile.role and
    // bounced any non-"admin" account on the admin portal back to
    // the rider login, which is what was happening to safety officers
    // (and any future non-"admin" admin-portal role) on sign-out.
    const portal: "admin" | "driver" | "rider" = (pathname ?? "").startsWith(
      "/admin",
    )
      ? "admin"
      : (pathname ?? "").startsWith("/driver")
        ? "driver"
        : "rider";
    // We still use `role` below for the driver-specific offline flip;
    // for that we trust the profile if loaded, otherwise the portal
    // (since the API will refuse if the account isn't a driver anyway).
    const role = profile?.role ?? portal;

    // Drivers: flip them offline before clearing the session so the
    // persisted is_online flag matches their actual intent (won't be
    // taking rides while signed out). The offline endpoint refuses
    // the flip if there's an active trip in flight — that's the ONE
    // case worth awaiting since we can't sign out a mid-trip driver.
    if (role === "driver") {
      const res = await fetch("/api/driver/online", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: false }),
      }).catch(() => null);
      if (res && res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        alert(
          body.message ??
            "You can't sign out while a trip is in progress. Finish or cancel the current ride first.",
        );
        return;
      }
    }

    // Tear the session down WITHOUT awaiting the network round-trip.
    // supabase.auth.signOut() clears local storage synchronously
    // before it issues the revoke request, so by the time the next
    // line runs there is no session anymore — the network call
    // races us to the login page in the background and a failure
    // doesn't matter (local session is already gone). Net effect:
    // the tap feels instant instead of waiting on a remote /logout.
    void supabase.auth.signOut();
    clearSessionPolicy();
    const loginPath =
      portal === "admin"
        ? "/auth/admin/login"
        : portal === "driver"
          ? "/auth/driver/login"
          : "/auth/rider/login";
    router.push(loginPath);
    router.refresh();
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() ?? "")
        .join("")
    : (profile?.email?.[0]?.toUpperCase() ?? "·");

  // Pick the active nav item by longest matching href. Stops the root
  // "/rider" Dashboard link from showing as active on every nested page —
  // on /rider/request only "Request a ride" lights up, etc.
  //
  // We compute against `baseVisibleNav` (NOT the search-filtered
  // `visibleNav`) so the active state is consistent regardless of
  // what the admin has typed into the sidebar search box.
  const activeHref = baseVisibleNav.reduce<string | null>((longest, item) => {
    const matches =
      pathname === item.href || pathname?.startsWith(`${item.href}/`);
    if (!matches) return longest;
    if (!longest || item.href.length > longest.length) return item.href;
    return longest;
  }, null);

  // Lock body scroll while the mobile drawer is open. Without this, a
  // swipe on the backdrop scrolls the page underneath, which makes the
  // drawer feel like it's not even open. Also kills the iOS rubber-band
  // bounce on the visible area outside the drawer.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    // Layout structure is scoped to driver routes only. The driver
    // native app needs the "internal <main> scrolls" pattern so the
    // top bar + bottom nav stay anchored when the page-transition
    // motion.div applies its transform (which would otherwise turn
    // sticky elements into "stick within the motion.div" elements
    // and let them scroll off). Rider + admin portals don't have a
    // bottom nav OR a page-transition wrapper, so they keep the
    // simpler body-scroll layout — which gives them back the
    // browser's native scroll feel (pull-to-refresh, address-bar
    // collapse, etc.) and removes the empty bottom strip the user
    // flagged on the rider side.
    <div
      className={
        onDriverRoute
          ? "flex h-[100dvh] flex-col bg-background md:grid md:h-screen md:grid-cols-[280px_1fr] md:overflow-hidden"
          : "min-h-screen bg-background md:grid md:h-screen md:grid-cols-[280px_1fr] md:overflow-hidden"
      }
    >
      {/* ============== Mobile top bar ==============
         Driver routes: shrink-0 flex item (header is locked at the
         top of the viewport-height flex column).
         Rider/admin:   sticky top-0 (header rides body scroll as
         it always did — keeps the rider portal unchanged). */}
      <header
        className={
          onDriverRoute
            ? "z-40 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden"
            : "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden"
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          {showBackButton && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-soft text-foreground hover:bg-surface active:scale-95"
            >
              <Icon name="chevron-left" className="h-5 w-5" />
            </button>
          )}
          <Logo size="sm" tagline />
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-soft hover:bg-surface"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
        >
          <Icon name={isOpen ? "x" : "menu"} className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile backdrop. Always in the DOM with opacity tied to
         `isOpen` so it fades in / out smoothly via CSS transition —
         the previous conditional-render approach popped it in
         instantly, which read as the drawer "lagging" because the
         backdrop appeared before the drawer slide started. Pointer
         events disabled while hidden so it can't intercept taps. */}
      <button
        aria-hidden
        tabIndex={-1}
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-[55] touch-none bg-black/50 transition-opacity duration-200 ease-out md:hidden ${
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        style={{ willChange: "opacity" }}
      />

      {/* ============== Sidebar ==============
         Mobile: covers the full viewport (top:0) at z-[60] so it sits
         above the sticky mobile top bar (z-40) AND the backdrop. The
         close button is baked into its own dark header — avoids the
         awkward white-strip-then-dark stack you'd get if it sat below
         the page's mobile top bar.
         Desktop: takes the full viewport in its grid cell. */}
      <aside
        // `duration-200 ease-out` + a willChange:transform hint give us
        // a GPU-promoted compositor layer that animates the slide on a
        // single transform property — the fastest path the browser
        // has. md:transition-none kills the transition on desktop so
        // the static sidebar doesn't briefly slide on first paint or
        // breakpoint switches.
        className={`fixed left-0 top-0 z-[60] flex h-[100dvh] w-72 flex-col overflow-hidden text-white shadow-2xl transition-transform duration-200 ease-out md:static md:z-auto md:h-screen md:w-auto md:translate-x-0 md:shadow-none md:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          willChange: "transform",
          // Premium dark surface: a faint white glaze at the very top for that
          // glassy SaaS feel, a warm-to-deep gradient body, and a soft red
          // bloom in the bottom-right corner so the brand still whispers.
          background:
            "radial-gradient(circle at 100% 100%, rgba(241,1,0,0.18) 0%, rgba(241,1,0,0) 38%), linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 24%), linear-gradient(165deg, #1a1d10 0%, #111906 55%, #07090a 100%)",
        }}
      >
        {/* Mobile drawer header: logo on the left, close button on
           the right. Dark theme matches the rest of the drawer so
           there's no contrasting white strip above the nav. */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
          <Logo size="sm" variant="white" tagline />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-white/85 hover:bg-white/15"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop logo header — unchanged. */}
        <div className="relative hidden border-b border-white/10 px-6 pb-5 pt-7 md:block">
          <Logo size="sm" variant="white" tagline />
        </div>

        {/* Nav with icons + active state. Hidden scrollbar — still scrollable
            for very long nav lists, just no visible scrollbar.
            `min-h-0` is the canonical fix for "flex child should scroll":
            without it, the flex item won't shrink below its content's
            intrinsic height, so `overflow-y-auto` never triggers and
            the OUTER page scrolls instead of the nav. */}
        <nav
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-4 [&::-webkit-scrollbar]:hidden md:pt-5"
          style={{ scrollbarWidth: "none" }}
          aria-label="Portal navigation"
        >
          {/* Search input — only when the host portal opted in
             (admin surface). Filters the rendered nav list by
             case-insensitive label substring. */}
          {searchable && (
            <div className="relative mb-3">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
                <Icon name="search" className="h-3.5 w-3.5" />
              </span>
              <input
                type="search"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Search menu…"
                aria-label="Search the sidebar"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:bg-white/10 focus:outline-none"
              />
            </div>
          )}
          <ul className="grid gap-1">
            {visibleNav.map((item) => {
              const active = item.href === activeHref;
              const badgeCount = badges[item.href] ?? 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-white text-rajlo-red shadow-md shadow-black/10"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
                        active
                          ? "bg-primary-soft text-rajlo-red"
                          : "bg-white/10 text-white/90"
                      }`}
                    >
                      <Icon name={item.icon} className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate">
                      {item.labelKey
                        ? t(item.labelKey, item.label)
                        : item.label}
                    </span>
                    {/* Pending count badge — surfaces "X waiting"
                       at-a-glance so the admin can prioritise without
                       opening every queue. Brand red on a white-text
                       chip when the row isn't active; flipped to
                       white-on-red when it is. Cap displayed value at
                       99+ so a long-running queue doesn't blow out
                       the layout. */}
                    {badgeCount > 0 && (
                      <span
                        className="ml-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-rajlo-red px-1 text-[10px] font-extrabold leading-none text-white"
                        aria-label={`${badgeCount} pending`}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                    {active && (
                      <Icon
                        name="chevron-right"
                        className="h-3.5 w-3.5 text-rajlo-red"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User profile + sign out */}
        <div className="relative border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3 backdrop-blur">
            <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-sm font-bold uppercase ring-1 ring-white/15">
              {profileLoading ? (
                <span className="h-full w-full animate-pulse bg-white/15" />
              ) : profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              {profileLoading ? (
                <>
                  <span className="block h-3 w-24 animate-pulse rounded bg-white/20" />
                  <span className="mt-1.5 block h-2.5 w-32 animate-pulse rounded bg-white/15" />
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold">
                    {profile?.full_name ?? "Rider"}
                  </p>
                  <p className="truncate text-[11px] text-white/70">
                    {profile?.email ?? ""}
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-95"
            >
              <Icon name="log-out" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ============== Main content ==============
         The scroll container for the whole page. flex-1 makes it fill
         the viewport between the header above and the bottom nav
         (which floats fixed over its bottom edge). overflow-y-auto
         scopes scrolling here — header + bottom nav never participate.
         Bottom padding is owned by the global rule on `body main` so
         content clears the fixed bottom nav. */}
      <main
        className={
          onDriverRoute
            ? // Driver: internal scroll container so the chrome stays put.
              "relative flex-1 overflow-y-auto overflow-x-hidden"
            : // Rider/admin: body scrolls (original behaviour). The
              // pb-20 reserves bottom breathing room since there's no
              // floating bottom nav to clear here.
              "relative overflow-x-hidden pb-20 md:overflow-y-auto md:pb-0"
        }
      >
        {children}
      </main>
    </div>
  );
}
