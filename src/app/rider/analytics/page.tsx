"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { MonthlyBars, ProgressRow, StatNumber } from "@/components/charts";
import { formatJMD } from "@/lib/jamaica";
import { useT } from "@/lib/i18n";

/**
 * Rider spending analytics. Loads /api/rider/analytics once and
 * renders a series of cards + the bar chart.
 *
 * Sections, top → bottom:
 *   1. Hero — lifetime spend + this-month spend, dark gradient
 *   2. 4 stat tiles — 30d spend, 30d trips, avg fare, money saved
 *   3. Monthly bars (last 12 months)
 *   4. Spend by parish (horizontal progress bars)
 *   5. Top routes (most-frequent pickup → dropoff pairs)
 *   6. Cancelled / carpool footnotes
 *
 * If the rider has zero completed trips we render a friendly empty
 * state instead of empty cards.
 */

type Analytics = {
  totals: {
    lifetime: { trips: number; spendJMD: number };
    last30Days: { trips: number; spendJMD: number };
    last7Days: { trips: number; spendJMD: number };
    thisMonth: { trips: number; spendJMD: number };
    averageFareJMD: number;
    longestTripKm: number | null;
  };
  compare: {
    spendChangePct: number | null;
    tripsChangePct: number | null;
  };
  trend: Array<{
    key: string;
    label: string;
    trips: number;
    spendJMD: number;
  }>;
  byParish: Array<{ parish: string; trips: number; spendJMD: number }>;
  topRoutes: Array<{
    pickup: string;
    dropoff: string;
    trips: number;
    spendJMD: number;
  }>;
  cancelled: { count: number; savedJMD: number };
  carpool: { trips: number };
};

