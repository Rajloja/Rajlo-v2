"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import {
  AreaChart,
  DonutChart,
  Heatmap,
  PieChart,
  ProgressRow,
  type DonutSlice,
} from "@/components/charts";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/analytics — deep analytics dashboard.
 *
 * Pulls /api/admin/analytics/overview at the requested window
 * (7d / 30d / 90d) and renders every chart shape the chart
 * library exposes — ride volume area, status donut, parish bars,
 * vehicle pie, demand heatmap, rating distribution, top
 * drivers / riders leaderboards, cancellation pie.
 *
 * One round-trip per window switch.
 */

type Overview = {
  generatedAt: string;
  days: number;
  daily: Array<{ date: string; label: string; rides: number; revenue: number }>;
  statusCounts: Record<string, number>;
  parishes: Array<{ parish: string; count: number }>;
  vehicleTypes: Array<{ type: string; count: number }>;
  complianceCounts: Record<string, number>;
  heatmap: number[][];
  ratings: { distribution: number[]; total: number; average: number | null };
  cancellations: Array<{ reason: string; count: number }>;
  topDrivers: Array<{
    id: string;
    externalId: string;
    name: string;
    rides: number;
    revenue: number;
  }>;
  topRiders: Array<{ id: string; name: string; rides: number; spend: number }>;
};

const STATUS_COLOURS: Record<string, string> = {
  completed: "text-emerald-600",
  in_progress: "text-rajlo-red",
  accepted: "text-amber-500",
  arrived: "text-blue-500",
  requested: "text-rajlo-black",
  cancelled: "text-muted",
};

const COMPLIANCE_COLOURS: Record<string, string> = {
  approved: "text-emerald-600",
  pending: "text-amber-500",
  rejected: "text-rajlo-red",
  missing: "text-muted",
  expired: "text-rajlo-red",
  expiring_soon: "text-amber-500",
};

