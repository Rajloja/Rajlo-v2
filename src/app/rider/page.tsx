"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp, Stagger, StaggerItem } from "@/components/anim";
import { EmptyState } from "@/components/empty-state";
import {
  ListRowSkeleton,
  Skeleton,
  StatsGridSkeleton,
} from "@/components/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatJMD } from "@/lib/jamaica";
import { useT } from "@/lib/i18n";
import { RiderWeatherStrip } from "@/components/rider-weather-strip";

/**
 * Rider home / dashboard. All sections are backed by real endpoints —
 * no mock data. Three parallel fetches on mount:
 *
 *   /api/rider/rides/active   — current in-flight trip if any
 *   /api/rider/rides/history?limit=50&status=all
 *                             — drives recent trips, top destinations,
 *                               and the stats strip
 *   /api/rider/ratings        — rider's lifetime rating-given average
 *
 * The "Top destinations" section is computed client-side by grouping
 * history rows by dropoff_name and ranking by frequency. Riders with
 * zero history see an onboarding-style empty state instead.
 */

type ActiveRideMini = {
  id: string;
  status: "requested" | "accepted" | "arrived" | "in_progress";
  pickup: { name: string };
  dropoff: { name: string };
  estimatedEtaMinutes: number | null;
};

type ActiveDriverMini = {
  name: string;
  vehicle: string | null;
  plateNumber: string | null;
} | null;

type HistoryRow = {
  id: string;
  kind?: "private" | "route_taxi";
  status:
    | "requested"
    | "accepted"
    | "arrived"
    | "in_progress"
    | "completed"
    | "cancelled";
  pickup: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    placeId: string | null;
  };
  dropoff: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    placeId: string | null;
  };
  fareJMD: number;
  endedAt: string | null;
  driverName: string | null;
  myRatingStars: number | null;
  carpool: boolean;
};

type RatingSummary = {
  total: number;
  average: number | null;
};