export default function RiderAnalyticsPage() {
  const { t } = useT();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rider/analytics");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Analytics;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
        <Skeleton className="h-44 w-full" rounded="xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" rounded="xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" rounded="xl" />
        <Skeleton className="h-64 w-full" rounded="xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">
            😢
          </span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Couldn&apos;t load analytics
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "Something went wrong. Please try again."}
        </p>
      </div>
    );
  }

  const noTrips = data.totals.lifetime.trips === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -right-20 -bottom-24 opacity-[0.18]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              {t("analytics.eyebrow", "Spending")}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {formatJMD(data.totals.lifetime.spendJMD)}
            </h1>
            <p className="mt-1 text-sm text-white/75">
              {t("analytics.allTime", "Lifetime")} ·{" "}
              {data.totals.lifetime.trips} trip
              {data.totals.lifetime.trips === 1 ? "" : "s"} on Rajlo
            </p>

            <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-white/15 pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                  {t("analytics.thisMonth", "This month")}
                </p>
                <p className="mt-1 text-xl font-extrabold tracking-tight">
                  {formatJMD(data.totals.thisMonth.spendJMD)}
                </p>
                <p className="text-[11px] text-white/65">
                  {data.totals.thisMonth.trips} trip
                  {data.totals.thisMonth.trips === 1 ? "" : "s"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                  {t("analytics.last7", "Last 7 days")}
                </p>
                <p className="mt-1 text-xl font-extrabold tracking-tight">
                  {formatJMD(data.totals.last7Days.spendJMD)}
                </p>
                <p className="text-[11px] text-white/65">
                  {data.totals.last7Days.trips} trip
                  {data.totals.last7Days.trips === 1 ? "" : "s"}
                </p>
              </div>
              {data.totals.longestTripKm !== null && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                    Longest trip
                  </p>
                  <p className="mt-1 text-xl font-extrabold tracking-tight">
                    {data.totals.longestTripKm.toFixed(1)} km
                  </p>
                  <p className="text-[11px] text-white/65">All-time</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Empty state */}
      {noTrips ? (
        <FadeUp delay={0.05}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-rajlo-red">
              <Icon name="bar-chart" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              No spending yet
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Take your first ride and your spending breakdown will land here —
              monthly trend, top routes, parish split, the lot.
            </p>
            <Link
              href="/rider/request"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Book a ride
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </FadeUp>
      ) : (
        <>
          {/* 4 stat tiles */}
          <FadeUp delay={0.05}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatNumber
                eyebrow="Last 30 days"
                value={formatJMD(data.totals.last30Days.spendJMD)}
                caption={`${data.totals.last30Days.trips} trip${data.totals.last30Days.trips === 1 ? "" : "s"}`}
                changePct={data.compare.spendChangePct}
                invertColors
              />
              <StatNumber
                eyebrow="Trips · 30d"
                value={String(data.totals.last30Days.trips)}
                caption="vs previous 30 days"
                changePct={data.compare.tripsChangePct}
              />
              <StatNumber
                eyebrow="Average fare"
                value={formatJMD(data.totals.averageFareJMD)}
                caption="Per completed trip"
              />
              <StatNumber
                eyebrow="Saved"
                value={formatJMD(data.cancelled.savedJMD)}
                caption={`${data.cancelled.count} cancelled · no charge`}
              />
            </div>
          </FadeUp>

          {/* Monthly trend */}
          <FadeUp delay={0.1}>
            <MonthlyBars data={data.trend} />
          </FadeUp>

          {/* By parish */}
          {data.byParish.length > 0 && (
            <FadeUp delay={0.15}>
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                    <Icon name="map" className="h-3.5 w-3.5" />
                  </span>
                  <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    Spend by parish
                  </p>
                </div>
                <div className="space-y-4">
                  {(() => {
                    const max = Math.max(
                      ...data.byParish.map((p) => p.spendJMD),
                    );
                    return data.byParish
                      .slice(0, 8)
                      .map((p) => (
                        <ProgressRow
                          key={p.parish}
                          label={p.parish}
                          caption={`${p.trips} trip${p.trips === 1 ? "" : "s"}`}
                          spendJMD={p.spendJMD}
                          share={max > 0 ? p.spendJMD / max : 0}
                        />
                      ));
                  })()}
                </div>
              </div>
            </FadeUp>
          )}

          {/* Top routes */}
          {data.topRoutes.length > 0 && (
            <FadeUp delay={0.2}>
              <div className="rounded-2xl border border-line bg-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                    <Icon name="navigation" className="h-3.5 w-3.5" />
                  </span>
                  <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    Top routes
                  </p>
                </div>
                <div className="space-y-4">
                  {(() => {
                    const max = Math.max(
                      ...data.topRoutes.map((r) => r.spendJMD),
                    );
                    return data.topRoutes.map((r, i) => (
                      <ProgressRow
                        key={`${r.pickup}-${r.dropoff}`}
                        rank={i + 1}
                        label={`${r.pickup} → ${r.dropoff}`}
                        caption={`${r.trips} trip${r.trips === 1 ? "" : "s"}`}
                        spendJMD={r.spendJMD}
                        share={max > 0 ? r.spendJMD / max : 0}
                      />
                    ));
                  })()}
                </div>
              </div>
            </FadeUp>
          )}

          {/* Footnote tiles */}
          <FadeUp delay={0.25}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FootnoteCard
                icon="x"
                tone="neutral"
                eyebrow="Cancelled trips"
                value={String(data.cancelled.count)}
                hint={
                  data.cancelled.count > 0
                    ? `${formatJMD(data.cancelled.savedJMD)} not charged`
                    : "You haven't cancelled a trip yet"
                }
              />
              {/* Carpool stat card intentionally hidden — feature is
                 no longer offered through the UI. */}
            </div>
          </FadeUp>

          {/* History link */}
          <FadeUp delay={0.3}>
            <Link
              href="/rider/history"
              className="group flex items-center justify-between rounded-2xl border border-dashed border-line bg-surface-soft px-5 py-4 transition-colors hover:border-rajlo-red hover:bg-primary-soft/40"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-rajlo-red shadow-sm">
                  <Icon name="clock" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold">See every trip</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Drill into individual receipts, ratings, and routes.
                  </p>
                </div>
              </div>
              <Icon
                name="chevron-right"
                className="h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rajlo-red"
              />
            </Link>
          </FadeUp>
        </>
      )}
    </div>
  );
}

function FootnoteCard({
  icon,
  tone,
  eyebrow,
  value,
  hint,
}: {
  icon: "x" | "users";
  tone: "neutral" | "positive";
  eyebrow: string;
  value: string;
  hint: string;
}) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-surface-soft text-foreground";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg ${toneClass}`}
        >
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          {eyebrow}
        </p>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </div>
  );
}
