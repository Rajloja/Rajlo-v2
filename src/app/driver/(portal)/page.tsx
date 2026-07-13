"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import { DriverReadinessGate } from "@/components/driver-readiness-gate";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatJMD } from "@/lib/jamaica";
import { announceDriverOnlineChange } from "@/components/driver-online-presence";
import { useWakeLock } from "@/lib/use-wake-lock";
import { useT } from "@/lib/i18n";
import {
  HeroSkeleton,
  RideCardSkeleton,
  Skeleton,
} from "@/components/skeleton";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

const STATS_URL = "/api/driver/stats";
const COMPLIANCE_URL = "/api/driver/compliance";
const ACTIVE_URL = "/api/driver/rides/active";
const INBOX_URL = "/api/driver/inbox";
const PROFILE_URL = "/api/me/profile";

/**
 * Driver dashboard — single-page command surface.
 *
 * Sections, top → bottom:
 *   1. Hero: name + online toggle + this-week earnings + brand bloom
 *   2. Active-trip banner (if any) — bypasses the inbox while on a trip
 *   3. Stat tiles (4): today, this-week-vs-last, acceptance, rating
 *   4. 7-day earnings chart (vertical bars, brand-themed)
 *   5. Compliance health card (real `/api/driver/compliance`)
 *   6. Live inbox of incoming ride requests (Realtime-driven)
 *   7. Quick actions (verification, history, earnings, profile)
 *
 * Every number is real. The mock `compliance-utils` payload that used
 * to seed the page is gone — we render a skeleton until the real
 * stats land instead.
 */

type RidePlace = { name: string; address: string; parish: string | null };

type InboxSolo = {
  kind: "solo";
  id: string;
  pickup: RidePlace;
  dropoff: RidePlace;
  stopsCount: number;
  seats: number;
  notes: string | null;
  estimatedFareJMD: number;
  estimatedDistanceKm: number | null;
  estimatedEtaMinutes: number | null;
  requestedAt: string;
};

type InboxCarpool = {
  kind: "carpool";
  id: string;
  groupId: string;
  rideIds: string[];
  primary: {
    rideId: string;
    pickup: RidePlace;
    dropoff: RidePlace;
    seats: number;
    fareJMD: number;
  };
  secondary: {
    rideId: string;
    pickup: RidePlace;
    dropoff: RidePlace;
    seats: number;
    fareJMD: number;
  };
  totalSeats: number;
  combinedFareJMD: number;
  requestedAt: string;
};

type InboxEntry = InboxSolo | InboxCarpool;

type Stats = {
  earnings: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastWeek: number;
  };
  tripCounts: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastWeek: number;
  };
  weekChangePct: number | null;
  tripsChangePct: number | null;
  dailySeries: Array<{ label: string; spendJMD: number; trips: number }>;
  acceptanceRate: number | null;
  rating: { average: number | null; count: number };
  online: { is: boolean; since: string | null };
  driverSince: string;
};

type Compliance = {
  expired: number;
  urgent: number;
  upcoming: number;
};

