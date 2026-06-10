"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { RateDialog } from "@/components/rate-dialog";
import { RideCardSkeleton, StatsGridSkeleton } from "@/components/skeleton";
import { formatJMD } from "@/lib/jamaica";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

/**
 * Driver trip history. Mirror of the rider's history page in shape,
 * but oriented around the driver's perspective: rider names, the
 * rating the rider gave us, and a "page earnings" total at the top
 * for at-a-glance reassurance.
 */

type HistoryRow = {
  id: string;
  status: "completed" | "cancelled";
  pickup: { name: string; address: string };
  dropoff: { name: string; address: string };
  seats: number;
  fareJMD: number;
  requestedAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  cancellationReason: string | null;
  riderName: string;
  /** The rider's lifetime average rating (across all their trips). Null = no ratings yet. */
  riderRating: number | null;
  riderRatingCount: number;
  /** Stars the rider gave THIS driver for this trip. Null = rider didn't rate. */
  riderRatedStars: number | null;
  carpool: boolean;
};

type HistoryResponse = {
  rides: HistoryRow[];
  pagination: { hasMore: boolean };
  pageEarningsJMD: number;
};

// Aligned with the earnings page so a single prefetch entry warms
// both. Larger first page also means fewer "Load more" taps for the
// typical driver who scrolls a week or two of history.
const PAGE_SIZE = 50;
const FIRST_PAGE_URL = `/api/driver/rides/history?limit=${PAGE_SIZE}&offset=0`;