const VEHICLE_PALETTE = [
  "text-rajlo-red",
  "text-rajlo-black",
  "text-emerald-600",
  "text-amber-500",
  "text-blue-500",
  "text-purple-500",
];

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);

  // Live-poll the analytics overview every 45s. The query is heavy
  // (joins against rides + ratings + drivers + docs) so we don't
  // hammer it harder than that — the operations dashboard already
  // surfaces faster-changing counts via /api/admin/stats every 15s.
  const { data, loading, refreshing, lastUpdated, refresh } =
    useLiveQuery<Overview>(`/api/admin/analytics/overview?days=${days}`, {
      interval: 45_000,
    });

  const totals = useMemo(() => {
    if (!data) return null;
    const totalRides = data.daily.reduce((s, d) => s + d.rides, 0);
    const totalRevenue = data.daily.reduce((s, d) => s + d.revenue, 0);
    const completed = data.statusCounts.completed ?? 0;
    const cancelled = data.statusCounts.cancelled ?? 0;
    const cancelRate =
      totalRides > 0 ? Math.round((cancelled / totalRides) * 100) : 0;
    const completionRate =
      totalRides > 0 ? Math.round((completed / totalRides) * 100) : 0;
    return { totalRides, totalRevenue, cancelRate, completionRate };
  }, [data]);

  const statusDonut: DonutSlice[] = data
    ? Object.entries(data.statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          label: status.replace("_", " "),
          value: count,
          color: STATUS_COLOURS[status] ?? "text-muted",
        }))
    : [];

  const vehicleSlices: DonutSlice[] = data
    ? data.vehicleTypes.map((v, i) => ({
        label: v.type,
        value: v.count,
        color: VEHICLE_PALETTE[i % VEHICLE_PALETTE.length],
      }))
    : [];

  const complianceSlices: DonutSlice[] = data
    ? Object.entries(data.complianceCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          label: status.replace("_", " "),
          value: count,
          color: COMPLIANCE_COLOURS[status] ?? "text-muted",
        }))
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-4 md:px-3 md:py-8">
      {/* Hero with window picker */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-9">
          <ArcWatermark
            size={460}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.12]"
          />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Analytics
                </p>
                <LiveIndicator
                  variant="dark"
                  lastUpdated={lastUpdated}
                  refreshing={refreshing}
                  onRefresh={refresh}
                />
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                {loading
                  ? "Crunching numbers…"
                  : totals
                    ? `${totals.totalRides.toLocaleString("en-JM")} ride${totals.totalRides === 1 ? "" : "s"} · ${formatJMD(totals.totalRevenue)}`
                    : "No data"}
              </h1>
              <p className="mt-1 text-sm text-white/70 md:text-base">
                Last {days} days · auto-refreshes every 45 seconds
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    days === d
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                  }`}
                >
                  Last {d}d
                </button>
              ))}
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur transition-all hover:bg-white/20"
              >
                <Icon name="home" className="h-3.5 w-3.5" />
                Operations
              </Link>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* KPI strip */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" rounded="xl" />
          ))}
        </div>
      ) : totals ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Kpi label="Rides booked" value={totals.totalRides.toLocaleString("en-JM")} />
          <Kpi label="Gross revenue" value={formatJMD(totals.totalRevenue)} />
          <Kpi label="Completion rate" value={`${totals.completionRate}%`} tone="emerald" />
          <Kpi
            label="Cancellation rate"
            value={`${totals.cancelRate}%`}
            tone={totals.cancelRate > 15 ? "danger" : undefined}
          />
        </div>
      ) : null}

      {/* Volume + revenue */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <FadeUp delay={0.04}>
          <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Daily ride volume
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Last {days} days</p>
            {loading ? (
              <Skeleton className="h-44 w-full" rounded="xl" />
            ) : data && data.daily.length > 0 ? (
              <AreaChart
                data={data.daily.map((d) => ({ label: d.label, value: d.rides }))}
                height={200}
                accent="red"
                formatValue={(v) => `${v} ride${v === 1 ? "" : "s"}`}
              />
            ) : (
              <p className="grid h-44 place-items-center text-xs text-muted">No data</p>
            )}
          </div>
        </FadeUp>

        <FadeUp delay={0.06}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Status mix
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Where rides ended up</p>
            {loading ? (
              <Skeleton className="h-44 w-full" rounded="xl" />
            ) : statusDonut.length > 0 ? (
              <DonutChart
                data={statusDonut}
                size={160}
                centreLabel="Rides"
                centreValue={String(
                  statusDonut.reduce((s, d) => s + d.value, 0),
                )}
              />
            ) : (
              <p className="grid h-44 place-items-center text-xs text-muted">No data</p>
            )}
          </div>
        </FadeUp>
      </div>

      {/* Revenue area */}
      <FadeUp delay={0.08}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Daily revenue
          </p>
          <p className="mt-1 mb-4 text-sm font-bold">
            Completed rides only · {data ? formatJMD(totals?.totalRevenue ?? 0) : "—"}
          </p>
          {loading ? (
            <Skeleton className="h-44 w-full" rounded="xl" />
          ) : data && data.daily.length > 0 ? (
            <AreaChart
              data={data.daily.map((d) => ({ label: d.label, value: d.revenue }))}
              height={180}
              accent="emerald"
              formatValue={(v) => formatJMD(v)}
            />
          ) : (
            <p className="grid h-44 place-items-center text-xs text-muted">No data</p>
          )}
        </div>
      </FadeUp>

      {/* Heatmap + ratings */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <FadeUp delay={0.1}>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              When rides happen
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Hour × day-of-week</p>
            {loading ? (
              <Skeleton className="h-48 w-full" rounded="xl" />
            ) : data ? (
              // Heatmap is 24×7 cells — too wide for phone viewports.
              // Wrap in a horizontal scroller so the card itself stays
              // inside its grid column.
              <div className="-mx-5 overflow-x-auto px-5">
                <Heatmap matrix={data.heatmap} caption="Darker cells = busier hours" />
              </div>
            ) : null}
          </div>
        </FadeUp>

        <FadeUp delay={0.12}>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Rating distribution
            </p>
            <p className="mt-1 mb-3 text-sm font-bold">
              {data?.ratings.average !== null && data?.ratings.average !== undefined
                ? `Average ${data.ratings.average.toFixed(2)}★ across ${data.ratings.total} rating${data.ratings.total === 1 ? "" : "s"}`
                : "No ratings in this window"}
            </p>
            {loading ? (
              <Skeleton className="h-40 w-full" rounded="xl" />
            ) : data && data.ratings.total > 0 ? (
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = data.ratings.distribution[star - 1] ?? 0;
                  const max = Math.max(1, ...data.ratings.distribution);
                  const pct = (count / max) * 100;
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="inline-flex w-12 items-center gap-1 text-xs font-bold">
                        {star}
                        <Icon name="star" className="h-3 w-3 text-rajlo-red" />
                      </span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-surface-soft">
                        <div
                          className="h-full rounded-full bg-rajlo-red"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-extrabold text-muted">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-10 text-center text-xs text-muted">No ratings yet</p>
            )}
          </div>
        </FadeUp>
      </div>

      {/* Vehicle types + Compliance + Cancellations */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <FadeUp delay={0.14}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Vehicle types in fleet
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Active drivers</p>
            {loading ? (
              <Skeleton className="h-40 w-full" rounded="xl" />
            ) : vehicleSlices.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <PieChart data={vehicleSlices} size={140} />
                <ul className="w-full space-y-1 text-xs">
                  {vehicleSlices.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-sm bg-current ${s.color}`} />
                        {s.label}
                      </span>
                      <span className="font-extrabold">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-10 text-center text-xs text-muted">No drivers yet</p>
            )}
          </div>
        </FadeUp>

        <FadeUp delay={0.16}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Document compliance
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">All driver documents</p>
            {loading ? (
              <Skeleton className="h-40 w-full" rounded="xl" />
            ) : complianceSlices.length > 0 ? (
              <DonutChart
                data={complianceSlices}
                size={140}
                centreLabel="Docs"
                centreValue={String(
                  complianceSlices.reduce((s, d) => s + d.value, 0),
                )}
              />
            ) : (
              <p className="py-10 text-center text-xs text-muted">No documents yet</p>
            )}
          </div>
        </FadeUp>

        <FadeUp delay={0.18}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Cancellation reasons
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Why rides drop</p>
            {loading ? (
              <Skeleton className="h-40 w-full" rounded="xl" />
            ) : data && data.cancellations.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {data.cancellations.map((c, i) => {
                  const max = data.cancellations[0].count;
                  const pct = max > 0 ? (c.count / max) * 100 : 0;
                  return (
                    <li key={i} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-bold">{c.reason}</p>
                        <p className="font-extrabold text-rajlo-red">{c.count}</p>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                        <div
                          className="h-full bg-rajlo-red"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-10 text-center text-xs text-muted">No cancellations yet</p>
            )}
          </div>
        </FadeUp>
      </div>

      {/* Parishes */}
      <FadeUp delay={0.2}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Where rides start
          </p>
          <p className="mt-1 mb-4 text-sm font-bold">Top origin parishes</p>
          {loading ? (
            <Skeleton className="h-44 w-full" rounded="xl" />
          ) : data && data.parishes.length > 0 ? (
            <div className="space-y-3">
              {data.parishes.map((p, i) => (
                <ProgressRow
                  key={p.parish}
                  rank={i + 1}
                  label={p.parish}
                  spendJMD={p.count}
                  share={
                    data.parishes[0].count > 0
                      ? p.count / data.parishes[0].count
                      : 0
                  }
                  caption={`${p.count} ride${p.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-muted">No rides booked yet</p>
          )}
        </div>
      </FadeUp>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FadeUp delay={0.22}>
          <Leaderboard
            title="Top drivers"
            subtitle="By rides completed"
            loading={loading}
            rows={
              data?.topDrivers.map((d) => ({
                key: d.id,
                primary: d.name,
                secondary: `${d.externalId} · ${d.rides} ride${d.rides === 1 ? "" : "s"}`,
                value: formatJMD(d.revenue),
                href: `/admin/users?q=${encodeURIComponent(d.externalId)}`,
              })) ?? []
            }
          />
        </FadeUp>
        <FadeUp delay={0.24}>
          <Leaderboard
            title="Top riders"
            subtitle="By spend"
            loading={loading}
            rows={
              data?.topRiders.map((r) => ({
                key: r.id,
                primary: r.name,
                secondary: `${r.rides} ride${r.rides === 1 ? "" : "s"}`,
                value: formatJMD(r.spend),
                href: `/admin/users/${r.id}`,
              })) ?? []
            }
          />
        </FadeUp>
      </div>

    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "danger";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-rajlo-red"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-extrabold tracking-tight md:text-3xl ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function Leaderboard({
  title,
  subtitle,
  loading,
  rows,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  rows: Array<{
    key: string;
    primary: string;
    secondary: string;
    value: string;
    href: string;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 md:p-6">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
        {title}
      </p>
      <p className="mt-1 mb-4 text-sm font-bold">{subtitle}</p>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" rounded="xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted">No data yet</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface-soft px-3 py-2.5 transition-colors hover:bg-surface"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red text-xs font-extrabold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.primary}</p>
                  <p className="truncate text-xs text-muted">{r.secondary}</p>
                </div>
                <p className="shrink-0 text-xs font-extrabold text-rajlo-red">
                  {r.value}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

