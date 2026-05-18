"use client";

import Link from "next/link";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon, type IconName } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import {
  AreaChart,
  DonutChart,
  Sparkline,
  type DonutSlice,
} from "@/components/charts";
import {
  ActivityFeedSkeleton,
  LeaderboardSkeleton,
  Skeleton,
} from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";
import { useHasAdminPermission } from "@/components/admin-permissions";

/**
 * Admin Operations dashboard.
 *
 * Top-of-funnel command centre for the platform. Pulls two payloads
 * on first paint:
 *
 *   /api/admin/stats                — KPI strip + sparkline data
 *   /api/admin/activity?limit=20    — live activity feed (right column)
 *
 * The chart payload (status mix, ride volume) is loaded from
 * /api/admin/analytics/overview alongside the dashboard so the
 * "modern interface with a lot of analytics" promise is paid up
 * front rather than buried on a sub-page.
 */

type Stats = {
  generatedAt: string;
  users: { riders: number; drivers: number; admins: number; total: number };
  drivers: {
    active: number;
    online: number;
    pendingVerification: number;
    rejected: number;
  };
  rides: {
    today: number;
    yesterday: number;
    active: number;
    completedToday: number;
    cancelledToday: number;
    sparkline7d: number[];
  };
  // Null for admin tiers without `view_analytics` — the API omits it
  // and the dashboard hides the revenue card entirely.
  revenue: { today: number; last30d: number; sparkline30d: number[] } | null;
  queue: {
    docsPending: number;
    docsRejected: number;
    vehicleChangesPending: number;
    lowRatings: number;
  };
};

type Activity = {
  id: string;
  source: string;
  tone: "info" | "good" | "warning" | "danger" | "neutral";
  icon: string;
  title: string;
  body: string;
  href?: string;
  at: string;
};

type Analytics = {
  daily: Array<{ label: string; rides: number; revenue: number }>;
  statusCounts: Record<string, number>;
  parishes: Array<{ parish: string; count: number }>;
  topDrivers: Array<{
    id: string;
    externalId: string;
    name: string;
    rides: number;
    revenue: number;
  }>;
};

const STATUS_COLOURS: Record<string, string> = {
  completed: "text-emerald-600",
  in_progress: "text-rajlo-red",
  accepted: "text-amber-500",
  arrived: "text-blue-500",
  requested: "text-rajlo-black",
  cancelled: "text-muted",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  accepted: "Accepted",
  arrived: "Arrived",
  requested: "Requested",
  cancelled: "Cancelled",
};