export default function DriverHistoryPage() {
  // Seed from the bottom-nav's prefetch cache so tab-switches into
  // /driver/history land on real rows instead of a skeleton.
  const cached = getCachedDriverData<HistoryResponse>(FIRST_PAGE_URL);
  const [rows, setRows] = useState<HistoryRow[]>(cached?.rides ?? []);
  const [pageEarnings, setPageEarnings] = useState(
    cached?.pageEarningsJMD ?? 0,
  );
  const [loading, setLoading] = useState(cached == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(cached?.pagination?.hasMore ?? false);
  const [offset, setOffset] = useState(cached?.rides?.length ?? 0);
  // The driver hasn't rated this rider yet — track which row is open
  // in the rate dialog. The driver can rate the rider at any time after
  // trip completion.
  const [rateTarget, setRateTarget] = useState<HistoryRow | null>(null);
  // The driver's local "I've rated them" state for rows in this
  // session. Server doesn't surface this back via the history feed
  // because that endpoint shows the OTHER party's ratings only — so
  // we track our own here. Keyed by ride_id.
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(FIRST_PAGE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        setRows(json.rides);
        setHasMore(json.pagination.hasMore);
        setOffset(json.rides.length);
        setPageEarnings(json.pageEarningsJMD);
        setCachedDriverData(FIRST_PAGE_URL, json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load history");
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
    try {
      const res = await fetch(
        `/api/driver/rides/history?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as HistoryResponse;
      setRows((prev) => [...prev, ...json.rides]);
      setHasMore(json.pagination.hasMore);
      setOffset((prev) => prev + json.rides.length);
      setPageEarnings((prev) => prev + json.pageEarningsJMD);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const completedCount = rows.filter((r) => r.status === "completed").length;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      <FadeUp>
        <div>
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Trip history
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
            Your driving log
          </h1>
          <p className="mt-1 text-sm text-muted">
            Completed and cancelled trips, with rider feedback when given.
          </p>
        </div>
      </FadeUp>

      {/* Quick-glance running total — the most-asked question on a
         driver dashboard is "how much have I made?", so put it where
         their eye lands first. */}
      {!loading && rows.length > 0 && (
        <FadeUp delay={0.05}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Earnings (loaded)
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-rajlo-red md:text-3xl">
                {formatJMD(pageEarnings)}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Trips
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
                {completedCount}
              </p>
            </div>
          </div>
        </FadeUp>
      )}

      {/* Loading — driver-history shape: stats strip first, then 4
         ride-card skeletons. Same vertical rhythm as the loaded view. */}
      {loading && (
        <>
          <StatsGridSkeleton count={2} />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <RideCardSkeleton key={i} />
            ))}
          </div>
        </>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <FadeUp delay={0.05}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="history" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              No trips yet
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Once you complete your first ride, it&apos;ll show up here.
            </p>
            <Link
              href="/driver"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              Back to dashboard
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </FadeUp>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => (
            <DriverHistoryCard
              key={r.id}
              row={r}
              myStars={myRatings[r.id] ?? null}
              onRate={() => setRateTarget(r)}
            />
          ))}

          {/* Mirror the rider history pattern: while paginating, render
             skeleton ride cards in the same shape as real rows so the
             list flows continuously instead of swapping a text label
             in and out of the button. */}
          {loadingMore &&
            [0, 1].map((i) => <RideCardSkeleton key={`more-${i}`} />)}
          {hasMore && !loadingMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={loadMore}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-surface-soft"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {rateTarget && (
        <RateDialog
          endpoint={`/api/driver/rides/${rateTarget.id}/rate`}
          title={`Rate ${rateTarget.riderName}`}
          subtitle="Driver feedback helps the platform flag risky riders."
          onClose={() => setRateTarget(null)}
          onSubmitted={(stars) => {
            // Stash locally so the row immediately shows "You rated · N"
            // without us needing to refetch the whole page.
            setMyRatings((prev) => ({ ...prev, [rateTarget.id]: stars }));
          }}
        />
      )}
    </div>
  );
}

function DriverHistoryCard({
  row,
  myStars,
  onRate,
}: {
  row: HistoryRow;
  myStars: number | null;
  onRate: () => void;
}) {
  const dateLabel = row.endedAt
    ? new Date(row.endedAt).toLocaleString("en-JM", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  const cancelled = row.status === "cancelled";

  return (
    <Link
      id={`trip-${row.id}`}
      href={`/driver/history/${row.id}`}
      className="rajlo-deep-link-target scroll-mt-6 block rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-rajlo-red/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                cancelled
                  ? "bg-rajlo-black/10 text-foreground"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {cancelled ? "Cancelled" : "Completed"}
            </span>
            {row.carpool && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                <Icon name="users" className="h-3 w-3" />
                Carpool
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{dateLabel}</p>
        </div>
        <p
          className={`text-lg font-extrabold tracking-tight ${
            cancelled ? "text-muted line-through" : "text-rajlo-red"
          }`}
        >
          {formatJMD(row.fareJMD)}
        </p>
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="flex items-start gap-3">
          <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-[10px] font-extrabold text-white">
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{row.pickup.name}</p>
            <p className="truncate text-xs text-muted">{row.pickup.address}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red text-[10px] font-extrabold text-white">
            B
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{row.dropoff.name}</p>
            <p className="truncate text-xs text-muted">{row.dropoff.address}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">
              Rider · {row.riderName}
            </p>
            {row.riderRating !== null && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                <Icon name="star" className="h-3 w-3 text-rajlo-red" />
                {row.riderRating.toFixed(1)} · {row.riderRatingCount} rating
                {row.riderRatingCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
          {/* What the rider gave us. */}
          {row.riderRatedStars !== null ? (
            <p className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-rajlo-red">
              <Icon name="star" className="h-3.5 w-3.5" />
              They rated · {row.riderRatedStars}
            </p>
          ) : row.status === "completed" ? (
            <span className="shrink-0 text-[11px] font-semibold text-muted">
              No rating from rider
            </span>
          ) : null}
        </div>

        {/* Driver's own rate-the-rider control. Only shown for
            completed trips. Hides itself once we've rated locally
            (myStars). */}
        {row.status === "completed" && (
          <div className="flex items-center justify-end">
            {myStars !== null ? (
              <p className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                <Icon name="star" className="h-3 w-3" />
                You rated · {myStars}
              </p>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  // Don't navigate to the detail page when the user
                  // taps Rate — open the inline rate dialog instead.
                  e.preventDefault();
                  e.stopPropagation();
                  onRate();
                }}
                className="inline-flex items-center gap-1 rounded-full border border-rajlo-red/40 bg-primary-soft px-3 py-1 text-[11px] font-bold text-rajlo-red transition-colors hover:bg-rajlo-red hover:text-white"
              >
                <Icon name="star" className="h-3 w-3" />
                Rate rider
              </button>
            )}
          </div>
        )}
      </div>

      {cancelled && row.cancellationReason && (
        <p className="mt-3 rounded-xl bg-surface-soft px-3 py-2 text-xs text-muted">
          {row.cancellationReason}
        </p>
      )}
    </Link>
  );
}
