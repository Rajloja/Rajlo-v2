"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { Heatmap } from "@/components/charts";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/ride-monitoring — full live + historical ride feed.
 *
 * The page is split into:
 *
 *   1. Live strip   — the in-flight rides (requested → in_progress)
 *                     pulled fresh every 10s so the admin sees new
 *                     bookings appear without a refresh
 *   2. Heatmap      — hour-of-day × day-of-week activity (last 30d)
 *                     surfaces demand peaks for parish/driver staffing
 *   3. Filtered list — paginated, searchable, status- and parish-aware
 *
 * Each ride row links to /admin/rides/[id] for the deep dive.
 */

type RideRow = {
  id: string;
  status: string;
  riderId: string;
  riderName: string;
  driverId: string | null;
  driverName: string | null;
  driverExternalId: string | null;
  driverPlate: string | null;
  pickup: { name: string; address: string; parish: string | null };
  dropoff: { name: string; address: string; parish: string | null };
  seats: number;
  fare: number | null;
  requestedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

const PARISHES = [
  "Kingston",
  "St. Andrew",
  "St. Catherine",
  "Clarendon",
  "Manchester",
  "St. James",
  "St. Ann",
  "Portland",
  "St. Thomas",
  "St. Mary",
  "Trelawny",
  "Westmoreland",
  "Hanover",
  "St. Elizabeth",
];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "In flight" },
  { key: "requested", label: "Requested" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default function AdminRideMonitoringPage() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["key"]>(
    "all",
  );
  const [parish, setParish] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [days, setDays] = useState(7);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Build the URL the filtered feed query depends on. Whenever any
  // of the filter inputs flip, the URL changes and useLiveQuery
  // resets the loading state + re-fetches.
  const PAGE_SIZE = 100;
  const filteredUrl = (() => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (parish) params.set("parish", parish);
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("days", String(days));
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", "0");
    return `/api/admin/rides?${params.toString()}`;
  })();

  // Main filtered feed — refresh every 20s (this is the historical
  // browse view, not the live strip).
  const filteredQuery = useLiveQuery<{
    rides: RideRow[];
    total: number;
    pagination?: { hasMore: boolean };
  }>(filteredUrl, { interval: 20_000 });
  const firstPageRides = filteredQuery.data?.rides ?? [];
  const total = filteredQuery.data?.total ?? 0;

  const [extraRides, setExtraRides] = useState<RideRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtraRides([]);
    setHasMoreOlder(true);
    setLoadMoreError(null);
  }, [filteredUrl]);

  const firstIds = new Set(firstPageRides.map((r) => r.id));
  const rides: RideRow[] = [
    ...firstPageRides,
    ...extraRides.filter((r) => !firstIds.has(r.id)),
  ];
  const canLoadMore =
    extraRides.length === 0
      ? (filteredQuery.data?.pagination?.hasMore ?? false)
      : hasMoreOlder;
  const loading = filteredQuery.loading;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(filteredUrl, window.location.origin);
      next.searchParams.set("offset", String(rides.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        rides: RideRow[];
        pagination?: { hasMore: boolean };
      };
      setExtraRides((prev) => {
        const seen = new Set([
          ...firstPageRides.map((r) => r.id),
          ...prev.map((r) => r.id),
        ]);
        return [...prev, ...json.rides.filter((r) => !seen.has(r.id))];
      });
      setHasMoreOlder(json.pagination?.hasMore ?? false);
    } catch (e) {
      setLoadMoreError(
        e instanceof Error ? e.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  // Live in-flight strip — 8s cadence so new bookings + accept/arrive
  // transitions appear with minimal lag.
  const liveQuery = useLiveQuery<{ rides: RideRow[] }>(
    "/api/admin/rides?status=active&days=1&limit=50",
    { interval: 8_000 },
  );
  const liveRides = liveQuery.data?.rides ?? [];
  const loadingLive = liveQuery.loading;

  // Heatmap from the analytics overview — refresh every 2 minutes;
  // hour-of-day patterns barely move minute-to-minute.
  const heatmapQuery = useLiveQuery<{ heatmap: number[][] }>(
    "/api/admin/analytics/overview?days=30",
    { interval: 120_000 },
  );
  const heatmap = heatmapQuery.data?.heatmap ?? null;

  // Aggregate "freshest of any sub-query" for the page-level live pill.
  const newestUpdate = [
    filteredQuery.lastUpdated,
    liveQuery.lastUpdated,
    heatmapQuery.lastUpdated,
  ].reduce<Date | null>(
    (acc, d) => (d && (!acc || d > acc) ? d : acc),
    null,
  );
  const anyRefreshing =
    filteredQuery.refreshing ||
    liveQuery.refreshing ||
    heatmapQuery.refreshing;
  const refreshAll = () => {
    filteredQuery.refresh();
    liveQuery.refresh();
    heatmapQuery.refresh();
  };

  const liveCount = liveRides.length;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-4 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-9">
          <ArcWatermark
            size={460}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.10]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Ride monitoring
              </p>
              <LiveIndicator
                variant="dark"
                lastUpdated={newestUpdate}
                refreshing={anyRefreshing}
                onRefresh={refreshAll}
              />
            </div>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {loadingLive ? (
                <Skeleton variant="dark" className="h-9 w-64" rounded="lg" />
              ) : (
                `${liveCount} ride${liveCount === 1 ? "" : "s"} in flight`
              )}
            </h1>
            <p className="mt-1 text-sm text-white/70 md:text-base">
              Every booking, accept, arrival, and completion. The in-flight
              strip refreshes every 8 seconds; the historical list every 20.
            </p>
          </div>
        </div>
      </FadeUp>

      {/* Live strip */}
      <FadeUp delay={0.04}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-rajlo-red text-white">
                <span className="absolute inset-0 animate-ping rounded-lg bg-rajlo-red opacity-30" />
                <Icon name="navigation" className="relative h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-extrabold">In-flight rides</p>
            </div>
            <p className="text-xs text-muted">Updates every 10s</p>
          </div>
          {loadingLive ? (
            <Skeleton className="h-24 w-full" rounded="xl" />
          ) : liveRides.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface-soft py-10 text-center text-xs text-muted">
              No rides currently in flight.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {liveRides.map((r) => (
                <LiveRideCard key={r.id} ride={r} />
              ))}
            </ul>
          )}
        </div>
      </FadeUp>

      {/* Heatmap */}
      <FadeUp delay={0.06}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Demand heatmap
          </p>
          <p className="mt-1 mb-4 text-sm font-bold">
            Last 30 days · hour of day × day of week
          </p>
          {heatmap ? (
            <Heatmap matrix={heatmap} caption="Darker cells = busier hours" />
          ) : (
            <Skeleton className="h-44 w-full" rounded="xl" />
          )}
        </div>
      </FadeUp>

      {/* Filters */}
      <FadeUp delay={0.08}>
        <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    status === s.key
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "bg-surface-soft text-muted hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <select
                value={parish}
                onChange={(e) => setParish(e.target.value)}
                className="rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-semibold focus:border-rajlo-red focus:outline-none"
              >
                <option value="">All parishes</option>
                {PARISHES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-semibold focus:border-rajlo-red focus:outline-none"
              >
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={0}>All time</option>
              </select>
              <label className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pickup or dropoff name…"
                  className="w-full rounded-full border border-line bg-surface-soft py-2 pl-9 pr-4 text-sm font-semibold focus:border-rajlo-red focus:outline-none"
                />
              </label>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* List */}
      <FadeUp delay={0.1}>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {loading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" rounded="xl" />
              ))}
            </div>
          ) : rides.length === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              <Icon name="navigation" className="h-8 w-8 text-muted" />
              <p className="mt-3 text-sm font-bold">No rides match these filters</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {rides.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/rides/${r.id}`}
                      className="grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-surface-soft md:grid-cols-[1fr,1.5fr,1fr,auto] md:items-center md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                          Ride
                        </p>
                        <p className="mt-0.5 truncate text-sm font-bold">
                          {r.id.slice(0, 8)}
                        </p>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold tracking-tight">
                          {r.pickup.name}{" "}
                          <span className="text-muted">→</span> {r.dropoff.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {(r.pickup.parish ?? "?")} → {(r.dropoff.parish ?? "?")} ·{" "}
                          {r.seats} seat{r.seats === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">
                          {r.driverName ?? <span className="text-muted">No driver yet</span>}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {r.driverPlate ?? "—"} · rider {r.riderName}
                        </p>
                      </div>
                      <div className="text-xs text-muted md:text-right">
                        <p className="font-extrabold text-rajlo-red">
                          {r.fare !== null ? formatJMD(r.fare) : "—"}
                        </p>
                        <p>{ago(r.requestedAt)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-soft px-4 py-3 md:px-5">
                <p className="text-[11px] font-semibold text-muted">
                  Showing {rides.length} of {total}
                </p>
                {canLoadMore && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMore ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                    ) : null}
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
              {loadMoreError && (
                <p className="border-t border-line bg-primary-soft px-5 py-2 text-xs font-semibold text-rajlo-red">
                  {loadMoreError}
                </p>
              )}
            </>
          )}
        </div>
      </FadeUp>
    </div>
  );
}

function LiveRideCard({ ride }: { ride: RideRow }) {
  const minutes = elapsedMinutes(ride.requestedAt);
  return (
    <li>
      <Link
        href={`/admin/rides/${ride.id}`}
        className="block rounded-xl border border-line bg-surface-soft p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <StatusBadge status={ride.status} />
          <p className="text-[10px] font-extrabold text-muted">
            {minutes}m elapsed
          </p>
        </div>
        <p className="mt-2 truncate text-sm font-extrabold tracking-tight">
          {ride.pickup.name}
        </p>
        <p className="text-xs text-muted">
          → {ride.dropoff.name}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[11px]">
          <p className="truncate text-muted">
            {ride.driverName ?? "Unassigned"}
          </p>
          <p className="font-extrabold text-rajlo-red">
            {ride.fare !== null ? formatJMD(ride.fare) : "—"}
          </p>
        </div>
      </Link>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    requested: {
      label: "Requested",
      className: "bg-amber-50 text-amber-800 border-amber-200",
    },
    accepted: {
      label: "Accepted",
      className: "bg-blue-50 text-blue-800 border-blue-200",
    },
    arrived: {
      label: "Arrived",
      className: "bg-blue-50 text-blue-800 border-blue-200",
    },
    in_progress: {
      label: "In progress",
      className: "bg-rajlo-red text-white border-rajlo-red",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-surface-soft text-muted border-line",
    },
  };
  const c = cfg[status] ?? {
    label: status,
    className: "bg-surface-soft text-muted border-line",
  };
  return (
    <span
      className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${c.className}`}
    >
      {c.label}
    </span>
  );
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function elapsedMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}
