"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useFleetBroadcaster } from "@/lib/use-fleet";
import { Icon } from "./icons";

/**
 * Global driver presence. Mounted once at the (portal) layout level
 * so location streaming + the "location must stay on" guard run on
 * every driver route, not only the dashboard.
 *
 * Responsibilities:
 *   1. Fetch the driver's auth id + current online state on mount.
 *   2. Stay in sync with toggles done from any other component via
 *      the `rajlo:driver-online-changed` custom event (cheap, in-tab,
 *      no Realtime channel needed) — plus a re-fetch on every
 *      visibilitychange so a toggle made on another device or tab
 *      also propagates when the app returns to the foreground.
 *   3. Drive {@link useFleetBroadcaster} so the GPS stream + sticky
 *      Android notification stay alive on every driver page (Trip,
 *      Earnings, History, Me, Wallet, etc.), not just the dashboard.
 *   4. Silent location-permission monitor. While online, check every
 *      15 s + on every foreground that the OS hasn't quietly turned
 *      location off (from the Android quick-settings tile, for
 *      example). If it has, surface a non-dismissable modal directing
 *      the driver to re-enable it or go offline.
 *
 * No-op outside the driver portal (the layout already redirects
 * non-drivers away, but we double-check pathname so the component is
 * safe to import anywhere).
 */

const ONLINE_EVENT = "rajlo:driver-online-changed";
const PERMISSION_CHECK_INTERVAL_MS = 15_000;
const ROUTE_SESSION_REFRESH_MS = 30_000;
const ROUTE_SESSION_URL = "/api/driver/route-taxi/sessions/current";

/** Notify the global presence component that the driver toggled
 *  online from somewhere else (the dashboard toggle, a server
 *  response, etc.). The presence component reads the detail and
 *  updates its state without a Realtime hop. */
export function announceDriverOnlineChange(online: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ONLINE_EVENT, { detail: { online } }),
  );
}

