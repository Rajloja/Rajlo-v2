"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * Mounted once at the root layout. While a user is signed into a portal
 * (/rider, /driver, /admin), it polls `/api/me/status` and — the moment
 * an admin deactivates their account mid-session — takes over the whole
 * screen with a clear "Account deactivated · contact support" panel.
 *
 * Why a poll instead of reacting to a failed request? Deactivation bans
 * the auth user, but a logged-in user's access token stays valid for up
 * to ~1h, so their requests keep succeeding and the ban is invisible —
 * they'd otherwise just get bounced to a login page with a confusing
 * "link expired" error. The status flag (`profiles.deactivated_at`) is
 * readable with that still-valid token, so we can surface the real
 * reason immediately.
 *
 * Checks fire on: mount, route change, tab focus/visibility, and a 30s
 * heartbeat — so an admin action lands within seconds, or instantly the
 * next time the user touches the app.
 */
const POLL_MS = 30_000;
const SUPPORT_EMAIL = "support@rajlo.com";

function inPortal(path: string): boolean {
  return (
    path.startsWith("/rider") ||
    path.startsWith("/driver") ||
    path.startsWith("/admin")
  );
}

export function DeactivatedGate() {
  const pathname = usePathname();
  const [deactivated, setDeactivated] = useState(false);

  const check = useCallback(async () => {
    const path =
      typeof window !== "undefined" ? window.location.pathname : pathname ?? "";
    if (!inPortal(path)) return;
    try {
      const res = await fetch("/api/me/status", { cache: "no-store" });
      if (!res.ok) return; // 401 etc. — the normal auth guard handles it
      const data = (await res.json()) as { signedIn?: boolean; active?: boolean };
      if (data.signedIn && data.active === false) setDeactivated(true);
    } catch {
      /* offline / transient — try again on the next tick */
    }
  }, [pathname]);

  useEffect(() => {
    if (deactivated) return; // frozen — no need to keep polling
    let alive = true;
    const run = () => {
      if (alive) void check();
    };
    // Defer the first check out of the effect body so we're not calling
    // setState synchronously during the effect.
    const first = window.setTimeout(run, 0);
    const id = window.setInterval(run, POLL_MS);
    const onFocus = run;
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check, deactivated]);

  const signOut = async () => {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      /* ignore — we redirect regardless */
    }
    window.location.href = "/auth/rider/login";
  };

  if (!deactivated) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-rajlo-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-rajlo-red">
            <Icon name="shield-check" className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-foreground">
            Your account has been deactivated
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Access to Rajlo has been suspended for this account. If you think
            this is a mistake, contact our support team and we&apos;ll take a
            look.
          </p>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              "Account deactivation — appeal",
            )}`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            <Icon name="mail" className="h-4 w-4" />
            Contact support
          </a>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-line bg-surface px-6 py-3 text-sm font-bold text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
