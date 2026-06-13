"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import {
  HeroSkeleton,
  ListRowSkeleton,
  Skeleton,
  StatsGridSkeleton,
} from "@/components/skeleton";
import { formatJMD } from "@/lib/jamaica";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

/**
 * Driver earnings dashboard. Pulls real completed-ride data from
 * /api/driver/rides/history and rolls it up into Today / This week /
 * This month buckets. Shows:
 *   - Wallet hero with the selected-range total
 *   - Vs-prior-period delta + completed-trip count
 *   - Per-day bar chart
 *   - Best day callout
 *   - Recent completed trips list (top 5)
 *   - Next payout estimate + payout method link
 *
 * Server-side aggregation lands when traffic warrants it; for now
 * the page just slurps the most recent ~50 trips and computes
 * everything client-side.
 */

type HistoryRow = {
  id: string;
  status: "completed" | "cancelled";
  pickup: { name: string; address: string };
  dropoff: { name: string; address: string };
  fareJMD: number;
  endedAt: string | null;
  riderName: string;
  carpool: boolean;
};

type HistoryResponse = {
  rides: HistoryRow[];
  pagination: { hasMore: boolean };
  pageEarningsJMD: number;
};

type Range = "today" | "week" | "month";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

const FETCH_LIMIT = 50;
const EARNINGS_URL = `/api/driver/rides/history?limit=${FETCH_LIMIT}&offset=0`;