export function DriverOnlinePresence() {
  const pathname = usePathname() ?? "";
  const onDriverPortal = pathname.startsWith("/driver");
  const [driverUserId, setDriverUserId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  const [going, setGoing] = useState<"offline" | null>(null);
  // Bumped whenever locationOff transitions true → false. Threaded into
  // useFleetBroadcaster's `rearmToken` so the underlying watchPosition
  // + realtime channel tear down and re-arm the moment location comes
  // back. Without this bump, a driver whose GPS died mid-trip (Android
  // quick-settings, WebView backgrounding, OS location toggle) stayed
  // silent to the rider's map even after they re-enabled location, and
  // the rider watched a frozen marker until the trip ended. The counter
  // itself isn't meaningful — any change to it triggers the re-arm.
  const [fleetRearmToken, setFleetRearmToken] = useState(0);
  const prevLocationOffRef = useRef(false);
  useEffect(() => {
    if (prevLocationOffRef.current && !locationOff) {
      setFleetRearmToken((t) => t + 1);
    }
    prevLocationOffRef.current = locationOff;
  }, [locationOff]);
  // True when the driver has an open route-taxi hailing session. While
  // this is true we remove the "Go offline" escape from the
  // location-off modal — the driver has riders mid-route relying on
  // their GPS, so the only acceptable resolution is to re-enable
  // location.
  const [hasRouteSession, setHasRouteSession] = useState(false);

  /* ─── Auth user id ─── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) setDriverUserId(user?.id ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ─── Online-state sync (server → component) ─── */
  useEffect(() => {
    if (!driverUserId) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch("/api/driver/stats");
        if (!res.ok) return;
        const json = (await res.json()) as {
          online?: { is?: boolean };
        };
        if (!cancelled) setOnline(!!json.online?.is);
      } catch {
        /* network blip — the next visibilitychange or event will retry */
      }
    };
    refresh();

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.online === "boolean") {
        setOnline(detail.online);
      }
    };
    window.addEventListener(ONLINE_EVENT, onChange);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener(ONLINE_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [driverUserId]);

  /* ─── Route-taxi session presence ───
   *
   * Polled alongside the location-permission probe so the modal
   * (rendered further down) can decide whether to offer "Go offline"
   * as an out. While a session is open, that escape is hidden and
   * the driver must re-enable location to dismiss.
   */
  useEffect(() => {
    if (!driverUserId || !onDriverPortal) {
      setHasRouteSession(false);
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch(ROUTE_SESSION_URL);
        if (!res.ok) return;
        const json = (await res.json()) as { session?: unknown };
        if (!cancelled) setHasRouteSession(!!json.session);
      } catch {
        /* silent — next tick or visibility flip will retry */
      }
    };

    void refresh();
    const timer = setInterval(refresh, ROUTE_SESSION_REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [driverUserId, onDriverPortal]);

  /* ─── Position broadcast — drives the foreground service on
       Android and the browser watch on the web. Runs across every
       driver page now, not only the dashboard. ─── */
  useFleetBroadcaster(
    driverUserId,
    online && onDriverPortal,
    fleetRearmToken,
  );

  /* ─── Silent location-permission monitor ─── */
  useEffect(() => {
    if (!online || !onDriverPortal) {
      setLocationOff(false);
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    let cancelled = false;
    let appStateUnsub: (() => void) | null = null;

    const probe = async () => {
      if (cancelled) return;
      let denied = false;
      // Permissions API is the cheap check.
      try {
        if ("permissions" in navigator) {
          const status = await (navigator.permissions as Permissions).query({
            name: "geolocation" as PermissionName,
          });
          if (status.state === "denied") denied = true;
        }
      } catch {
        /* Permissions API unavailable — fall through to the fix probe */
      }
      // On Android the Permissions API reports "granted" (the app
      // permission) even while the OS-level Location service is OFF —
      // the system-wide quick-settings toggle. The only reliable way
      // to detect that is to attempt a fresh fix and watch for
      // POSITION_UNAVAILABLE.
      //
      // `maximumAge: 0` is the critical fix here. The old value
      // (60_000) let the browser return a cached fix up to a minute
      // old — so if the driver turned location off while the app was
      // backgrounded, reopening the app within 60s would silently
      // accept the stale cached position and we'd never know location
      // had gone off. Forcing a fresh hardware fix turns that into a
      // PROPER POSITION_UNAVAILABLE error.
      if (!denied) {
        try {
          await new Promise<void>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              () => resolve(),
              (err) => reject(err),
              {
                enableHighAccuracy: false,
                maximumAge: 0,
                timeout: 7_000,
              },
            );
          });
        } catch (err) {
          const code = (err as GeolocationPositionError | null)?.code;
          // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE.
          // Timeouts (3) are transient and we don't treat them as off
          // — a real off-state returns code 2 quickly on Android.
          if (code === 1 || code === 2) denied = true;
        }
      }
      if (!cancelled) setLocationOff(denied);
    };

    void probe();
    const timer = setInterval(probe, PERMISSION_CHECK_INTERVAL_MS);

    // Browser-level visibility flip (works on the web + most native
    // WebViews). Re-probes the moment the driver returns to the app.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void probe();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Native Capacitor: the app's `appStateChange` listener fires
    // reliably on Android when the user comes back from Settings,
    // the quick-settings tray, or any other system surface — more
    // reliable than the WebView's visibilitychange on some Android
    // builds. The dynamic import keeps @capacitor/app out of the
    // web bundle.
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", (state) => {
          if (state.isActive) void probe();
        });
        if (cancelled) {
          void handle.remove();
        } else {
          appStateUnsub = () => void handle.remove();
        }
      } catch {
        /* not in a Capacitor context — no-op */
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (appStateUnsub) appStateUnsub();
    };
  }, [online, onDriverPortal]);

  const handleGoOffline = async () => {
    setGoing("offline");
    try {
      const res = await fetch("/api/driver/online", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: false }),
      });
      if (res.ok) {
        setOnline(false);
        announceDriverOnlineChange(false);
        setLocationOff(false);
      }
    } catch {
      /* user can retry */
    } finally {
      setGoing(null);
    }
  };

  const handleRecheck = async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(err),
          { enableHighAccuracy: false, maximumAge: 0, timeout: 5_000 },
        );
      });
      setLocationOff(false);
    } catch {
      /* still off — modal stays */
    }
  };

  return (
    <AnimatePresence>
      {locationOff && onDriverPortal && (
        <m.div
          key="location-off"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-off-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        >
          <m.div
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="bg-rajlo-red px-5 py-5 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                  <Icon name="map-pin" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                    Location off
                  </p>
                  <h2
                    id="location-off-title"
                    className="text-xl font-extrabold leading-tight"
                  >
                    Turn location back on
                  </h2>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/90">
                {hasRouteSession ? (
                  <>
                    You have an <strong>active Route Taxi session</strong>{" "}
                    — riders on your route are relying on your live
                    position. Location must stay on until you end the
                    session.
                  </>
                ) : (
                  <>
                    You&apos;re still set to <strong>online</strong>, but
                    your phone&apos;s location is off — riders can&apos;t
                    see you and we can&apos;t dispatch trips. Re-enable
                    location to keep taking rides, or drop offline for
                    now.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-3 px-5 py-5 text-sm">
              <ol className="list-decimal space-y-1.5 pl-5 text-foreground/85">
                <li>
                  Open your phone&apos;s <strong>Settings</strong> →{" "}
                  <strong>Location</strong> and turn it on.
                </li>
                <li>
                  Or pull down from the top of the screen and tap the{" "}
                  <strong>Location</strong> tile to enable it.
                </li>
                <li>
                  Come back here and tap <strong>Try again</strong>.
                </li>
              </ol>
            </div>

            <div className="flex flex-col gap-2 border-t border-line bg-surface-soft px-5 py-4 sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleRecheck}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              >
                <Icon name="navigation" className="h-4 w-4" />
                Try again
              </button>
              {/* "Go offline" intentionally hidden when a route-taxi
                 session is open — turning location off (and dropping
                 offline) mid-route would strand the riders who hailed
                 onto that route. Driver has to end the session first
                 from the Route Taxi page, then this modal will offer
                 the escape again. */}
              {!hasRouteSession && (
                <button
                  type="button"
                  onClick={handleGoOffline}
                  disabled={going === "offline"}
                  className="rounded-full px-6 py-3 text-sm font-semibold text-muted hover:text-foreground disabled:opacity-60 sm:flex-none"
                >
                  {going === "offline" ? "Going offline…" : "Go offline"}
                </button>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