export default function AdminOperationsPage() {
  // Three live polls running in parallel. Each has its own cadence
  // tuned to how often the underlying data actually changes:
  //   - stats     every 15s — counts shift on every booking / signup
  //   - activity  every 10s — feed should feel near-instant
  //   - analytics every 45s — heavier aggregation; doesn't need to
  //                            churn faster than that
  // All three pause when the tab is hidden.
  // Business analytics (revenue, charts, leaderboards) is for tiers
  // with `view_analytics` only — compliance + super_admin. Lower tiers
  // get a clean ops-only dashboard.
  const canViewAnalytics = useHasAdminPermission("view_analytics");

  const statsQuery = useLiveQuery<Stats>("/api/admin/stats", { interval: 15_000 });
  const activityQuery = useLiveQuery<{ items: Activity[] }>(
    "/api/admin/activity?limit=20",
    { interval: 10_000 },
  );
  const analyticsQuery = useLiveQuery<Analytics>(
    "/api/admin/analytics/overview?days=14",
    { interval: 45_000, enabled: canViewAnalytics },
  );

  const stats = statsQuery.data;
  const activity = activityQuery.data?.items ?? [];
  const analytics = analyticsQuery.data;

  // The "first paint" loading state — true only until at least one
  // payload has resolved, so the page swaps to skeletons just once
  // rather than flashing them on every refresh tick.
  const loading =
    statsQuery.loading ||
    activityQuery.loading ||
    (canViewAnalytics && analyticsQuery.loading);

  const newestUpdate = [
    statsQuery.lastUpdated,
    activityQuery.lastUpdated,
    analyticsQuery.lastUpdated,
  ].reduce<Date | null>(
    (acc, d) => (d && (!acc || d > acc) ? d : acc),
    null,
  );
  const anyRefreshing =
    statsQuery.refreshing || activityQuery.refreshing || analyticsQuery.refreshing;
  const refreshAll = () => {
    statsQuery.refresh();
    activityQuery.refresh();
    analyticsQuery.refresh();
  };

  const ridesDelta =
    stats && stats.rides.yesterday > 0
      ? Math.round(
          ((stats.rides.today - stats.rides.yesterday) /
            stats.rides.yesterday) *
            100,
        )
      : null;

  const statusDonut: DonutSlice[] = analytics
    ? Object.entries(analytics.statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          label: STATUS_LABELS[status] ?? status,
          value: count,
          color: STATUS_COLOURS[status] ?? "text-muted",
        }))
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-2 py-4 md:px-3 md:py-8">
      {/* ─── Hero ─── */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-10">
          <ArcWatermark
            size={520}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.10]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Operations console · {new Date().toLocaleDateString("en-JM", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <LiveIndicator
                  variant="dark"
                  lastUpdated={newestUpdate}
                  refreshing={anyRefreshing}
                  onRefresh={refreshAll}
                />
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                {loading ? (
                  <Skeleton variant="dark" className="h-9 w-80 max-w-full" rounded="lg" />
                ) : (
                  `${stats?.rides.active ?? 0} active ride${stats?.rides.active === 1 ? "" : "s"} · ${stats?.drivers.online ?? 0} driver${stats?.drivers.online === 1 ? "" : "s"} online`
                )}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/75 md:text-base">
                Everything happening across the platform — every booking,
                every driver event, every admin decision — surfaces here in
                real time.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/ride-monitoring"
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                <Icon name="navigation" className="h-4 w-4" />
                Live rides
              </Link>
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Icon name="users" className="h-4 w-4" />
                Users
              </Link>
              <Link
                href="/admin/messages"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Icon name="mail" className="h-4 w-4" />
                Messaging
              </Link>
              {canViewAnalytics && (
                <Link
                  href="/admin/analytics"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <Icon name="bar-chart" className="h-4 w-4" />
                  Analytics
                </Link>
              )}
            </div>
          </div>
        </div>
      </FadeUp>

      {/* ─── KPI strip ─── */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          eyebrow="Rides today"
          value={loading ? "—" : String(stats?.rides.today ?? 0)}
          caption={
            stats
              ? `${stats.rides.completedToday} completed · ${stats.rides.cancelledToday} cancelled`
              : undefined
          }
          delta={ridesDelta}
          sparkline={stats?.rides.sparkline7d ?? []}
          icon="navigation"
        />
        {canViewAnalytics && (
          <KpiTile
            eyebrow="Revenue today"
            value={loading ? "—" : formatJMD(stats?.revenue?.today ?? 0)}
            caption={
              stats?.revenue
                ? `30-day total · ${formatJMD(stats.revenue.last30d)}`
                : undefined
            }
            sparkline={stats?.revenue?.sparkline30d ?? []}
            sparkAccent="emerald"
            icon="trending-up"
          />
        )}
        <KpiTile
          eyebrow="Drivers online"
          value={
            loading
              ? "—"
              : `${stats?.drivers.online ?? 0} / ${stats?.drivers.active ?? 0}`
          }
          caption={
            stats
              ? `${stats.drivers.pendingVerification} awaiting verification`
              : undefined
          }
          icon="user"
        />
        <KpiTile
          eyebrow="Riders on file"
          value={loading ? "—" : String(stats?.users.riders ?? 0)}
          caption={
            stats
              ? `${stats.users.total} total accounts · ${stats.users.admins} admin${stats.users.admins === 1 ? "" : "s"}`
              : undefined
          }
          icon="users"
        />
      </div>

      {/* ─── Action queue strip ─── */}
      {stats && (stats.queue.docsPending > 0 ||
        stats.queue.docsRejected > 0 ||
        stats.queue.vehicleChangesPending > 0 ||
        stats.queue.lowRatings > 0) && (
        <FadeUp delay={0.05}>
          <div className="rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-4 md:p-5">
            <p className="font-secondary mb-3 text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Needs attention
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <QueueChip
                count={stats.queue.docsPending}
                label="Pending TA documents"
                href="/admin/verification-queue"
                icon="clipboard-check"
              />
              <QueueChip
                count={stats.queue.docsRejected}
                label="Rejected documents"
                href="/admin/verification-queue"
                icon="alert-triangle"
                tone="danger"
              />
              <QueueChip
                count={stats.queue.vehicleChangesPending}
                label="Vehicle change requests"
                href="/admin/vehicle-changes"
                icon="car"
              />
              <QueueChip
                count={stats.queue.lowRatings}
                label="1-2 ★ ratings"
                href="/admin/audit-logs?source=admin"
                icon="star"
                tone="danger"
              />
            </div>
          </div>
        </FadeUp>
      )}

      {/* ─── Charts row — business analytics, senior tiers only ─── */}
      {canViewAnalytics && (
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Volume area chart — spans 2 columns */}
        <FadeUp delay={0.08}>
          <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  Ride volume
                </p>
                <p className="mt-1 text-sm font-bold">Last 14 days</p>
              </div>
              <Link
                href="/admin/analytics"
                className="text-xs font-bold text-rajlo-red hover:underline"
              >
                Full analytics →
              </Link>
            </div>
            {analytics && analytics.daily.length > 0 ? (
              <AreaChart
                data={analytics.daily.map((d) => ({
                  label: d.label,
                  value: d.rides,
                }))}
                height={180}
                accent="red"
                formatValue={(v) => `${v} ride${v === 1 ? "" : "s"}`}
              />
            ) : loading ? (
              <Skeleton className="h-44 w-full" rounded="xl" />
            ) : (
              <div className="grid h-44 place-items-center text-xs text-muted">
                No ride data yet
              </div>
            )}
          </div>
        </FadeUp>

        {/* Status mix donut */}
        <FadeUp delay={0.1}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Status mix
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Last 14 days</p>
            {statusDonut.length > 0 ? (
              <DonutChart
                data={statusDonut}
                size={160}
                centreLabel="Rides"
                centreValue={String(
                  statusDonut.reduce((sum, s) => sum + s.value, 0),
                )}
              />
            ) : loading ? (
              <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-6">
                <Skeleton className="h-40 w-40" rounded="full" />
                <div className="w-full flex-1 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-3 w-24" rounded="md" />
                      <Skeleton className="h-3 w-12" rounded="md" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid h-40 place-items-center text-xs text-muted">
                No data
              </div>
            )}
          </div>
        </FadeUp>
      </div>
      )}

      {/* ─── Bottom row: Top drivers + parishes + activity ─── */}
      <div
        className={`grid gap-5 ${canViewAnalytics ? "lg:grid-cols-3" : ""}`}
      >
        {canViewAnalytics && (
        <FadeUp delay={0.12}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Top drivers
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">By rides completed</p>
            {analytics && analytics.topDrivers.length > 0 ? (
              <ul className="space-y-3">
                {analytics.topDrivers.slice(0, 5).map((d, i) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface-soft px-3 py-2.5"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red text-xs font-extrabold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{d.name}</p>
                      <p className="truncate text-xs text-muted">
                        {d.externalId} · {d.rides} ride{d.rides === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-extrabold tracking-tight text-rajlo-red">
                      {formatJMD(d.revenue)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : loading ? (
              <LeaderboardSkeleton rows={5} />
            ) : (
              <p className="grid h-40 place-items-center text-xs text-muted">
                No completed rides yet
              </p>
            )}
          </div>
        </FadeUp>
        )}

        {canViewAnalytics && (
        <FadeUp delay={0.14}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Top origin parishes
            </p>
            <p className="mt-1 mb-4 text-sm font-bold">Where rides start</p>
            {analytics && analytics.parishes.length > 0 ? (
              <ul className="space-y-3">
                {analytics.parishes.slice(0, 5).map((p, i) => {
                  const max = analytics.parishes[0].count;
                  const pct = max > 0 ? (p.count / max) * 100 : 0;
                  return (
                    <li key={p.parish} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm font-bold">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-extrabold text-rajlo-red">
                            {i + 1}
                          </span>
                          {p.parish}
                        </p>
                        <p className="text-xs font-extrabold text-muted">
                          {p.count}
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
                        <div
                          className="h-full rounded-full bg-rajlo-red transition-all duration-500"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : loading ? (
              <ul className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3 w-24" rounded="md" />
                      <Skeleton className="h-3 w-10" rounded="md" />
                    </div>
                    <Skeleton className="h-2 w-full" rounded="full" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="grid h-40 place-items-center text-xs text-muted">
                No rides booked yet
              </p>
            )}
          </div>
        </FadeUp>
        )}

        {/* Activity feed — operational, shown to every admin tier */}
        <FadeUp delay={0.16}>
          <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  Live activity
                </p>
                <p className="mt-1 text-sm font-bold">
                  Updates every 10 seconds
                </p>
              </div>
              <Link
                href="/admin/audit-logs"
                className="text-xs font-bold text-rajlo-red hover:underline"
              >
                Audit log →
              </Link>
            </div>
            {loading && activity.length === 0 ? (
              <ActivityFeedSkeleton rows={6} />
            ) : activity.length === 0 ? (
              <p className="grid flex-1 place-items-center py-10 text-xs text-muted">
                No recent activity
              </p>
            ) : (
              <ul className="-mx-2 max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {activity.slice(0, 12).map((a) => (
                  <ActivityRow key={a.id} item={a} />
                ))}
              </ul>
            )}
          </div>
        </FadeUp>
      </div>
    </div>
  );
}

function KpiTile({
  eyebrow,
  value,
  caption,
  delta,
  sparkline,
  sparkAccent = "red",
  icon,
}: {
  eyebrow: string;
  value: string;
  caption?: string;
  delta?: number | null;
  sparkline?: number[];
  sparkAccent?: "red" | "emerald" | "black";
  icon: IconName;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            {eyebrow}
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
            {value}
          </p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {caption && (
            <p className="truncate text-[11px] text-muted">{caption}</p>
          )}
          {delta !== undefined && delta !== null && (
            <p
              className={`mt-1 text-[11px] font-extrabold ${
                delta > 0
                  ? "text-emerald-600"
                  : delta < 0
                    ? "text-rajlo-red"
                    : "text-muted"
              }`}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}{" "}
              {Math.abs(delta)}% vs yesterday
            </p>
          )}
        </div>
        {sparkline && sparkline.length > 0 && (
          <Sparkline data={sparkline} accent={sparkAccent} className="h-10 w-20" />
        )}
      </div>
    </div>
  );
}

function QueueChip({
  count,
  label,
  href,
  icon,
  tone = "default",
}: {
  count: number;
  label: string;
  href: string;
  icon: IconName;
  tone?: "default" | "danger";
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-3 rounded-xl border bg-surface px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        tone === "danger"
          ? "border-rajlo-red/20 hover:border-rajlo-red"
          : "border-line hover:border-rajlo-red/40"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            tone === "danger"
              ? "bg-rajlo-red text-white"
              : "bg-primary-soft text-rajlo-red"
          }`}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-extrabold tracking-tight">{count}</p>
          <p className="truncate text-[11px] font-semibold text-muted">{label}</p>
        </div>
      </div>
      <Icon
        name="chevron-right"
        className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function ActivityRow({ item }: { item: Activity }) {
  const toneClasses = {
    info: "bg-blue-50 text-blue-700",
    good: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-primary-soft text-rajlo-red",
    neutral: "bg-surface-soft text-muted",
  } as const;
  const inner = (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-soft">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${toneClasses[item.tone]}`}
      >
        <Icon name={item.icon as IconName} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-extrabold tracking-tight">
          {item.title}
        </p>
        <p className="truncate text-[11px] text-muted">{item.body}</p>
      </div>
      <p className="shrink-0 text-[10px] font-semibold text-muted">
        {timeAgo(item.at)}
      </p>
    </div>
  );
  return (
    <li>
      {item.href ? <Link href={item.href}>{inner}</Link> : inner}
    </li>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