export default function DriverEarningsPage() {
  // Seed from the bottom-nav's prefetch cache so tab-switches show
  // the chart and totals instantly. The background refresh below
  // still pulls the latest numbers.
  const cached = getCachedDriverData<HistoryResponse>(EARNINGS_URL);
  const [rows, setRows] = useState<HistoryRow[]>(cached?.rides ?? []);
  const [loading, setLoading] = useState(cached == null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("week");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(EARNINGS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        setRows(json.rides);
        setCachedDriverData(EARNINGS_URL, json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load earnings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Roll-ups ─── */

  const stats = useMemo(() => {
    const completed = rows.filter(
      (r) => r.status === "completed" && r.endedAt !== null,
    );
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    // Roll the start window backwards by `n` days from "today" so
    // each range comparison is apples-to-apples (same number of days
    // for current period and prior period).
    const windowDaysFor = (r: Range) =>
      r === "today" ? 1 : r === "week" ? 7 : 30;
    const windowDays = windowDaysFor(range);
    const startOfRange = startOfToday - (windowDays - 1) * 86_400_000;
    const startOfPrior = startOfRange - windowDays * 86_400_000;

    let rangeTotal = 0;
    let rangeCount = 0;
    let priorTotal = 0;
    let priorCount = 0;
    // Per-day buckets for the chart — windowDays slots, ordered oldest→newest.
    const buckets: { dayStart: number; total: number; count: number }[] =
      Array.from({ length: windowDays }, (_, i) => ({
        dayStart: startOfRange + i * 86_400_000,
        total: 0,
        count: 0,
      }));

    for (const r of completed) {
      const ts = new Date(r.endedAt!).getTime();
      if (ts >= startOfRange && ts < startOfRange + windowDays * 86_400_000) {
        rangeTotal += r.fareJMD;
        rangeCount += 1;
        const dayIdx = Math.floor((ts - startOfRange) / 86_400_000);
        if (dayIdx >= 0 && dayIdx < buckets.length) {
          buckets[dayIdx].total += r.fareJMD;
          buckets[dayIdx].count += 1;
        }
      } else if (ts >= startOfPrior && ts < startOfRange) {
        priorTotal += r.fareJMD;
        priorCount += 1;
      }
    }

    const avgPerTrip = rangeCount > 0 ? rangeTotal / rangeCount : 0;
    const deltaPct =
      priorTotal > 0
        ? ((rangeTotal - priorTotal) / priorTotal) * 100
        : rangeTotal > 0
        ? 100
        : 0;
    const bestDay = buckets.reduce((best, b) =>
      b.total > best.total ? b : best,
    );

    return {
      rangeTotal,
      rangeCount,
      priorTotal,
      priorCount,
      avgPerTrip,
      deltaPct,
      buckets,
      bestDay,
      windowDays,
    };
  }, [rows, range]);

  // Most recent 5 completed trips, regardless of selected range —
  // just the "what did I do lately" feed at the bottom.
  const recentCompleted = useMemo(
    () => rows.filter((r) => r.status === "completed").slice(0, 5),
    [rows],
  );

  if (loading) {
    // Earnings layout skeleton: hero + range tabs + KPI strip +
    // chart + payout card + recent-trips list.
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
        <HeroSkeleton />
        <Skeleton className="h-10 w-72" rounded="full" />
        <StatsGridSkeleton count={3} />
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-7 w-7" rounded="lg" />
            <Skeleton className="h-2.5 w-32" rounded="md" />
          </div>
          {/* Bar chart skeleton — fixed-height container with bars at
             varying %s so it reads as a real chart shape. Use the raw
             `shimmer` class directly because the bars need inline
             height and the Skeleton primitive doesn't take a style
             prop. */}
          <div className="flex h-32 items-end gap-2">
            {[40, 60, 30, 80, 55, 70, 45].map((h, i) => (
              <div
                key={i}
                aria-hidden
                className="shimmer flex-1 rounded-md"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">
            😢
          </span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Couldn&apos;t load earnings
        </h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero — wallet card */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={420}
            variant="red"
            className="absolute -right-24 -bottom-32 opacity-[0.18]"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-rajlo-red text-white">
                <Icon name="wallet" className="h-4 w-4" />
              </span>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Earnings · {RANGES.find((r) => r.key === range)?.label}
              </p>
            </div>
            <p className="mt-4 text-5xl font-extrabold tracking-tight md:text-6xl">
              {formatJMD(stats.rangeTotal)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-white/80">
                {stats.rangeCount} completed trip
                {stats.rangeCount === 1 ? "" : "s"}
              </span>
              <span className="text-white/40">·</span>
              <DeltaPill delta={stats.deltaPct} />
            </div>
            {stats.priorTotal > 0 && (
              <p className="mt-2 text-xs text-white/60">
                vs {formatJMD(stats.priorTotal)} the previous{" "}
                {stats.windowDays === 1
                  ? "day"
                  : stats.windowDays === 7
                  ? "week"
                  : "month"}
              </p>
            )}
          </div>
        </div>
      </FadeUp>

      {/* Range tabs */}
      <FadeUp delay={0.05}>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface-soft p-1">
            {RANGES.map((r) => {
              const active = range === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
                    active
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </FadeUp>

      {/* KPI strip */}
      <FadeUp delay={0.08}>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            label="Avg / trip"
            value={formatJMD(Math.round(stats.avgPerTrip))}
            icon="trending-up"
          />
          <KpiCard
            label="Trips"
            value={stats.rangeCount.toString()}
            icon="check-circle"
          />
          <KpiCard
            label="Best day"
            value={
              stats.bestDay.total > 0 ? formatJMD(stats.bestDay.total) : "—"
            }
            icon="star"
          />
        </div>
      </FadeUp>

      {/* Daily chart */}
      <FadeUp delay={0.1}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                <Icon name="activity" className="h-3.5 w-3.5" />
              </span>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Daily breakdown
              </p>
            </div>
            <p className="text-[11px] font-semibold text-muted">
              Tap a bar to see that day&apos;s trips
            </p>
          </div>
          <DailyChart buckets={stats.buckets} />
        </div>
      </FadeUp>

      {/* Payout card */}
      <FadeUp delay={0.14}>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-start gap-3 border-b border-line bg-surface-soft px-5 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
              <Icon name="wallet" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Next payout
              </p>
              <p className="mt-0.5 text-base font-extrabold tracking-tight">
                {formatJMD(stats.rangeTotal)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Paid out every Monday by 17:00 to your linked account.
              </p>
            </div>
            <Link
              href="/driver/payouts"
              className="shrink-0 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Payout setup
            </Link>
          </div>
          <ul className="divide-y divide-line text-xs">
            <PayoutRow label="Method" value="Bank transfer · NCB ••••8821" />
            <PayoutRow label="Currency" value="JMD" />
            <PayoutRow label="Schedule" value="Weekly · Mondays" />
          </ul>
        </div>
      </FadeUp>

      {/* Recent trips */}
      {recentCompleted.length > 0 && (
        <FadeUp delay={0.18}>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight md:text-xl">
                Recent trips
              </h2>
              <Link
                href="/driver/history"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-rajlo-red hover:bg-primary-soft"
              >
                See all
                <Icon name="arrow-right" className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentCompleted.map((r) => (
                <Link
                  key={r.id}
                  href={`/driver/history#trip-${r.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red/30 hover:shadow-md"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                    <Icon name="check-circle" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {r.pickup.name} → {r.dropoff.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {r.riderName} ·{" "}
                      {r.endedAt
                        ? new Date(r.endedAt).toLocaleString("en-JM", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""}
                      {/* Carpool suffix removed with feature retirement. */}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-extrabold text-rajlo-red">
                    {formatJMD(r.fareJMD)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </FadeUp>
      )}

      {recentCompleted.length === 0 && (
        <FadeUp delay={0.18}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="navigation" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              No completed trips yet
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Once you wrap your first ride, your earnings appear here in real
              time.
            </p>
            <Link
              href="/driver"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              Open dashboard
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </FadeUp>
      )}

      <FadeUp delay={0.24}>
        <p className="text-center text-[11px] text-muted">
          Numbers shown are based on completed trips synced from the server.
          Real-time during the day.
        </p>
      </FadeUp>
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function DeltaPill({ delta }: { delta: number }) {
  const positive = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        positive
          ? "bg-emerald-500/20 text-emerald-200"
          : "bg-rajlo-red/30 text-white"
      }`}
    >
      <Icon
        name="trending-up"
        className={`h-3 w-3 ${positive ? "" : "rotate-180"}`}
      />
      {positive ? "+" : ""}
      {delta.toFixed(0)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: IconName;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {label}
        </p>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-rajlo-red md:text-2xl">
        {value}
      </p>
    </div>
  );
}

function DailyChart({
  buckets,
}: {
  buckets: { dayStart: number; total: number; count: number }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  return (
    <div>
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {buckets.map((b, i) => {
          const heightPct = max > 0 ? (b.total / max) * 100 : 0;
          const date = new Date(b.dayStart);
          const dayLabel = date.toLocaleDateString("en-JM", {
            weekday: "short",
          });
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const isToday = new Date().toDateString() === date.toDateString();
          return (
            <div
              key={i}
              className="flex min-w-7 flex-1 flex-col items-center gap-2"
            >
              <div className="relative flex h-32 w-full items-end justify-center">
                <div
                  className={`relative w-full rounded-t-md transition-all ${
                    b.total === 0
                      ? "bg-line"
                      : isToday
                      ? "bg-rajlo-red shadow-md shadow-rajlo-red/30"
                      : "bg-rajlo-red/70 hover:bg-rajlo-red"
                  }`}
                  style={{ height: `${Math.max(4, heightPct)}%` }}
                  title={`${formatJMD(b.total)} · ${b.count} trip${
                    b.count === 1 ? "" : "s"
                  }`}
                />
              </div>
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isToday
                    ? "text-rajlo-red"
                    : isWeekend
                    ? "text-muted"
                    : "text-muted"
                }`}
              >
                {dayLabel}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PayoutRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </li>
  );
}
