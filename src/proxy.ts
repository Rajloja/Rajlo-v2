import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { asAdminRole, userHasPermission } from "@/lib/admin-rbac";
import { requiredPermissionForAdminPath } from "@/lib/admin-route-permissions";

/**
 * Two responsibilities, executed in order:
 *
 * 1. Subdomain gating (host-based)
 *    Production runs three subdomains off the same Next app:
 *      rider.rajlo.com   → only /, /rider/*, /auth/rider/*, shared pages
 *      driver.rajlo.com  → only /, /driver/*, /auth/driver/*, shared pages
 *      admin.rajlo.com   → only /, /admin/*, /auth/admin/*, shared pages
 *    Hitting the wrong portal on the wrong subdomain redirects to the
 *    correct subdomain (preserving the path) so deep links still work.
 *    The rajlo.com apex serves the marketing site ONLY — any portal
 *    path requested there is bounced to its subdomain (so a "Book a
 *    ride" link lands on rider.rajlo.com). On *.vercel.app preview
 *    deploys and localhost the subdomain rules are fully bypassed
 *    (no subdomains exist), so the same code works on real domains
 *    AND Vercel previews without two deployments.
 *
 * 2. Auth + role gating (path-based, identical to before)
 *    Anonymous visitors hitting a protected portal get bounced to the
 *    matching login. Logged-in users with the wrong role get a 403.
 *    Officer role (safety_officer) is treated like admin for the /admin
 *    surface — the per-page nav scoping inside the admin layout limits
 *    what they actually see and the API endpoints enforce the rest.
 *
 * Static assets, API routes, and public marketing pages are not gated.
 */

type Portal = "rider" | "driver" | "admin" | "employer";

/** Pages that any subdomain may serve — auth helpers, legal text,
 *  Supabase OAuth callback, common public pages. */
const SHARED_PATH_PREFIXES = [
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/set-password",
  "/legal/",
  "/support",
  "/403",
  "/trip/", // public trip-share link
  "/l/", // Rajlo short-link redirect surface
];

/** Rider-portal pages that anonymous visitors are allowed to load.
 *  The booking page renders a sticky AnonymousBookingPrompt on top
 *  of the trip preview (map + pickup + dropoff + fare estimate)
 *  instead of demanding sign-in upfront — that's a much better
 *  first-impression than bouncing every new visitor to a login form
 *  before they've seen what they're buying. The page's own client
 *  code handles the "sign in before booking" gate. */
const ANONYMOUS_FRIENDLY_RIDER_PATHS = new Set<string>([
  "/rider/request",
]);

const PORTAL_PATH_PREFIXES: Record<Portal, string[]> = {
  rider: ["/rider", "/auth/rider"],
  driver: ["/driver", "/auth/driver"],
  admin: ["/admin", "/auth/admin"],
  employer: ["/employer", "/auth/employer"],
};

/** Determine which portal (if any) this request's host is scoped to.
 *  Returns null for the apex domain, Vercel preview URLs, localhost,
 *  and anything else without a known portal prefix. */
function portalForHost(host: string | null): Portal | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname.startsWith("rider.")) return "rider";
  if (hostname.startsWith("driver.")) return "driver";
  if (hostname.startsWith("admin.")) return "admin";
  if (hostname.startsWith("employer.")) return "employer";
  return null;
}

/** True for the production marketing apex (rajlo.com / www.rajlo.com).
 *  Deliberately NOT true for *.vercel.app previews or localhost — there
 *  the portal subdomains don't exist, so portal paths must serve as-is
 *  rather than redirect to a host that isn't reachable. */
function isRajloApex(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "rajlo.com" || hostname === "www.rajlo.com";
}

/** Figure out which portal owns a given path. Returns null for
 *  shared / unrecognised paths so the caller can decide whether to
 *  allow or pass-through. */
