"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { ListRowSkeleton } from "@/components/skeleton";
import { useBackgroundRefresh } from "@/lib/use-background-refresh";

/**
 * /admin/route-sessions — Live monitor for Route Taxi sessions.
 *
 * Real-time view of who's online running which corridor, seats taken,
 * and how many riders they're currently handling. Polled every 5s so
 * the admin sees fleet movement without manual refresh.
 */

type SessionRow = {
  id: string;
  direction: "forward" | "reverse";
  status: "active" | "paused" | "ended";
  seatsTaken: number;
  vehicleCapacity: number;
  seatsRemaining: number;
  startedAt: string;
  endedAt: string | null;
  currentLat: number | null;
  currentLng: number | null;
  lastPositionAt: string | null;
  driver: {
    id: string;
    externalId: string;
    name: string;
    plate: string | null;
    vehicle: string | null;
  } | null;
  route: {
    id: string;
    origin: string;
    destination: string;
    parish: string | null;
    distanceKm: number;
    taFareJmd: number;
  } | null;
  hails: { accepted: number; onboard: number };
};

type Response = {
  sessions: SessionRow[];
  totalSeatsTaken: number;
  totalCapacity: number;
  activeSessions: number;
  pagination?: { hasMore: boolean };
};

const PAGE_SIZE = 200;

