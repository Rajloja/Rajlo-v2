"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { MapView } from "@/components/map-view";
import { RateDialog } from "@/components/rate-dialog";
import { HeroSkeleton, MapSkeleton, Skeleton } from "@/components/skeleton";
import { formatJMD, type Place } from "@/lib/jamaica";

/**
 * Driver-side trip detail. Mirror of the rider's
 * /rider/history/[rideId] but flipped: shows the RIDER's profile +
 * their rating of the driver instead of the other way round, plus a
 * "Rate the rider" CTA for completed trips that the driver hasn't
 * yet rated.
 */

type RideStatus =
  | "requested"
  | "accepted"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

type RideDetail = {
  id: string;
  status: RideStatus;
  pickup: { name: string; address: string; lat: number; lng: number };
  dropoff: { name: string; address: string; lat: number; lng: number };
  stops: {
    position: number;
    name: string;
    address: string;
    lat: number;
    lng: number;
  }[];
  seats: number;
  notes: string | null;
  fareJMD: number;
  estimatedDistanceKm: number | null;
  estimatedEtaMinutes: number | null;
  timeline: {
    requestedAt: string | null;
    acceptedAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  };
  cancellationReason: string | null;
};

type RiderInfo = {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  rating: number | null;
  ratingCount: number;
};

type DetailResponse = {
  ride: RideDetail;
  rider: RiderInfo | null;
  riderRating: { stars: number; comment: string | null } | null;
  driverRating: { stars: number; comment: string | null } | null;
};

const STATUS_HERO: Record<
  RideStatus,
  { eyebrow: string; tone: "emerald" | "amber" | "red" | "black" }
> = {
  requested: { eyebrow: "Looking for you", tone: "red" },
  accepted: { eyebrow: "Heading to pickup", tone: "amber" },
  arrived: { eyebrow: "At pickup", tone: "emerald" },
  in_progress: { eyebrow: "Trip in progress", tone: "emerald" },
  completed: { eyebrow: "Trip complete", tone: "emerald" },
  cancelled: { eyebrow: "Trip cancelled", tone: "black" },
};