function portalForPath(path: string): Portal | null {
  for (const [portal, prefixes] of Object.entries(PORTAL_PATH_PREFIXES) as [
    Portal,
    string[],
  ][]) {
    if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) {
      return portal;
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const portal = portalForHost(host);
  const path = request.nextUrl.pathname;

  // ─── 1. Subdomain gating ────────────────────────────────────────
  if (portal) {
    // Root path → each portal subdomain goes straight to its own
    // login screen (rider.rajlo.com → rider login, etc.). The apex
    // rajlo.com keeps the marketing landing — it has no `portal`.
    if (path === "/") {
      const loginByPortal: Record<Portal, string> = {
        rider: "/auth/rider/login",
        driver: "/auth/driver/login",
        admin: "/auth/admin/login",
        employer: "/auth/employer/login",
      };
      const url = request.nextUrl.clone();
      url.pathname = loginByPortal[portal];
      return NextResponse.redirect(url);
    }

    const owner = portalForPath(path);
    if (owner && owner !== portal) {
      // Path belongs to a different portal — bounce to that subdomain
      // on the same path so deep links like
      //   rider.rajlo.com/admin/safety/abc
      // become
      //   admin.rajlo.com/admin/safety/abc
      const url = new URL(request.url);
      const baseDomain = (host ?? "").replace(
        /^(rider|driver|admin|employer)\./i,
        "",
      );
      url.host = `${owner}.${baseDomain}`;
      // `url.host` keeps any :port suffix. In production Vercel handles
      // that; in dev it preserves the local port so cross-subdomain
      // redirects still work when testing.
      return NextResponse.redirect(url);
    }

    // Marketing pages (Help, Contact, About, …) live on the apex ONLY.
    // A subdomain should never serve them — so if the path isn't owned
    // by ANY portal, isn't a shared page (legal, support, trip-share,
    // auth helpers), and isn't an API/asset route, redirect it to
    // rajlo.com on the same path. This is the mirror image of the apex
    // rule below: apex bounces portal paths OUT to subdomains, and a
    // subdomain bounces marketing paths BACK to the apex. Result: a
    // "Help Center" link on driver.rajlo.com lands on rajlo.com/help,
    // not driver.rajlo.com/help.
    if (!owner) {
      const isSharedPath = SHARED_PATH_PREFIXES.some((p) =>
        path.startsWith(p),
      );
      const isApiPath = path === "/api" || path.startsWith("/api/");
      // Skip file-like paths (manifest.webmanifest, robots.txt, OG
      // images, etc.) — those are served per-host and must not be
      // cross-origin redirected (a cross-origin PWA manifest is rejected
      // by browsers). Anything with a dot in its final segment is a file.
      const looksLikeFile = (path.split("/").pop() ?? "").includes(".");
      if (!isSharedPath && !isApiPath && !looksLikeFile) {
        const baseDomain = (host ?? "").replace(
          /^(rider|driver|admin|employer)\./i,
          "",
        );
        const url = new URL(request.url);
        url.host = baseDomain; // the apex (rajlo.com)
        return NextResponse.redirect(url);
      }
    }
  } else if (isRajloApex(host)) {
    // rajlo.com (and www.) is the marketing site ONLY. Any portal path
    // — /rider/*, /driver/*, /admin/*, /auth/<portal>/* — belongs on
    // its own subdomain, so bounce it there. This is what makes a
    // "Book a ride" link (→ /rider/request) on the landing page land
    // on rider.rajlo.com, and keeps the apex purely marketing.
    const owner = portalForPath(path);
    if (owner) {
      const url = new URL(request.url);
      url.host = `${owner}.rajlo.com`;
      return NextResponse.redirect(url);
    }
  }

  // ─── 2. Auth + role gating ──────────────────────────────────────
  // (Unchanged from the prior path-only proxy.)
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminPage = path === "/admin" || path.startsWith("/admin/");
  const isAdminApi =
    path === "/api/admin" || path.startsWith("/api/admin/");
  // Portal path checks are BOUNDED — we match either the bare portal
  // path OR a subpath under it (with a trailing slash). The old
  // `startsWith("/driver")` match was too loose: it matched
  // `/driver-join`, `/driver-jobs-in/kingston`, and any future
  // /driver-* marketing route, then had to special-case each one back
  // out via an exact-string exclusion. A trailing slash on the URL
  // (or Next's request path with a query fragment) then broke that
  // exclusion and the marketing page got auth-gated → visitor bounced
  // to /auth/driver/login?next=/driver-join. This form has no such
  // ambiguity: /driver-anything can never match.
  const isDriverRoute = path === "/driver" || path.startsWith("/driver/");
  const isRiderRoute = path === "/rider" || path.startsWith("/rider/");
  const isEmployerRoute =
    path === "/employer" || path.startsWith("/employer/");
  const isProtectedPage =
    isAdminPage || isDriverRoute || isRiderRoute || isEmployerRoute;

  // Shared paths bypass auth entirely.
  if (SHARED_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }
  // Nothing to gate — public marketing pages, non-admin APIs, etc.
  if (!isProtectedPage && !isAdminApi) return response;

  /** JSON 403 for admin API calls (never an HTML redirect). */
  const apiForbidden = (error: string) =>
    new NextResponse(JSON.stringify({ error }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });

  if (!user) {
    // Admin API with no session → let the route's own auth return a
    // JSON 401 rather than redirecting an API client to an HTML page.
    if (isAdminApi) return response;
    // Anonymous-friendly rider pages (the booking page) render their
    // own in-page sign-in prompt instead of bouncing the visitor to a
    // login form. Let the request through and let the page handle it.
    if (isRiderRoute && ANONYMOUS_FRIENDLY_RIDER_PATHS.has(path)) {
      return response;
    }
    const loginPath = isAdminPage
      ? "/auth/admin/login"
      : isDriverRoute
        ? "/auth/driver/login"
        : isEmployerRoute
          ? "/auth/employer/login"
          : "/auth/rider/login";
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, admin_role, admin_suspended")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "rider";

  // Strict role separation. safety_officer counts as admin-tier for
  // the admin surface.
  const adminAllowed = role === "admin" || role === "safety_officer";

  // ─── Page-level role separation ───
  // Anonymous-friendly rider paths (currently just /rider/request)
  // ALSO bypass the wrong-role check — the booking page renders its
  // own AnonymousBookingPrompt overlay, which handles both "not signed
  // in" and "signed in with wrong role" by asking the visitor to sign
  // in / create a rider account before submitting. A driver who wants
  // to book a ride for themselves clicking "Book a ride" from the
  // marketing landing was hitting a dead-end 403 before this.
  const isAnonymousFriendly =
    isRiderRoute && ANONYMOUS_FRIENDLY_RIDER_PATHS.has(path);

  if (isProtectedPage && !isAnonymousFriendly) {
    if (
      (isAdminPage && !adminAllowed) ||
      (isDriverRoute && role !== "driver") ||
      (isRiderRoute && role !== "rider") ||
      (isEmployerRoute && role !== "employer")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/403";
      return NextResponse.redirect(url);
    }
  }

  // ─── RBAC permission gating — admin pages AND admin APIs ───
  // The single enforcement point: every admin surface is checked
  // against the caller's tier here, so legacy routes are covered
  // without per-route edits.
  if ((isAdminPage || isAdminApi) && adminAllowed) {
    // A suspended admin is locked out of the whole surface.
    if (profile?.admin_suspended) {
      if (isAdminApi) return apiForbidden("admin_suspended");
      const url = request.nextUrl.clone();
      url.pathname = "/403";
      return NextResponse.redirect(url);
    }
    const needed = requiredPermissionForAdminPath(path);
    if (
      needed &&
      !userHasPermission(role, asAdminRole(profile?.admin_role), needed)
    ) {
      if (isAdminApi) return apiForbidden("insufficient_permission");
      // Bounce a denied page to the dashboard (every tier may see it).
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Match everything except Next internals + obvious static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf)$).*)",
  ],
};