export default function RiderDashboardPage() {
  const { t } = useT();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [activeTrip, setActiveTrip] = useState<{
    ride: ActiveRideMini;
    driver: ActiveDriverMini;
  } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // First name from profiles (separately from the rest because it
  // doesn't block the page — render "Hey there" while it loads).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      setFirstName(data?.full_name?.split(" ")[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Active trip + history + ratings — three parallel fetches. None
  // are individually required to render, so we degrade gracefully if
  // any one fails (the others still populate their respective
  // sections).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [activeRes, historyRes, ratingsRes] = await Promise.allSettled([
        fetch("/api/rider/rides/active"),
        // Was limit=50. The dashboard renders 3 recent rides + groups
        // by dropoff_name for top-4 destinations + scans for the first
        // unrated trip. 20 rows is plenty for all three (the 4th most
        // common dropoff almost always falls inside the most recent
        // 20 trips). Cuts payload + client-side reduce work ~60%.
        fetch("/api/rider/rides/history?status=all&limit=20"),
        fetch("/api/rider/ratings"),
      ]);
      if (cancelled) return;

      if (activeRes.status === "fulfilled" && activeRes.value.ok) {
        const j = (await activeRes.value.json()) as {
          ride: ActiveRideMini | null;
          driver: ActiveDriverMini;
        };
        if (j.ride) setActiveTrip({ ride: j.ride, driver: j.driver });
      }
      if (historyRes.status === "fulfilled" && historyRes.value.ok) {
        const j = (await historyRes.value.json()) as { rides: HistoryRow[] };
        setHistory(j.rides ?? []);
      }
      if (ratingsRes.status === "fulfilled" && ratingsRes.value.ok) {
        const j = (await ratingsRes.value.json()) as { summary: RatingSummary };
        setRatingSummary(j.summary);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Derived: top destinations from history ───
   *
   * Group completed trips by dropoff_name (case-folded), rank by
   * frequency, take the top 4. For each, average the actual fares
   * paid so the "from JMD X" hint reflects what the rider has
   * historically paid for that destination — not a guess.
   */
  const topDestinations = useMemo(() => {
    if (history.length === 0) return [];
    type Bucket = {
      label: string;
      address: string;
      lat: number;
      lng: number;
      placeId: string | null;
      count: number;
      totalFare: number;
    };
    const buckets = new Map<string, Bucket>();
    for (const r of history) {
      if (r.status !== "completed") continue;
      const key = r.dropoff.name.trim().toLowerCase();
      if (!key) continue;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalFare += r.fareJMD;
      } else {
        // Capture the dropoff coordinates from the most recent trip to
        // this destination — history is ordered newest-first, so the
        // first time we see a key is the freshest record. That makes
        // the deep-link to /rider/request lat/lng-accurate even if the
        // place's name moved between visits.
        buckets.set(key, {
          label: r.dropoff.name,
          address: r.dropoff.address,
          lat: r.dropoff.lat,
          lng: r.dropoff.lng,
          placeId: r.dropoff.placeId,
          count: 1,
          totalFare: r.fareJMD,
        });
      }
    }
    return Array.from(buckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((b) => ({
        label: b.label,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        placeId: b.placeId,
        count: b.count,
        avgFareJMD: Math.round(b.totalFare / b.count / 50) * 50,
      }));
  }, [history]);

  /* ─── Derived: 3 most recent rides ─── */
  const recentRides = useMemo(
    () =>
      history
        .filter((r) => r.status === "completed" || r.status === "cancelled")
        .slice(0, 3),
    [history],
  );

  /* ─── Derived: stats ─── */
  const stats = useMemo(() => {
    const completed = history.filter((r) => r.status === "completed");
    const totalSpent = completed.reduce((s, r) => s + r.fareJMD, 0);
    const carpoolTrips = completed.filter((r) => r.carpool).length;
    return {
      totalTrips: completed.length,
      totalSpent,
      carpoolTrips,
    };
  }, [history]);

  /* ─── Derived: most recent unrated completed trip ───
   *
   * If the rider has at least one completed trip they haven't
   * rated, surface a "Rate your last trip" CTA instead of the
   * carpool promo — feedback loop > marketing.
   */
  const unratedTrip = useMemo(
    () =>
      history.find(
        (r) =>
          r.status === "completed" && r.driverName && r.myRatingStars === null,
      ) ?? null,
    [history],
  );

  const greeting = firstName
    ? `${t("rider.home.eyebrow", "Welcome back")}, ${firstName}`
    : t("rider.home.eyebrow", "Welcome back");

  return (
    <div className="space-y-6">
      {/* ============== HERO ============== */}
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10">
          <div
            aria-hidden
            className="absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.35) 0%, rgba(241,1,0,0) 45%), radial-gradient(circle at 0% 100%, rgba(241,1,0,0.18) 0%, rgba(241,1,0,0) 40%)",
            }}
          />
          <ArcWatermark
            size={520}
            variant="white"
            className="absolute -right-24 -top-24 opacity-[0.025]"
          />
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -left-20 -bottom-24 opacity-[0.06]"
          />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                {greeting}
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
              {t("rider.home.title", "Where to today?")}
            </h1>
            <p className="mt-3 max-w-md text-sm text-white/75 md:text-base">
              {t(
                "rider.home.subtitle",
                "Door-to-door private rides or pay-by-leg route taxis. TA-regulated, wallet-only, zero cash.",
              )}
            </p>

            <Link
              href="/rider/request"
              className="group mt-7 inline-flex w-full items-center gap-3 rounded-2xl bg-white p-2 pl-5 text-left shadow-2xl shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-rajlo-red/30 sm:max-w-md"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-rajlo-red">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                  Where to?
                </span>
                <span className="block truncate text-sm text-black font-bold ">
                  Search a place, address, or landmark
                </span>
              </span>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/30 transition-transform group-hover:translate-x-0.5">
                <Icon name="arrow-right" className="h-4 w-4" />
              </span>
            </Link>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-white/75">
              <TrustChip icon="shield-check" label="TA-verified drivers" />
              <TrustChip icon="check-circle" label="Upfront fares" />
              <TrustChip icon="wallet" label="Wallet-only · no cash" />
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ============== WEATHER STRIP ==============
         Lives on the dashboard (was previously on /rider/request).
         Riders see today's conditions before they head out to book
         a trip, not after they've already typed pickup + dropoff. */}
      <FadeUp delay={0.03}>
        <RiderWeatherStrip />
      </FadeUp>

      {/* ============== LOADING SHIMMER ==============
         While the three parallel fetches are in flight, render
         skeletons in the same slots the real content will occupy
         (active trip banner, top-destinations grid, recent-rides
         list, stats strip). Prevents the layout-shift "pop" when
         data lands. */}
      {loading && (
        <>
          <FadeUp delay={0.05}>
            <div className="rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12" rounded="xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-2.5 w-20" rounded="md" />
                  <Skeleton className="h-3.5 w-3/4 max-w-64" rounded="md" />
                  <Skeleton className="h-2.5 w-1/2 max-w-40" rounded="md" />
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-2.5 w-16" rounded="md" />
                  <Skeleton className="h-6 w-44" rounded="md" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <ListRowSkeleton key={i} />
                ))}
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.12}>
            <div className="space-y-2.5">
              <div className="mb-2 flex items-end justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-2.5 w-16" rounded="md" />
                  <Skeleton className="h-6 w-44" rounded="md" />
                </div>
              </div>
              {[0, 1, 2].map((i) => (
                <ListRowSkeleton key={i} />
              ))}
            </div>
          </FadeUp>

          <FadeUp delay={0.16}>
            <StatsGridSkeleton count={3} variant="dark" />
          </FadeUp>
        </>
      )}

      {/* ============== ACTIVE TRIP (if any) ============== */}
      {activeTrip && (
        <FadeUp delay={0.05}>
          <Link
            href="/rider/live-trip"
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-rajlo-red/30 bg-gradient-to-br from-primary-soft to-white p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/30">
              <Icon name="navigation" className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  {ACTIVE_LABEL[activeTrip.ride.status]}
                </span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rajlo-red opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rajlo-red" />
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-bold">
                {activeTrip.driver
                  ? `${activeTrip.driver.name}${activeTrip.driver.vehicle ? ` · ${activeTrip.driver.vehicle}` : ""}`
                  : "Looking for a driver…"}
                {activeTrip.driver?.plateNumber ? (
                  <span className="text-muted">
                    {" "}
                    ({activeTrip.driver.plateNumber})
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted">
                Heading to {activeTrip.ride.dropoff.name}
                {activeTrip.ride.estimatedEtaMinutes !== null
                  ? ` · ETA ${activeTrip.ride.estimatedEtaMinutes} min`
                  : ""}
              </p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-all group-hover:bg-rajlo-red group-hover:text-white">
              <Icon name="chevron-right" className="h-4 w-4" />
            </span>
          </Link>
        </FadeUp>
      )}

      {/* ============== TOP DESTINATIONS ============== */}
      {!loading && topDestinations.length > 0 && (
        <>
          <FadeUp delay={0.1}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="font-secondary text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                  Quick book
                </p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight md:text-2xl">
                  Where you go most
                </h2>
              </div>
              <Link
                href="/rider/request"
                className="hidden text-xs font-bold text-rajlo-red hover:underline sm:inline-flex"
              >
                Plan custom →
              </Link>
            </div>
          </FadeUp>

          <Stagger className="grid gap-3 sm:grid-cols-2" amount={0.05}>
            {topDestinations.map((dest) => (
              <StaggerItem key={dest.label}>
                <Link
                  href={buildRequestHrefWithDropoff(dest)}
                  className="group relative flex h-full items-stretch overflow-hidden rounded-2xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg hover:shadow-rajlo-red/10"
                >
                  <span
                    aria-hidden
                    className="w-1 shrink-0 bg-gradient-to-b from-rajlo-red via-rajlo-red/70 to-rajlo-red/30"
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-3 p-4 md:p-5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-rajlo-red transition-colors group-hover:bg-rajlo-red group-hover:text-white">
                      <Icon name="map-pin" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold tracking-tight">
                        {dest.label}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {dest.address}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-rajlo-red">
                          ~{formatJMD(dest.avgFareJMD)}
                        </span>
                        <span className="text-muted">·</span>
                        <span className="font-medium text-muted">
                          {dest.count} trip{dest.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-all group-hover:bg-rajlo-red group-hover:text-white">
                      <Icon name="arrow-right" className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </>
      )}

      {/* ============== RECENT TRIPS ============== */}
      {!loading && recentRides.length > 0 && (
        <>
          <FadeUp delay={0.15}>
            <div className="mb-3 mt-6 flex items-end justify-between">
              <div>
                <p className="font-secondary text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                  Take it again
                </p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight md:text-2xl">
                  Your recent trips
                </h2>
              </div>
              <Link
                href="/rider/history"
                className="text-xs font-bold text-rajlo-red hover:underline"
              >
                See all →
              </Link>
            </div>
          </FadeUp>

          <Stagger className="space-y-2.5" amount={0.04}>
            {recentRides.map((r) => (
              <StaggerItem key={r.id}>
                <Link
                  href={
                    r.kind === "route_taxi"
                      ? `/rider/route-taxi/history/${r.id}`
                      : `/rider/history/${r.id}`
                  }
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                      r.status === "cancelled"
                        ? "bg-rajlo-black/10 text-foreground"
                        : "bg-surface-soft text-muted group-hover:bg-primary-soft group-hover:text-rajlo-red"
                    }`}
                  >
                    <Icon
                      name={r.status === "cancelled" ? "x" : "clock"}
                      className="h-4 w-4"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {r.pickup.name} <span className="text-rajlo-red">→</span>{" "}
                      {r.dropoff.name}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {r.endedAt ? friendlyDate(r.endedAt) : "—"}
                      {r.carpool ? " · Carpool" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-bold ${
                        r.status === "cancelled"
                          ? "text-muted line-through"
                          : "text-foreground"
                      }`}
                    >
                      {formatJMD(r.fareJMD)}
                    </p>
                    <p className="text-[10px] text-muted">
                      {r.status === "cancelled"
                        ? "cancelled"
                        : "tap for receipt"}
                    </p>
                  </div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-all group-hover:bg-rajlo-red group-hover:text-white">
                    <Icon name="chevron-right" className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </>
      )}

      {/* ============== EMPTY STATE (no history) ============== */}
      {!loading && history.length === 0 && (
        <FadeUp delay={0.1}>
          <EmptyState
            variant="hero"
            title="Take your first ride"
            body="Once you ride with Rajlo, your favourite destinations and recent trips show up right here for one-tap rebooking."
            cta={{ label: "Book a ride", href: "/rider/request" }}
          />
        </FadeUp>
      )}

      {/* ============== STATS STRIP ============== */}
      {!loading && stats.totalTrips > 0 && (
        <FadeUp delay={0.2}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-rajlo-black via-rajlo-black to-[#1a1d10] p-6 text-white">
            <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat label="Trips" value={stats.totalTrips.toString()} />
              <Stat
                label="Avg rating"
                value={
                  ratingSummary?.average !== null &&
                  ratingSummary?.average !== undefined
                    ? ratingSummary.average.toFixed(1)
                    : "—"
                }
                suffix="★"
              />
              <Stat
                label="Total spent"
                value={`${(stats.totalSpent / 1000).toFixed(1)}k`}
                prefix="JMD "
              />
            </div>
            {stats.carpoolTrips > 0 ? (
              <p className="mt-5 text-[11px] leading-relaxed text-white/60">
                You&apos;ve carpooled {stats.carpoolTrips} time
                {stats.carpoolTrips === 1 ? "" : "s"} — that&apos;s real money
                saved and one fewer car on Jamaica&apos;s roads.
              </p>
            ) : (
              <p className="mt-5 text-[11px] leading-relaxed text-white/60">
                Try carpool on your next trip and save 35% on the fare.
              </p>
            )}
          </div>
        </FadeUp>
      )}

      {/* ============== UNRATED TRIP CTA  ==============
         If there's a recent trip the rider hasn't rated, surface it
         here. Falls back to the carpool promo if everyone's rated. */}
      {unratedTrip ? (
        <FadeUp delay={0.25}>
          <Link
            href={`/rider/history/${unratedTrip.id}`}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-rajlo-red/30 bg-primary-soft p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg"
          >
            <ArcWatermark
              size={220}
              variant="red"
              className="pointer-events-none absolute -right-12 -bottom-12 opacity-20"
            />
            <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/30">
              <Icon name="star" className="h-5 w-5" />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Rate your last trip
              </p>
              <p className="mt-0.5 truncate text-sm font-extrabold tracking-tight md:text-base">
                {unratedTrip.driverName} · {unratedTrip.dropoff.name}
              </p>
              <p className="truncate text-xs text-foreground/70">
                Your feedback helps other riders pick the right driver.
              </p>
            </div>
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-rajlo-red transition-all group-hover:bg-rajlo-red group-hover:text-white">
              <Icon name="arrow-right" className="h-4 w-4" />
            </span>
          </Link>
        </FadeUp>
      ) : (
        !loading && (
          <FadeUp delay={0.25}>
            <Link
              href="/rider/request"
              className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-rajlo-red/30 bg-primary-soft p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg"
            >
              <ArcWatermark
                size={220}
                variant="red"
                className="pointer-events-none absolute -right-12 -bottom-12 opacity-20"
              />
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/30">
                <Icon name="users" className="h-5 w-5" />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  Save 35% with carpool
                </p>
                <p className="mt-0.5 text-sm font-extrabold tracking-tight md:text-base">
                  Match with a rider going your way
                </p>
                <p className="hidden text-xs text-foreground/70 sm:block">
                  Toggle &ldquo;Share this ride&rdquo; on your next booking
                </p>
              </div>
              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-rajlo-red transition-all group-hover:bg-rajlo-red group-hover:text-white">
                <Icon name="arrow-right" className="h-4 w-4" />
              </span>
            </Link>
          </FadeUp>
        )
      )}
    </div>
  );
}

/* ─────────── Inline subcomponents ─────────── */

const ACTIVE_LABEL: Record<ActiveRideMini["status"], string> = {
  requested: "Looking for a driver",
  accepted: "Driver on the way",
  arrived: "Driver at pickup",
  in_progress: "Trip in progress",
};

function TrustChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-white/85">
        <Icon name={icon} className="h-3 w-3" />
      </span>
      {label}
    </span>
  );
}


function Stat({
  label,
  value,
  suffix,
  prefix,
}: {
  label: string;
  value: string;
  suffix?: string;
  prefix?: string;
}) {
  return (
    <div className="px-3 py-3 text-center first:pt-0 last:pb-0 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-white/55">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
        {prefix && (
          <span className="text-sm font-bold text-white/70">{prefix}</span>
        )}
        {value}
        {suffix && (
          <span className="text-sm font-bold text-white/70">{suffix}</span>
        )}
      </p>
    </div>
  );
}

/** Friendly relative date — "Yesterday · 6:14 PM" / "Tue · 8:02 AM"
 *  / "21 Mar · 10:31 AM". */
function friendlyDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const t = d.getTime();
  const time = d.toLocaleTimeString("en-JM", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (t >= startOfToday) return `Today · ${time}`;
  if (t >= startOfToday - 86_400_000) return `Yesterday · ${time}`;
  if (t >= startOfToday - 6 * 86_400_000) {
    const wkday = d.toLocaleDateString("en-JM", { weekday: "short" });
    return `${wkday} · ${time}`;
  }
  return (
    d.toLocaleDateString("en-JM", {
      day: "numeric",
      month: "short",
    }) + ` · ${time}`
  );
}

/**
 * Builds the deep-link URL that lands on /rider/request with the
 * dropoff field pre-filled. The booking page reads these query params
 * on mount and seeds its `dropoff` Place state — exactly the same
 * shape the autocomplete would produce, so no extra fetch needed.
 *
 * Skips the placeId param when null/empty rather than sending an
 * explicit empty string — keeps the URL tidy.
 */
function buildRequestHrefWithDropoff(dest: {
  label: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string | null;
}): string {
  const params = new URLSearchParams({
    to_name: dest.label,
    to_address: dest.address,
    to_lat: String(dest.lat),
    to_lng: String(dest.lng),
  });
  if (dest.placeId) params.set("to_place", dest.placeId);
  return `/rider/request?${params.toString()}`;
}