export default function DriverHomePage() {
  const router = useRouter();
  const { t } = useT();
  // Seed every section from the bottom-nav's prefetch cache so the
  // dashboard lands fully painted on first frame: the hero shows the
  // real name + correct online state, the stat tiles + 7-day chart
  // skip their skeletons, compliance + inbox + active-trip banner
  // render immediately. The background re-fetches below + the
  // Supabase Realtime channels keep everything live; the user just
  // doesn't see the "loading → toggle flips on" transition any more.
  const cachedStats = getCachedDriverData<Stats>(STATS_URL);
  const cachedProfile = getCachedDriverData<{
    profile: { fullName: string | null };
  }>(PROFILE_URL);
  const cachedCompliance = getCachedDriverData<{ summary?: Compliance }>(
    COMPLIANCE_URL,
  );
  const cachedActive = getCachedDriverData<{ ride: { id: string } | null }>(
    ACTIVE_URL,
  );
  const cachedInbox = getCachedDriverData<{ rides?: InboxEntry[] }>(INBOX_URL);

  const [firstName, setFirstName] = React.useState<string | null>(
    cachedProfile?.profile.fullName?.split(" ")[0] ?? null,
  );
  const [stats, setStats] = React.useState<Stats | null>(cachedStats ?? null);
  const [statsError, setStatsError] = React.useState<string | null>(null);
  const [compliance, setCompliance] = React.useState<Compliance | null>(
    cachedCompliance?.summary ?? null,
  );
  const [online, setOnlineState] = React.useState<boolean | null>(
    cachedStats?.online.is ?? null,
  );
  const [onlineSyncing, setOnlineSyncing] = React.useState(false);
  const [inboxRides, setInboxRides] = React.useState<InboxEntry[]>(
    cachedInbox?.rides ?? [],
  );
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [accepting, setAccepting] = React.useState<string | null>(null);
  const [driverUserId, setDriverUserId] = React.useState<string | null>(null);
  const [hasActiveTrip, setHasActiveTrip] = React.useState(
    !!cachedActive?.ride,
  );
  const [bootstrapping, setBootstrapping] = React.useState(
    cachedActive == null,
  );

  /* ─── Shared "now" ticker for the inbox ───
   *
   * Each InboxCard used to spin its own setInterval just to refresh
   * its "X mins ago" label every 30s. With 10 incoming rides on a
   * busy driver's screen, that's 10 independent timers waking up
   * every 30s and triggering 10 re-renders. One parent-level timer
   * fans out via prop instead, and we only run it at all while the
   * inbox actually has rows. */
  const inboxHasRows = inboxRides.length > 0;
  const [nowForInbox, setNowForInbox] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!inboxHasRows) return;
    // Tick once immediately so cards landing from cache get fresh
    // labels without waiting up to 30s for the first interval fire.
    setNowForInbox(Date.now());
    const id = setInterval(() => setNowForInbox(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [inboxHasRows]);

  /* ─── Auth user id (for fleet broadcaster) ─── */
  React.useEffect(() => {
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

  /* ─── First name from profiles ─── */
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(PROFILE_URL);
        if (!res.ok) return;
        const json = (await res.json()) as {
          profile: { fullName: string | null };
        };
        if (mounted) {
          setFirstName(json.profile.fullName?.split(" ")[0] ?? null);
          setCachedDriverData(PROFILE_URL, json);
        }
      } catch {
        /* fine — header still reads */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ─── Stats (the real one — replaces all mock data) ─── */
  const refreshStats = React.useCallback(async () => {
    try {
      const res = await fetch(STATS_URL);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as Stats;
      setStats(json);
      setOnlineState(json.online.is);
      setStatsError(null);
      setCachedDriverData(STATS_URL, json);
    } catch (e) {
      setStatsError(
        e instanceof Error ? e.message : "Couldn't load your stats.",
      );
    }
  }, []);

  React.useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  /* ─── Compliance (real, via the auth-aware endpoint) ─── */
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(COMPLIANCE_URL);
        if (!res.ok) return;
        const json = (await res.json()) as { summary?: Compliance };
        if (mounted) {
          if (json.summary) setCompliance(json.summary);
          setCachedDriverData(COMPLIANCE_URL, json);
        }
      } catch {
        /* silent — section just won't render */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ─── Active trip detection ─── */
  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(ACTIVE_URL);
        if (!res.ok) return;
        const json = (await res.json()) as { ride: { id: string } | null };
        if (!cancelled) {
          setHasActiveTrip(!!json.ride);
          setCachedDriverData(ACTIVE_URL, json);
        }
      } catch {
        /* network blip */
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };
    check();

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("driver-active-presence")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => {
          if (!cancelled) {
            check();
            void refreshStats();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [refreshStats]);

  /* ─── Online toggle persistence ─── */
  const [onlineError, setOnlineError] = React.useState<string | null>(null);

  /* ─── Silent location warm-up ───
   *
   * Fire a cheap getCurrentPosition() on portal mount so the position
   * is cached when the driver taps the Go-online toggle. The toggle's
   * checkLocationReady() call accepts a cached fix up to 60 s old via
   * `maximumAge: 60_000`, so warming here + tapping within a minute
   * means the tap resolves in <100 ms instead of the 1–6 s cold-fix
   * delay that Raj flagged. Only warms when geolocation permission is
   * already GRANTED — we deliberately never trigger the OS permission
   * prompt without a user gesture (that reads as "app is spying on
   * me the second I open it," which kills trust). Best-effort: any
   * failure is silently swallowed, the toggle path handles the real
   * check.
   */
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if ("permissions" in navigator) {
          const status = await (navigator.permissions as Permissions).query({
            name: "geolocation" as PermissionName,
          });
          if (status.state !== "granted") return;
        } else {
          // No Permissions API — safer to skip warm-up than risk a
          // spontaneous permission prompt. iOS Safari older versions
          // fall here.
          return;
        }
        if (cancelled) return;
        // Fire-and-forget. The success/error callbacks are no-ops;
        // the mere act of calling getCurrentPosition primes the OS's
        // internal position cache that checkLocationReady() will read
        // on the driver's tap.
        navigator.geolocation.getCurrentPosition(
          () => undefined,
          () => undefined,
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 6_000 },
        );
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Quick pre-flight: does the browser/OS have location enabled?
   *  If not we can't dispatch trips to this driver — the rider's map
   *  would show a frozen marker the moment a hail came in. We refuse
   *  the online flip and tell them to fix it. Returns true if OK. */
  const checkLocationReady = React.useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setOnlineError(
        "Your browser doesn't support location. Use Chrome or Safari and try again.",
      );
      return false;
    }
    // Permissions API: explicit denied → refuse. We still try a fix
    // afterward because some Android WebViews say "granted" while the
    // OS-level location service is off — only an actual fix attempt
    // reveals that.
    try {
      if ("permissions" in navigator) {
        const status = await (navigator.permissions as Permissions).query({
          name: "geolocation" as PermissionName,
        });
        if (status.state === "denied") {
          setOnlineError(
            "Location is blocked. Enable it in your phone's Settings → Apps → Rajlo Driver → Permissions → Location, then try again.",
          );
          return false;
        }
      }
    } catch {
      /* Permissions API unavailable — fall through */
    }
    // Try a fix with a tight timeout. PERMISSION_DENIED or
    // POSITION_UNAVAILABLE → off.
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(err),
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 6_000 },
        );
      });
      return true;
    } catch (err) {
      const code = (err as GeolocationPositionError | null)?.code;
      if (code === 1) {
        setOnlineError("Allow location access for Rajlo, then try again.");
      } else if (code === 2) {
        setOnlineError(
          "Turn on your phone's location service in your settings, then try again.",
        );
      } else {
        setOnlineError(
          "Couldn't read your location. Move outside or to a window and try again.",
        );
      }
      return false;
    }
  }, []);

  const setOnline = React.useCallback(
    async (next: boolean) => {
      if (online === next || onlineSyncing) return;
      // Set the syncing flag FIRST so the toggle shows its spinner
      // the instant the driver taps. Previously the flag was set AFTER
      // `checkLocationReady()` returned — which awaits a fresh GPS fix
      // up to 6 seconds. During that window the toggle sat motionless
      // with zero visual feedback, so a driver on a cold GPS start
      // (first tap after opening the app) saw "nothing happened" for
      // several seconds and often tapped again, which the guard on
      // the first line quietly ignored. Setting `onlineSyncing` up
      // front means: (a) the spinner fires immediately, (b) the same
      // guard now bounces the re-tap correctly, and (c) if location
      // fails we still tear it back down in `finally`.
      setOnlineSyncing(true);
      setOnlineError(null);
      // Going online: require location to be live first. Going
      // offline doesn't need this check (a driver should always be
      // able to drop offline regardless of location state).
      if (next) {
        const ok = await checkLocationReady();
        if (!ok) {
          setOnlineSyncing(false);
          return;
        }
      }
      const prev = online;
      setOnlineState(next);
      try {
        const res = await fetch("/api/driver/online", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ online: next }),
        });
        if (!res.ok) {
          // Surface the server's reason — particularly the 412
          // "push_required" gate so a driver who got past a stale
          // readiness UI still understands what's missing.
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
            error?: string;
          };
          throw new Error(
            body.message ??
              body.error ??
              `Couldn't go ${next ? "online" : "offline"}.`,
          );
        }
        // Notify the global <DriverOnlinePresence /> so it can start
        // (or stop) the foreground location stream + permission
        // monitor without waiting on a stats refresh roundtrip.
        announceDriverOnlineChange(next);
      } catch (e) {
        setOnlineState(prev);
        setOnlineError(
          e instanceof Error ? e.message : "Couldn't update online status.",
        );
      } finally {
        setOnlineSyncing(false);
      }
    },
    [online, onlineSyncing, checkLocationReady],
  );

  /* ─── Auto-offline on location revoke ───
   *
   * Once online, watch for the user disabling location at the OS
   * level. If permission flips to "denied" mid-session AND we're
   * NOT mid-trip, drop them offline immediately so they don't keep
   * receiving ride pings they can't fulfil.
   *
   * Critical: skip the auto-offline entirely if `hasActiveTrip` is
   * true. The driver in full-screen navigation on Android can trigger
   * a spurious Permissions API "denied" event during WebView state
   * changes / quick-settings interactions / background suspension —
   * yanking the driver offline mid-trip strands the rider, freezes
   * the live map, and forces support to scramble. `/api/driver/online`
   * already refuses to flip offline during an active trip (returns
   * 409), so a call here would fail server-side anyway — but the
   * client's optimistic setOnlineState(false) still flashes the
   * toggle to OFF for the duration of the round-trip. Bypassing the
   * whole branch means the toggle never moves at all.
   *
   * <DriverOnlinePresence> already surfaces a location-off modal in
   * this case, so the driver is still informed and prompted to fix
   * the permission — we just don't touch the online flag. */
  React.useEffect(() => {
    if (online !== true) return;
    if (typeof navigator === "undefined" || !("permissions" in navigator))
      return;
    let cancelled = false;
    let permStatus: PermissionStatus | null = null;
    const onChange = () => {
      if (!permStatus || cancelled) return;
      if (permStatus.state !== "denied") return;
      if (hasActiveTrip) {
        // Mid-trip permission flicker (Android quick-settings, full-
        // screen nav mode, WebView state change). Surface the message
        // so the driver knows to re-enable location, but DO NOT touch
        // the online toggle — the trip must keep going.
        setOnlineError(
          "Location was turned off — please re-enable it to keep your rider's live map working. You'll stay online for this trip.",
        );
        return;
      }
      setOnlineError(
        "Location was turned off — you've been taken offline. Re-enable location, then go online again.",
      );
      void setOnline(false);
    };
    void (navigator.permissions as Permissions)
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permStatus = status;
        status.addEventListener("change", onChange);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
      permStatus?.removeEventListener("change", onChange);
    };
  }, [online, setOnline, hasActiveTrip]);

  // Fleet broadcasting now lives in <DriverOnlinePresence /> mounted
  // at the portal layout so the GPS stream stays alive across every
  // driver page, not only the dashboard. The component drives
  // useFleetBroadcaster itself.

  /* ─── Wake lock while online ─── */
  // Keep the screen on whenever the driver is online so the
  // browser doesn't sleep the JS engine and stall GPS broadcasts.
  // Honest limitation: this only helps while the Rajlo tab is
  // foreground — once the user switches apps or locks their phone
  // the OS still gates timers. The `backgrounded` flag below
  // surfaces that state so we can warn the driver.
  const wake = useWakeLock(online === true);

  /* ─── Live inbox ─── */
  React.useEffect(() => {
    if (!online || hasActiveTrip) {
      setInboxRides([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(INBOX_URL);
        if (res.ok && !cancelled) {
          const json = (await res.json()) as { rides: InboxEntry[] };
          // Carpool was retired from the driver UI. Filter any carpool
          // entries out at the choke-point so the inbox card never
          // tries to render the carpool branch downstream.
          const soloOnly = (json.rides ?? []).filter(
            (e) => e.kind !== "carpool",
          );
          setInboxRides(soloOnly);
          setCachedDriverData(INBOX_URL, { ...json, rides: soloOnly });
        }
      } catch {
        /* Realtime will retry */
      }
    };
    refresh();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("driver-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [online, hasActiveTrip]);

  /* ─── Accept handler ─── */
  const handleAccept = async (rideId: string) => {
    setAccepting(rideId);
    setAcceptError(null);
    try {
      const res = await fetch(`/api/driver/rides/${rideId}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Server returned ${res.status}`);
      }
      router.push("/driver/active-trip");
    } catch (e) {
      setAcceptError(
        e instanceof Error ? e.message : "Couldn't accept ride. Try again.",
      );
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* HERO — wrapped in the readiness gate so an un-installed /
         un-subscribed driver sees the install + push-permission
         walkthrough INSTEAD of the online toggle. Once both
         requirements are met, the gate transparently renders the
         original hero (children) below. */}
      <FadeUp>
        <DriverReadinessGate>
          <div
            className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-2xl md:p-8 ${
              online
                ? "bg-linear-to-br from-emerald-700 via-rajlo-black to-rajlo-black shadow-emerald-700/30"
                : "bg-linear-to-br from-rajlo-black via-rajlo-black to-[#1a1d10] shadow-rajlo-black/30"
            }`}
          >
            <ArcWatermark
              size={420}
              variant="red"
              className="absolute -right-20 -bottom-32 opacity-[0.18]"
            />
            <div className="relative space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    {t("driver.dashboard.eyebrow", "Driver dashboard")}
                  </p>
                  <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
                    {online === null ? (
                      <Skeleton
                        variant="dark"
                        className="h-9 w-64 max-w-full"
                        rounded="lg"
                      />
                    ) : online ? (
                      t(
                        "driver.dashboard.greeting",
                        `Hi ${firstName ?? "there"}, you're live.`,
                      ).replace("{name}", firstName ?? "there")
                    ) : (
                      t(
                        "driver.dashboard.greetingOff",
                        `Hi ${firstName ?? "there"}.`,
                      ).replace("{name}", firstName ?? "there")
                    )}
                  </h1>
                  {online === null ? (
                    <Skeleton
                      variant="dark"
                      className="mt-2 h-3 w-56 max-w-full"
                      rounded="md"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-white/75">
                      {online
                        ? t(
                            "driver.dashboard.subtitle",
                            "Incoming ride requests show up below.",
                          )
                        : t(
                            "driver.dashboard.subtitleOff",
                            "Toggle online when you're ready to take rides.",
                          )}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => online !== null && setOnline(!online)}
                  disabled={online === null || onlineSyncing}
                  aria-pressed={online === true}
                  aria-label={online ? "Go offline" : "Go online"}
                  className={`relative inline-flex h-11 w-20 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    online ? "bg-emerald-500" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`inline-flex h-9 w-9 transform items-center justify-center rounded-full bg-white shadow-lg transition-all ${
                      online ? "translate-x-10" : "translate-x-1"
                    }`}
                  >
                    {onlineSyncing ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                    ) : (
                      <Icon
                        name={online ? "check-circle" : "x"}
                        className={`h-4 w-4 ${
                          online ? "text-emerald-600" : "text-muted"
                        }`}
                      />
                    )}
                  </span>
                </button>
              </div>

              {/* Inline mini-stat strip — at-a-glance "how am I doing today" */}
              {stats ? (
                <div className="grid grid-cols-3 gap-2 border-t border-white/15 pt-5 sm:gap-4">
                  <HeroStat
                    label={t("driver.dashboard.thisWeek", "This week")}
                    value={formatJMD(stats.earnings.thisWeek)}
                    caption={t(
                      "driver.dashboard.trips",
                      `${stats.tripCounts.thisWeek} trip${
                        stats.tripCounts.thisWeek === 1 ? "" : "s"
                      }`,
                    ).replace("{n}", String(stats.tripCounts.thisWeek))}
                  />
                  <HeroStat
                    label={t("driver.dashboard.today", "Today")}
                    value={formatJMD(stats.earnings.today)}
                    caption={t(
                      "driver.dashboard.trips",
                      `${stats.tripCounts.today} trip${
                        stats.tripCounts.today === 1 ? "" : "s"
                      }`,
                    ).replace("{n}", String(stats.tripCounts.today))}
                  />
                  <HeroStat
                    label={t("driver.dashboard.rating", "Rating")}
                    value={
                      stats.rating.average !== null
                        ? stats.rating.average.toFixed(1)
                        : "—"
                    }
                    caption={
                      stats.rating.count > 0
                        ? `${stats.rating.count} rating${
                            stats.rating.count === 1 ? "" : "s"
                          }`
                        : t("driver.dashboard.noRatings", "No ratings yet")
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 border-t border-white/15 pt-5">
                  {[0, 1, 2].map((i) => (
                    <Skeleton
                      key={i}
                      className="h-14 w-full"
                      rounded="xl"
                      variant="dark"
                    />
                  ))}
                </div>
              )}

              {/* Online time / since when */}
              {online && stats?.online.since && (
                <p className="text-[11px] font-semibold text-emerald-200">
                  Online since{" "}
                  {new Date(stats.online.since).toLocaleTimeString("en-JM", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>
        </DriverReadinessGate>
      </FadeUp>

      {/* Surface server-side rejections from the online toggle (e.g.
          412 push_required). Lives just below the hero so it's the
          first thing a driver sees if their flip didn't take. */}
      {onlineError && (
        <FadeUp delay={0.04}>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <p className="font-bold">Couldn&apos;t go online</p>
            <p className="mt-1">{onlineError}</p>
          </div>
        </FadeUp>
      )}

      {/* Backgrounded-while-online warning. Browsers stop running
          JavaScript timers when the tab is fully hidden or the screen
          locks — there is no web equivalent of native background GPS.
          We can't prevent this, but we can be explicit so drivers
          don't think the app is silently working when it isn't. */}
      {online && wake.backgrounded && (
        <FadeUp delay={0.04}>
          <div className="rounded-2xl border border-rajlo-red/40 bg-primary-soft px-4 py-3 text-xs leading-relaxed text-rajlo-black">
            <p className="font-bold text-rajlo-red">
              Rajlo is in the background
            </p>
            <p className="mt-1">
              Riders&apos; hails won&apos;t reach you while another app is on
              top or your screen is locked. Bring Rajlo back to the front to
              keep accepting work.
            </p>
          </div>
        </FadeUp>
      )}

      {/* Wake-lock unsupported notice — Firefox Android and very old
          browsers fall through here. Most drivers will be on Chrome
          or Safari which support it. */}
      {online && !wake.supported && (
        <FadeUp delay={0.04}>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <p className="font-bold">
              Heads-up: this browser can&apos;t keep the screen awake
            </p>
            <p className="mt-1">
              Your phone may dim and lock on its own, which stops Rajlo from
              listening. For best results use Chrome (Android) or Safari (iOS —
              installed from the home screen).
            </p>
          </div>
        </FadeUp>
      )}

      {/* GPS / fleet failures now surface through the global
         DriverOnlinePresence modal — no inline warning needed here. */}

      {statsError && (
        <FadeUp delay={0.04}>
          <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-xs font-semibold text-rajlo-red">
            {statsError}
          </div>
        </FadeUp>
      )}

      {/* ACTIVE TRIP BANNER */}
      {!bootstrapping && hasActiveTrip && (
        <FadeUp delay={0.05}>
          <Link
            href="/driver/active-trip"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white shadow-md">
                <Icon name="navigation" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold tracking-tight text-emerald-900">
                  You have an active trip
                </p>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Tap to open the navigation console.
                </p>
              </div>
            </div>
            <Icon
              name="arrow-right"
              className="h-5 w-5 text-emerald-700 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </FadeUp>
      )}

      {/* INBOX — sits right under the online toggle so the live
          ride requests are the first thing a driver sees after going
          online. Analytics (stat grid, earnings chart, compliance)
          live below since they're scan-when-you-have-time, not
          act-on-now signals. */}
      <FadeUp delay={0.06}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                <Icon name="inbox" className="h-3.5 w-3.5" />
              </span>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Live ride requests
              </p>
            </div>
            <span className="text-[11px] font-semibold text-muted">
              {hasActiveTrip
                ? "On a trip"
                : online
                ? `${inboxRides.length} waiting`
                : "Offline"}
            </span>
          </div>

          {acceptError && (
            <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-xs font-semibold text-rajlo-red">
              {acceptError}
            </div>
          )}

          {online === null || bootstrapping ? (
            <RideCardSkeleton />
          ) : hasActiveTrip ? (
            <EmptyInbox
              icon="navigation"
              title="You're already on a trip"
              body="Finish your current trip first — we'll route new requests to you when you're free."
              ctaLabel="Open active trip"
              ctaHref="/driver/active-trip"
            />
          ) : !online ? (
            <EmptyInbox
              icon="x"
              title="You're offline"
              body="Toggle online above to start receiving ride requests."
            />
          ) : inboxRides.length === 0 ? (
            <EmptyInbox
              icon="inbox"
              title="No requests yet"
              body="Stay online — incoming rides will pop up here automatically."
            />
          ) : (
            <ul className="space-y-3">
              {inboxRides.map((r) => (
                <li key={r.id}>
                  <InboxCard
                    entry={r}
                    onAccept={() => handleAccept(r.id)}
                    accepting={accepting === r.id}
                    now={nowForInbox}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </FadeUp>

      {/* 4-TILE STAT GRID (richer than the hero strip) */}
      <FadeUp delay={0.08}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            eyebrow="This week"
            value={stats ? formatJMD(stats.earnings.thisWeek) : "—"}
            caption={
              stats
                ? `${stats.tripCounts.thisWeek} trip${
                    stats.tripCounts.thisWeek === 1 ? "" : "s"
                  }`
                : ""
            }
            changePct={stats?.weekChangePct ?? null}
            icon="trending-up"
          />
          <StatTile
            eyebrow="This month"
            value={stats ? formatJMD(stats.earnings.thisMonth) : "—"}
            caption={
              stats
                ? `${stats.tripCounts.thisMonth} trip${
                    stats.tripCounts.thisMonth === 1 ? "" : "s"
                  }`
                : ""
            }
            icon="calculator"
          />
          <StatTile
            eyebrow="Acceptance · 30d"
            value={
              stats?.acceptanceRate !== null &&
              stats?.acceptanceRate !== undefined
                ? `${stats.acceptanceRate}%`
                : "—"
            }
            caption="Trips accepted vs cancelled"
            icon="check-circle"
            valueClass={
              stats?.acceptanceRate !== null &&
              stats?.acceptanceRate !== undefined &&
              stats.acceptanceRate < 70
                ? "text-amber-600"
                : "text-foreground"
            }
          />
          <StatTile
            eyebrow="Driver rating"
            value={
              stats?.rating.average !== null &&
              stats?.rating.average !== undefined
                ? stats.rating.average.toFixed(1)
                : "—"
            }
            caption={
              stats?.rating.count
                ? `${stats.rating.count} review${
                    stats.rating.count === 1 ? "" : "s"
                  }`
                : "No ratings yet"
            }
            icon="star"
          />
        </div>
      </FadeUp>

      {/* 7-DAY EARNINGS CHART */}
      {stats && (
        <FadeUp delay={0.12}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                  Last 7 days
                </p>
                <p className="mt-1 text-sm font-bold">Daily earnings</p>
              </div>
              <p className="text-[11px] text-muted">
                Bar height = JMD earned · today highlighted
              </p>
            </div>
            <DailyBars data={stats.dailySeries} />
          </div>
        </FadeUp>
      )}

      {/* COMPLIANCE HEALTH CARD */}
      {compliance && (
        <FadeUp delay={0.14}>
          <ComplianceCard summary={compliance} />
        </FadeUp>
      )}

      {/* QUICK ACTIONS */}
      <FadeUp delay={0.2}>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickActionTile
            icon="shield-check"
            label="TA verification"
            caption="Compliance, expiry timers, document uploads."
            href="/driver/verification"
          />
          <QuickActionTile
            icon="trending-up"
            label="Earnings"
            caption="Today, this week, monthly trend, and per-trip records."
            href="/driver/earnings"
          />
          <QuickActionTile
            icon="clock"
            label="Trip history"
            caption="Every completed and cancelled trip with rider ratings."
            href="/driver/history"
          />
          <QuickActionTile
            icon="star"
            label="My ratings"
            caption="Lifetime average, recent reviews, 5-star streak."
            href="/driver/ratings"
          />
        </div>
      </FadeUp>

      {bootstrapping && !stats && (
        <FadeUp>
          <HeroSkeleton />
        </FadeUp>
      )}
    </div>
  );
}

/* ─── Reusable bits ─── */

function HeroStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-extrabold tracking-tight md:text-lg">
        {value}
      </p>
      <p className="truncate text-[10px] text-white/65">{caption}</p>
    </div>
  );
}

function StatTile({
  eyebrow,
  value,
  caption,
  changePct,
  icon,
  valueClass = "text-foreground",
}: {
  eyebrow: string;
  value: string;
  caption: string;
  changePct?: number | null;
  icon: IconName;
  valueClass?: string;
}) {
  const arrow =
    changePct === null || changePct === undefined
      ? null
      : changePct === 0
      ? "—"
      : changePct > 0
      ? "▲"
      : "▼";
  const tone =
    changePct === null || changePct === undefined
      ? "bg-surface-soft text-muted"
      : changePct >= 0
      ? "bg-emerald-50 text-emerald-700"
      : "bg-primary-soft text-rajlo-red";

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          {eyebrow}
        </p>
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
          <Icon name={icon} className="h-3 w-3" />
        </span>
      </div>
      <p
        className={`mt-1.5 text-2xl font-extrabold tracking-tight ${valueClass}`}
      >
        {value}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        {caption && (
          <p className="truncate text-[11px] text-muted">{caption}</p>
        )}
        {arrow && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${tone}`}
          >
            {arrow} {Math.abs(changePct ?? 0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function DailyBars({
  data,
}: {
  data: Array<{ label: string; spendJMD: number; trips: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.spendJMD));
  const lastIdx = data.length - 1;
  return (
    <div
      className="flex items-end gap-1.5 sm:gap-2.5"
      role="img"
      aria-label="7-day earnings chart"
    >
      {data.map((d, i) => {
        const isLast = i === lastIdx;
        const heightPct = max > 0 ? Math.max(2, (d.spendJMD / max) * 100) : 2;
        return (
          <div
            key={d.label + i}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <div className="relative flex h-32 w-full items-end justify-center sm:h-40">
              <span
                className={`absolute -top-5 whitespace-nowrap text-[9px] font-bold transition-opacity ${
                  isLast
                    ? "text-rajlo-red opacity-100"
                    : "text-foreground opacity-0 group-hover:opacity-100"
                }`}
              >
                {d.spendJMD > 0 ? formatJMD(d.spendJMD) : ""}
              </span>
              <div
                className={`w-full rounded-t-lg transition-all duration-300 ${
                  isLast
                    ? "bg-rajlo-red shadow-md shadow-rajlo-red/30"
                    : d.spendJMD > 0
                    ? "bg-rajlo-black/85 group-hover:bg-rajlo-red"
                    : "bg-line"
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <p
              className={`truncate text-[10px] font-semibold ${
                isLast ? "text-rajlo-red" : "text-muted"
              }`}
            >
              {d.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ComplianceCard({ summary }: { summary: Compliance }) {
  const total = summary.expired + summary.urgent + summary.upcoming;
  const tone =
    summary.expired > 0
      ? "danger"
      : summary.urgent > 0
      ? "warning"
      : summary.upcoming > 0
      ? "info"
      : "good";

  const headline =
    tone === "danger"
      ? "Action needed — document expired"
      : tone === "warning"
      ? "Renewal due within 7 days"
      : tone === "info"
      ? "Renewals coming up"
      : "All compliance up to date";

  const palette = {
    danger: {
      bg: "bg-primary-soft",
      border: "border-rajlo-red/30",
      text: "text-rajlo-red",
    },
    warning: {
      bg: "bg-amber-50",
      border: "border-amber-300",
      text: "text-amber-800",
    },
    info: {
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      text: "text-emerald-800",
    },
    good: {
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      text: "text-emerald-800",
    },
  }[tone];

  return (
    <div className={`rounded-2xl border ${palette.border} ${palette.bg} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            TA compliance
          </p>
          <p
            className={`mt-1 text-base font-extrabold tracking-tight ${palette.text}`}
          >
            {headline}
          </p>
        </div>
        <Link
          href="/driver/verification"
          className="shrink-0 rounded-full bg-rajlo-black px-3 py-1.5 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Review
        </Link>
      </div>
      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
          {summary.expired > 0 && (
            <span className="text-rajlo-red">{summary.expired} expired</span>
          )}
          {summary.urgent > 0 && (
            <span className="text-amber-700">
              {summary.urgent} renew within 7 days
            </span>
          )}
          {summary.upcoming > 0 && (
            <span className="text-muted">
              {summary.upcoming} upcoming · ≤ 60 days
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyInbox({
  // `icon` kept for API back-compat with existing call sites — the
  // branded `EmptyState` always uses the Rajlo LogoIcon so this is
  // now decorative-only and ignored. We leave the prop in the
  // signature so we don't have to touch every call site.
  icon: _icon,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  icon: IconName;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <EmptyState
      title={title}
      body={body}
      cta={ctaLabel && ctaHref ? { label: ctaLabel, href: ctaHref } : undefined}
    />
  );
}

function QuickActionTile({
  icon,
  label,
  caption,
  href,
}: {
  icon: IconName;
  label: string;
  caption: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red/30 hover:shadow-md"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-rajlo-red transition-colors group-hover:bg-rajlo-red group-hover:text-white">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold tracking-tight">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{caption}</p>
      </div>
      <Icon
        name="chevron-right"
        className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rajlo-red"
      />
    </Link>
  );
}

/**
 * Inbox card — handles both solo rides and carpool pairs. Carpool
 * entries advertise both pickups + the combined fare so the driver
 * knows what they're committing to before tapping Accept.
 */
function InboxCard({
  entry,
  onAccept,
  accepting,
  now,
}: {
  entry: InboxEntry;
  onAccept: () => void;
  accepting: boolean;
  /** Shared "current time" tick from the parent — one interval at
   *  the list level fans out to every card, instead of N cards each
   *  spinning their own setInterval. */
  now: number;
}) {
  const fareJMD =
    entry.kind === "solo" ? entry.estimatedFareJMD : entry.combinedFareJMD;
  const seats = entry.kind === "solo" ? entry.seats : entry.totalSeats;
  const minutesAgo = Math.max(
    0,
    Math.round((now - new Date(entry.requestedAt).getTime()) / 60_000),
  );

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {entry.kind === "carpool" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                Carpool · 2 riders
              </span>
            )}
            <span className="text-[11px] font-semibold text-muted">
              {minutesAgo === 0 ? "Just now" : `${minutesAgo}m ago`}
            </span>
          </div>
          <p className="mt-2 text-base font-extrabold tracking-tight">
            {entry.kind === "solo"
              ? entry.pickup.name
              : entry.primary.pickup.name}{" "}
            <span className="text-muted">→</span>{" "}
            {entry.kind === "solo"
              ? entry.dropoff.name
              : entry.primary.dropoff.name}
          </p>
          {entry.kind === "carpool" && (
            <p className="mt-1 text-xs text-muted">
              Then: {entry.secondary.pickup.name} →{" "}
              {entry.secondary.dropoff.name}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold tracking-tight text-rajlo-red">
            {formatJMD(fareJMD)}
          </p>
          <p className="text-[11px] text-muted">
            {seats} seat{seats === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {entry.kind === "solo" &&
        (entry.estimatedDistanceKm !== null ||
          entry.estimatedEtaMinutes !== null ||
          entry.stopsCount > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            {entry.estimatedDistanceKm !== null && (
              <span className="flex items-center gap-1.5">
                <Icon name="map" className="h-3 w-3" />
                {entry.estimatedDistanceKm.toFixed(1)} km
              </span>
            )}
            {entry.estimatedEtaMinutes !== null && (
              <span className="flex items-center gap-1.5">
                <Icon name="clock" className="h-3 w-3" />~
                {entry.estimatedEtaMinutes} min
              </span>
            )}
            {entry.stopsCount > 0 && (
              <span className="flex items-center gap-1.5">
                <Icon name="map-pin" className="h-3 w-3" />
                {entry.stopsCount} extra stop
                {entry.stopsCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

      {entry.kind === "solo" && entry.notes && (
        <div className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-[11px] leading-relaxed text-foreground">
          <p className="font-bold text-rajlo-red">Note from rider</p>
          <p className="mt-0.5">{entry.notes}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onAccept}
        disabled={accepting}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
      >
        {accepting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Accepting…
          </>
        ) : (
          <>
            Accept ride
            <Icon name="arrow-right" className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
