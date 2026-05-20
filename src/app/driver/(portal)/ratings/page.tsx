"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { HeroSkeleton, Skeleton } from "@/components/skeleton";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

const PAGE_SIZE = 20;
const RATINGS_URL = `/api/driver/ratings?limit=${PAGE_SIZE}&offset=0`;

/**
 * Driver "my ratings" page. Read-only window into how riders are
 * scoring this driver — lifetime average, last-30-day trend,
 * distribution histogram, and the most recent 20 reviews with rider
 * comments and trip context.
 *
 * Backed by /api/driver/ratings (auth-scoped to the signed-in driver).
 */

type Summary = {
  total: number;
  average: number | null;
  fiveStarPct: number | null;
};

type Distribution = Record<1 | 2 | 3 | 4 | 5, number>;

type RecentRating = {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  riderFirstName: string;
  pickup: string | null;
  dropoff: string | null;
};

type Response = {
  summary: Summary;
  distribution: Distribution;
  last30Days: { total: number; average: number | null };
  recent: RecentRating[];
  pagination?: { hasMore: boolean };
};

export default function DriverRatingsPage() {
  // Seed from the prefetch cache so a tap on the Ratings drawer item
  // lands on real numbers + reviews instantly; the fetch below still
  // refreshes in the background.
  const cached = getCachedDriverData<Response>(RATINGS_URL);
  const [data, setData] = useState<Response | null>(cached);
  const [loading, setLoading] = useState(cached == null);
  const [error, setError] = useState<string | null>(null);
  // Pagination state for the "recent" list. Aggregates (summary,
  // distribution, last30Days) are still computed across the full
  // history server-side regardless of which page is loaded.
  const [extraRecent, setExtraRecent] = useState<RecentRating[]>([]);
  const [hasMoreRecent, setHasMoreRecent] = useState(
    cached?.pagination?.hasMore ?? false,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(RATINGS_URL);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Response;
        if (!cancelled) {
          setData(json);
          setHasMoreRecent(json.pagination?.hasMore ?? false);
          setCachedDriverData(RATINGS_URL, json);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load ratings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMoreRecent = async () => {
    if (!data) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const offset = data.recent.length + extraRecent.length;
      const res = await fetch(
        `/api/driver/ratings?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Response;
      setExtraRecent((prev) => {
        const seen = new Set([
          ...data.recent.map((r) => r.id),
          ...prev.map((r) => r.id),
        ]);
        return [...prev, ...json.recent.filter((r) => !seen.has(r.id))];
      });
      setHasMoreRecent(json.pagination?.hasMore ?? false);
    } catch (e) {
      setLoadMoreError(
        e instanceof Error ? e.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-2 py-2 md:px-3 md:py-8">
        <HeroSkeleton />
        <Skeleton className="h-64 w-full" rounded="xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full" rounded="xl" />
        ))}
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
          Couldn&apos;t load ratings
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "Something went wrong. Please try again."}
        </p>
      </div>
    );
  }

  const { summary, distribution, last30Days, recent: firstPageRecent } = data;
  // Combined view: server's first page + any older pages the driver
  // has loaded via "Load more." Dedupe by id in case a server refresh
  // overlaps a page we already have.
  const firstPageIds = new Set(firstPageRecent.map((r) => r.id));
  const recent = [
    ...firstPageRecent,
    ...extraRecent.filter((r) => !firstPageIds.has(r.id)),
  ];
  const maxBar = Math.max(1, ...Object.values(distribution));
  const noRatings = summary.total === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={420}
            variant="red"
            className="absolute -right-24 -bottom-32 opacity-[0.18]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              My ratings
            </p>
            <h1 className="mt-2 text-5xl font-extrabold leading-none tracking-tight md:text-6xl">
              {summary.average !== null ? summary.average.toFixed(1) : "—"}
              <span className="ml-2 text-2xl text-white/60 md:text-3xl">
                / 5
              </span>
            </h1>
            <p className="mt-3 text-sm text-white/80">
              {noRatings
                ? "No ratings yet — your first reviews land here once riders complete trips with you."
                : `${summary.total} review${
                    summary.total === 1 ? "" : "s"
                  } from your riders`}
            </p>

            {!noRatings && (
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 sm:grid-cols-3 sm:gap-6">
                <HeroStat
                  label="5-star rate"
                  value={
                    summary.fiveStarPct !== null
                      ? `${summary.fiveStarPct}%`
                      : "—"
                  }
                  caption={`${distribution[5]} of ${summary.total} review${
                    summary.total === 1 ? "" : "s"
                  }`}
                />
                <HeroStat
                  label="Last 30 days"
                  value={
                    last30Days.average !== null
                      ? last30Days.average.toFixed(1)
                      : "—"
                  }
                  caption={`${last30Days.total} review${
                    last30Days.total === 1 ? "" : "s"
                  }`}
                />
                <HeroStat
                  label="Lifetime"
                  value={String(summary.total)}
                  caption="Rated trips"
                />
              </div>
            )}
          </div>
        </div>
      </FadeUp>

      {/* Distribution histogram */}
      {!noRatings && (
        <FadeUp delay={0.06}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                <Icon name="activity" className="h-3.5 w-3.5" />
              </span>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Star distribution
              </p>
            </div>
            <div className="space-y-2.5">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = distribution[star] ?? 0;
                const pct = (count / summary.total) * 100;
                const widthPct = (count / maxBar) * 100;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="inline-flex w-10 shrink-0 items-center gap-1 text-xs font-bold text-foreground">
                      {star}
                      <Icon
                        name="star-solid"
                        className="h-3 w-3 text-rajlo-red"
                      />
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-soft">
                      <div
                        className="h-full rounded-full bg-rajlo-red transition-all duration-500"
                        style={{ width: `${Math.max(2, widthPct)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs text-muted">
                      {count} · {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </FadeUp>
      )}

      {/* Recent reviews */}
      {recent.length > 0 && (
        <FadeUp delay={0.1}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                <Icon name="star-solid" className="h-3.5 w-3.5" />
              </span>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Recent reviews
              </p>
            </div>
            {recent.map((r) => (
              <ReviewCard key={r.id} r={r} />
            ))}
            {hasMoreRecent && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={loadMoreRecent}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                  ) : null}
                  {loadingMore ? "Loading…" : "Load more reviews"}
                </button>
              </div>
            )}
            {loadMoreError && (
              <p className="pt-1 text-center text-[11px] font-semibold text-rajlo-red">
                {loadMoreError}
              </p>
            )}
          </div>
        </FadeUp>
      )}

      {/* Empty state */}
      {noRatings && (
        <FadeUp delay={0.06}>
          <div className="rounded-3xl border border-dashed border-line bg-surface-soft p-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-rajlo-red">
              <Icon name="star-solid" className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-extrabold tracking-tight">
              Your first review is coming
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              Once you complete trips, riders will rate you 1–5 stars and their
              feedback will land here. A consistent 4.7+ unlocks priority
              matching.
            </p>
          </div>
        </FadeUp>
      )}
    </div>
  );
}

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
      <p className="mt-1 text-xl font-extrabold tracking-tight md:text-2xl">
        {value}
      </p>
      <p className="text-[10px] text-white/65">{caption}</p>
    </div>
  );
}

function ReviewCard({ r }: { r: RecentRating }) {
  const dateLabel = new Date(r.createdAt).toLocaleDateString("en-JM", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Icon
                key={i}
                name="star-solid"
                className={`h-4 w-4 ${
                  i < r.stars ? "text-rajlo-red" : "text-line"
                }`}
              />
            ))}
            <span className="ml-2 text-xs font-bold text-foreground">
              {r.stars}/5
            </span>
          </div>
          <p className="mt-1 text-sm font-bold">
            {r.riderFirstName}
            {r.pickup && r.dropoff && (
              <span className="font-normal text-muted">
                {" "}
                · {r.pickup} → {r.dropoff}
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-muted">{dateLabel}</span>
      </div>
      {r.comment && (
        <p className="mt-3 rounded-xl bg-surface-soft px-3 py-2 text-sm leading-relaxed text-foreground">
          &ldquo;{r.comment}&rdquo;
        </p>
      )}
    </div>
  );
}