export default function AdminRouteSessionsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "ended" | "all">(
    "active",
  );

  const [extra, setExtra] = useState<SessionRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setExtra([]);
    setHasMoreOlder(true);
  }, [statusFilter]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/route-sessions?status=${statusFilter}&limit=${PAGE_SIZE}&offset=0`,
      );
      if (!res.ok) throw new Error("Failed to load sessions");
      const json = (await res.json()) as Response;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sessions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live polling — only when active filter is on (ended sessions don't move).
  useBackgroundRefresh(refresh, 5000, { enabled: statusFilter === "active" });

  const firstPage = data?.sessions ?? [];
  const firstIds = new Set(firstPage.map((s) => s.id));
  const mergedSessions: SessionRow[] = [
    ...firstPage,
    ...extra.filter((s) => !firstIds.has(s.id)),
  ];
  const canLoadMore =
    extra.length === 0
      ? (data?.pagination?.hasMore ?? false)
      : hasMoreOlder;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/route-sessions?status=${statusFilter}&limit=${PAGE_SIZE}&offset=${mergedSessions.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Response;
      setExtra((prev) => {
        const seen = new Set([
          ...firstPage.map((s) => s.id),
          ...prev.map((s) => s.id),
        ]);
        return [...prev, ...json.sessions.filter((s) => !seen.has(s.id))];
      });
      setHasMoreOlder(json.pagination?.hasMore ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const utilization = useMemo(() => {
    if (!data || data.totalCapacity === 0) return 0;
    return Math.round((data.totalSeatsTaken / data.totalCapacity) * 100);
  }, [data]);

  return (
    <div className="space-y-6">
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10">
          <ArcWatermark
            size={520}
            variant="white"
            className="absolute -right-24 -top-24 opacity-[0.06]"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="font-secondary text-xs font-bold uppercase tracking-wider text-emerald-200">
                Live · polling every 5s
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
              Fleet on the road
            </h1>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Active sessions"
                value={data?.activeSessions ?? 0}
                hint="Drivers running a route right now"
              />
              <Stat
                label="Seats taken"
                value={`${data?.totalSeatsTaken ?? 0}/${data?.totalCapacity ?? 0}`}
                hint={`${utilization}% utilisation`}
              />
              <Stat
                label="Hails active"
                value={
                  data?.sessions.reduce(
                    (s, x) => s + x.hails.accepted + x.hails.onboard,
                    0,
                  ) ?? 0
                }
                hint="Onboard + en-route"
              />
            </div>
          </div>
        </section>
      </FadeUp>

      <FadeUp delay={0.04}>
        <div className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-bold">
          {(["active", "ended", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-2 ${
                statusFilter === v
                  ? "bg-rajlo-black text-white"
                  : "bg-surface text-muted hover:bg-surface-soft"
              }`}
            >
              {v === "active" ? "Active" : v === "ended" ? "Ended" : "All"}
            </button>
          ))}
        </div>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && data && mergedSessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-10 text-center">
          <p className="text-sm font-bold">
            {statusFilter === "active"
              ? "No active sessions right now"
              : "No sessions match this filter"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {statusFilter === "active"
              ? "When drivers go live on a route, they'll show up here."
              : "Try a different status filter."}
          </p>
        </div>
      )}

      {!loading && data && mergedSessions.length > 0 && (
        <>
          {/* Mobile: stacked cards. Tables don't fit phone widths
             without horizontal scroll — admins doing a quick on-the-go
             check shouldn't have to swipe sideways to see the seat
             counter. */}
          <ul className="space-y-2.5 md:hidden">
            {mergedSessions.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{s.driver?.name ?? "—"}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {s.driver?.externalId ?? ""}
                      {s.driver?.plate ? ` · ${s.driver.plate}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      s.seatsRemaining === 0
                        ? "bg-rajlo-red text-white"
                        : "bg-surface-soft text-foreground"
                    }`}
                  >
                    {s.seatsTaken}/{s.vehicleCapacity}
                  </span>
                </div>

                {s.route && (
                  <p className="mt-3 text-sm font-bold">
                    {s.direction === "reverse"
                      ? `${s.route.destination} → ${s.route.origin}`
                      : `${s.route.origin} → ${s.route.destination}`}
                  </p>
                )}
                {s.route && (
                  <p className="text-[11px] text-muted">
                    {s.route.parish ?? ""} · {s.route.distanceKm.toFixed(1)} km
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {s.hails.onboard > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                      {s.hails.onboard} onboard
                    </span>
                  )}
                  {s.hails.accepted > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                      {s.hails.accepted} en-route
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
                  <span>Started {timeAgo(s.startedAt)}</span>
                  <span>
                    {s.lastPositionAt
                      ? `GPS · ${timeAgo(s.lastPositionAt)}`
                      : "no GPS"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: same data, wide table. */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Driver · Vehicle</th>
                  <th className="px-4 py-3 text-left">Route · Direction</th>
                  <th className="px-4 py-3 text-center">Seats</th>
                  <th className="px-4 py-3 text-center">Hails</th>
                  <th className="px-4 py-3 text-right">Started · Position</th>
                </tr>
              </thead>
              <tbody>
                {mergedSessions.map((s, i) => (
                  <tr
                    key={s.id}
                    className={i > 0 ? "border-t border-line" : ""}
                  >
                    <td className="px-4 py-3">
                      <p className="font-bold">{s.driver?.name ?? "—"}</p>
                      <p className="text-[11px] text-muted">
                        {s.driver?.externalId ?? ""}
                        {s.driver?.plate ? ` · ${s.driver.plate}` : ""}
                        {s.driver?.vehicle ? ` · ${s.driver.vehicle}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {s.route ? (
                        <>
                          <p className="font-bold">
                            {s.direction === "reverse"
                              ? `${s.route.destination} → ${s.route.origin}`
                              : `${s.route.origin} → ${s.route.destination}`}
                          </p>
                          <p className="text-[11px] text-muted">
                            {s.route.parish ?? ""} ·{" "}
                            {s.route.distanceKm.toFixed(1)} km
                          </p>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          s.seatsRemaining === 0
                            ? "bg-rajlo-red text-white"
                            : "bg-surface-soft text-foreground"
                        }`}
                      >
                        {s.seatsTaken}/{s.vehicleCapacity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {s.hails.onboard > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                            {s.hails.onboard} onboard
                          </span>
                        )}
                        {s.hails.accepted > 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                            {s.hails.accepted} en-route
                          </span>
                        )}
                        {s.hails.onboard === 0 && s.hails.accepted === 0 && (
                          <span className="text-[11px] text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-[11px] text-muted">
                        {timeAgo(s.startedAt)}
                      </p>
                      <p className="text-[11px] text-muted">
                        {s.lastPositionAt
                          ? `GPS · ${timeAgo(s.lastPositionAt)}`
                          : "no GPS"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canLoadMore && (
            <div className="pt-1 text-center">
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-white/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[10px] text-white/55">{hint}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
