"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { HeroSkeleton, Skeleton } from "@/components/skeleton";

/**
 * Rider's "ratings I've given" page. Read-only — the rate-now flow
 * still happens from the completion popup or the history detail view.
 *
 * Sections:
 *   - Wallet-style hero with the rider's average rating given +
 *     total count
 *   - Distribution bar chart (1★ → 5★)
 *   - List of recent ratings, each linked back to the trip detail
 */

type RatingsSummary = {
  total: number;
  average: number | null;
  distribution: number[]; // index 0 = 1-star … index 4 = 5-star
};

type RatingRow = {
  id: string;
  rideId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  driverName: string;
  pickupName: string | null;
  dropoffName: string | null;
  tripCompletedAt: string | null;
};

const PAGE_SIZE = 30;

export default function RiderRatingsPage() {
  const [summary, setSummary] = useState<RatingsSummary | null>(null);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/rider/ratings?limit=${PAGE_SIZE}&offset=0`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          summary: RatingsSummary;
          ratings: RatingRow[];
          pagination?: { hasMore: boolean };
        };
        if (cancelled) return;
        setSummary(json.summary);
        setRatings(json.ratings);
        setHasMore(json.pagination?.hasMore ?? false);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load ratings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(
        `/api/rider/ratings?limit=${PAGE_SIZE}&offset=${ratings.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        ratings: RatingRow[];
        pagination?: { hasMore: boolean };
      };
      setRatings((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...json.ratings.filter((r) => !seen.has(r.id))];
      });
      setHasMore(json.pagination?.hasMore ?? false);
    } catch (e) {
      setLoadMoreError(
        e instanceof Error ? e.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    // Hero + distribution chart placeholder + recent-ratings list
    // skeleton, all in the same vertical rhythm as the loaded view.
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
        <HeroSkeleton />
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7" rounded="lg" />
            <Skeleton className="h-2.5 w-24" rounded="md" />
          </div>
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <Skeleton className="h-3 w-12" rounded="md" />
              <Skeleton className="h-7 flex-1" rounded="full" />
              <Skeleton className="h-3 w-16" rounded="md" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-2.5 w-12" rounded="md" />
                  <Skeleton className="h-4 w-32" rounded="md" />
                </div>
                <Skeleton className="h-4 w-24" rounded="md" />
              </div>
              <Skeleton className="h-3 w-2/3" rounded="md" />
              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <Skeleton className="h-2.5 w-32" rounded="md" />
                <Skeleton className="h-2.5 w-20" rounded="md" />
              </div>
            </div>
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
          Couldn&apos;t load ratings
        </h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  const total = summary?.total ?? 0;
  const avg = summary?.average ?? null;
  const distribution = summary?.distribution ?? [0, 0, 0, 0, 0];
  const maxBar = Math.max(1, ...distribution);

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
              Your ratings
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {total === 0
                ? "No ratings yet"
                : `You've rated ${total} driver${total === 1 ? "" : "s"}`}
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/80">
              {total === 0
                ? "Rate your driver after each trip to help future riders pick well."
                : "Your feedback shapes what other riders see when they get matched."}
            </p>
            {avg !== null && (
              <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rajlo-red text-white">
                  <Icon name="star" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Average given
                  </p>
                  <p className="text-2xl font-extrabold tracking-tight">
                    {avg.toFixed(1)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </FadeUp>

      {/* Distribution chart */}
      {total > 0 && (
        <FadeUp delay={0.06}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                <Icon name="activity" className="h-3.5 w-3.5" />
              </span>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Distribution
              </p>
            </div>
            <div className="space-y-2.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star - 1] ?? 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                const widthPct = (count / maxBar) * 100;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="inline-flex w-12 shrink-0 items-center gap-1 text-xs font-bold text-foreground">
                      {star}
                      <Icon name="star" className="h-3 w-3 text-rajlo-red" />
                    </span>
                    <div className="relative h-7 flex-1 overflow-hidden rounded-full bg-surface-soft">
                      <div
                        className="h-full rounded-full bg-rajlo-red transition-all"
                        style={{
                          width: `${Math.max(widthPct, count > 0 ? 6 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-bold text-muted">
                      {count} · {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </FadeUp>
      )}

      {/* Empty state */}
      {ratings.length === 0 && (
        <FadeUp delay={0.08}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="star" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              No ratings to show
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Take a ride and rate your driver — your feedback appears here.
            </p>
            <Link
              href="/rider/request"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              Book a ride
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </FadeUp>
      )}

      {/* Ratings list */}
      {ratings.length > 0 && (
        <div>
          <FadeUp delay={0.08}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight md:text-xl">
                Recent ratings
              </h2>
              <Link
                href="/rider/history"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-rajlo-red hover:bg-primary-soft"
              >
                Trip history
                <Icon name="arrow-right" className="h-3 w-3" />
              </Link>
            </div>
          </FadeUp>
          <div className="space-y-3">
            {ratings.map((r, i) => (
              <FadeUp key={r.id} delay={0.1 + i * 0.02}>
                <RatingRow row={r} />
              </FadeUp>
            ))}
            {hasMore && (
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
            {loadMoreError && (
              <p className="text-center text-xs font-semibold text-rajlo-red">
                {loadMoreError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Rating row ─────────── */

function RatingRow({ row }: { row: RatingRow }) {
  const dateLabel = new Date(row.createdAt).toLocaleString("en-JM", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link
      href={`/rider/history/${row.rideId}`}
      className="group block rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            Driver
          </p>
          <p className="mt-0.5 truncate text-sm font-extrabold tracking-tight">
            {row.driverName}
          </p>
        </div>
        <StarRow stars={row.stars} />
      </div>

      {(row.pickupName || row.dropoffName) && (
        <p className="mt-3 truncate text-xs text-muted">
          {row.pickupName ?? "Pickup"} → {row.dropoffName ?? "Dropoff"}
        </p>
      )}

      {row.comment && (
        <p className="mt-3 rounded-xl bg-surface-soft px-3 py-2 text-sm leading-relaxed text-foreground">
          “{row.comment}”
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <p className="text-[11px] font-semibold text-muted">{dateLabel}</p>
        <p className="inline-flex items-center gap-1 text-[11px] font-bold text-rajlo-red transition-transform group-hover:translate-x-0.5">
          View trip
          <Icon name="arrow-right" className="h-3 w-3" />
        </p>
      </div>
    </Link>
  );
}

function StarRow({ stars }: { stars: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      aria-label={`${stars} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          className={`h-4 w-4 ${n <= stars ? "text-rajlo-red" : "text-line"}`}
        />
      ))}
    </span>
  );
}