export default function DriverHistoryDetailPage({
  params,
}: {
  params: Promise<{ rideId: string }>;
}) {
  const { rideId } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `?rate=1` arrives from the post-trip push notification — auto-open
  // the rate dialog. Lazy initial state to avoid React 19's setState-
  // in-effect rule.
  const [rateOpen, setRateOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("rate") === "1";
  });
  // Local rating state — once the driver rates from this page, hide
  // the CTA so they don't tap it twice.
  const [myStars, setMyStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/driver/rides/${rideId}`);
        if (!res.ok) throw new Error("Couldn't load this trip.");
        const json = (await res.json()) as DetailResponse;
        if (cancelled) return;
        setData(json);
        if (json.driverRating) {
          setMyStars(json.driverRating.stars);
          setRateOpen(false);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load this trip.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  // Build Places for the map. Stable refs so the polyline doesn't blink.
  const pickup: Place | null = useMemo(() => {
    if (!data?.ride) return null;
    return {
      placeId: `${data.ride.id}-pickup`,
      name: data.ride.pickup.name,
      address: data.ride.pickup.address,
      lat: data.ride.pickup.lat,
      lng: data.ride.pickup.lng,
      parish: null,
    };
  }, [data?.ride]);
  const dropoff: Place | null = useMemo(() => {
    if (!data?.ride) return null;
    return {
      placeId: `${data.ride.id}-dropoff`,
      name: data.ride.dropoff.name,
      address: data.ride.dropoff.address,
      lat: data.ride.dropoff.lat,
      lng: data.ride.dropoff.lng,
      parish: null,
    };
  }, [data?.ride]);
  const stopsPlaces: Place[] = useMemo(() => {
    if (!data?.ride) return [];
    return data.ride.stops.map((s) => ({
      placeId: `${data.ride.id}-stop-${s.position}`,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      parish: null,
    }));
  }, [data?.ride]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
        <Skeleton className="h-5 w-40" rounded="full" />
        <HeroSkeleton />
        <MapSkeleton className="h-[42vh] min-h-72 w-full md:h-[50vh] md:max-h-130" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md  py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">
            😢
          </span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Trip not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "This trip may have been deleted, or wasn't yours."}
        </p>
        <Link
          href="/driver/history"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
        >
          Back to history
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const { ride, rider, riderRating } = data;
  const hero = STATUS_HERO[ride.status];
  const heroBg =
    hero.tone === "emerald"
      ? "from-emerald-700 via-rajlo-black to-rajlo-black"
      : hero.tone === "amber"
      ? "from-amber-700 via-rajlo-black to-rajlo-black"
      : hero.tone === "red"
      ? "from-rajlo-red via-[#c00d0c] to-rajlo-black"
      : "from-rajlo-black via-rajlo-black to-[#1a1d10]";

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      <Link
        href="/driver/history"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted hover:text-rajlo-red"
      >
        <Icon name="arrow-right" className="h-3 w-3 rotate-180" />
        Back to history
      </Link>

      {/* Hero */}
      <FadeUp>
        <div
          className={`relative overflow-hidden rounded-3xl bg-linear-to-br p-6 text-white shadow-2xl md:p-8 ${heroBg}`}
        >
          <ArcWatermark
            size={420}
            variant="red"
            className="absolute -right-20 -bottom-32 opacity-[0.18]"
          />
          <div className="relative space-y-3">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/75">
              {hero.eyebrow}
            </p>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {ride.pickup.name} → {ride.dropoff.name}
            </h1>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-white/80">
              <span className="text-2xl font-extrabold text-white tabular-nums">
                {formatJMD(ride.fareJMD)}
              </span>
              {ride.estimatedDistanceKm && (
                <span>{ride.estimatedDistanceKm.toFixed(1)} km</span>
              )}
              {ride.seats > 1 && (
                <span>
                  {ride.seats} seat{ride.seats === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {ride.cancellationReason && (
              <p className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/85">
                Cancellation reason: {ride.cancellationReason}
              </p>
            )}
          </div>
        </div>
      </FadeUp>

      {/* Map */}
      <FadeUp delay={0.05}>
        {pickup && dropoff && (
          <MapView
            viewer="driver"
            pickup={pickup}
            stops={stopsPlaces}
            dropoff={dropoff}
            driverPosition={null}
            riderPosition={null}
            className="h-[42vh] min-h-72 w-full rounded-3xl md:h-[50vh] md:max-h-130"
          />
        )}
      </FadeUp>

      {/* Timeline */}
      <FadeUp delay={0.08}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            Timeline
          </p>
          <ol className="mt-3 space-y-2.5 text-sm">
            <TimelineRow label="Requested" ts={ride.timeline.requestedAt} />
            <TimelineRow label="You accepted" ts={ride.timeline.acceptedAt} />
            <TimelineRow
              label="Arrived at pickup"
              ts={ride.timeline.arrivedAt}
            />
            <TimelineRow label="Started trip" ts={ride.timeline.startedAt} />
            {ride.timeline.completedAt && (
              <TimelineRow label="Completed" ts={ride.timeline.completedAt} />
            )}
            {ride.timeline.cancelledAt && (
              <TimelineRow label="Cancelled" ts={ride.timeline.cancelledAt} />
            )}
          </ol>
        </div>
      </FadeUp>

      {/* Rider card */}
      {rider && (
        <FadeUp delay={0.1}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-soft text-rajlo-red">
                  <Icon name="user" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Rider
                  </p>
                  <p className="truncate text-base font-extrabold">
                    {rider.name}
                  </p>
                  {rider.rating !== null && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted">
                      <Icon name="star" className="h-3 w-3 text-rajlo-red" />
                      {rider.rating.toFixed(1)} · {rider.ratingCount} rating
                      {rider.ratingCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>
              {/* No call button on historical trips — driver shouldn't
                  reach out to the rider once the ride has ended.
                  Live-trip chat remains the only contact channel and
                  closes when the trip transitions to completed. */}
            </div>
          </div>
        </FadeUp>
      )}

      {/* Ratings row */}
      {ride.status === "completed" && (
        <FadeUp delay={0.12}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              Ratings
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-soft p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  They rated you
                </p>
                {riderRating ? (
                  <>
                    <p className="mt-1 inline-flex items-center gap-1 text-base font-extrabold text-rajlo-red">
                      <Icon name="star" className="h-4 w-4" />
                      {riderRating.stars} / 5
                    </p>
                    {riderRating.comment && (
                      <p className="mt-2 text-xs italic text-muted">
                        &ldquo;{riderRating.comment}&rdquo;
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted">No rating yet.</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface-soft p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  You rated them
                </p>
                {myStars !== null ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-base font-extrabold text-emerald-700">
                    <Icon name="star" className="h-4 w-4" />
                    {myStars} / 5
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRateOpen(true)}
                    className="mt-2 inline-flex items-center gap-1 rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover"
                  >
                    <Icon name="star" className="h-3 w-3" />
                    Rate rider
                  </button>
                )}
              </div>
            </div>
          </div>
        </FadeUp>
      )}

      {/* Notes (rider's notes to the driver, if any) */}
      {ride.notes && (
        <FadeUp delay={0.14}>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              Rider&apos;s notes
            </p>
            <p className="mt-2 text-sm text-foreground">{ride.notes}</p>
          </div>
        </FadeUp>
      )}

      {/* Rate dialog — only mounted while open. Matches the existing
          pattern in /driver/history. */}
      {ride.status === "completed" && rider && rateOpen && (
        <RateDialog
          endpoint={`/api/driver/rides/${ride.id}/rate`}
          title={`Rate ${rider.name}`}
          subtitle="Driver feedback helps the platform flag risky riders."
          onClose={() => setRateOpen(false)}
          onSubmitted={(stars: number) => {
            setMyStars(stars);
            setRateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TimelineRow({ label, ts }: { label: string; ts: string | null }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="tabular-nums text-xs text-muted">
        {ts
          ? new Date(ts).toLocaleString("en-JM", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })
          : "—"}
      </span>
    </li>
  );
}
