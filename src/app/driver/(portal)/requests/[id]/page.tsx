"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { HeroSkeleton, MapSkeleton, Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { MapView } from "@/components/map-view";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD, type Place } from "@/lib/jamaica";

/**
 * /driver/requests/[id] — full ride-request detail before accepting.
 *
 * Drivers tap a request card on /driver/requests, land here, and
 * see EVERYTHING about the trip:
 *
 *   - The route on a map (pickup → stops → dropoff, real Google Map)
 *   - Each waypoint listed with parish + address
 *   - Rider's first name + rating + completed-trip count
 *   - Carpool partner's route too, when applicable
 *   - Fare, distance, ETA, seats
 *   - Payment method (wallet — riders pre-fund + auto-debit on
 *     completion)
 *   - Rider's note
 *
 * The "Accept ride" button is the same call as the inbox card —
 * navigates to /driver/active-trip on success. A 410 from the API
 * (someone else accepted, or the request expired) gets a clear
 * "this request was taken" overlay with a back-to-list link.
 *
 * Live-polled at 8s so a request that gets snapped up by another
 * driver flips the page state without the driver having to refresh.
 */

type Place3 = {
  name: string;
  address: string;
  parish: string | null;
  lat: number;
  lng: number;
};

type Detail = {
  ride: {
    id: string;
    status: string;
    pickup: Place3;
    dropoff: Place3;
    stops: Array<{
      position: number;
      name: string;
      address: string;
      lat: number;
      lng: number;
      parish: string | null;
    }>;
    seats: number;
    notes: string | null;
    estimatedFareJmd: number;
    estimatedDistanceKm: number | null;
    estimatedEtaMinutes: number | null;
    requestedAt: string;
    expiresAt: string | null;
    carpoolGroupId: string | null;
    carpoolRole: "primary" | "secondary" | null;
    distanceFromDriverKm: number | null;
  };
  rider: {
    id: string;
    firstName: string;
    averageRating: number | null;
    ratingCount: number;
    completedTrips: number;
  };
  partner: null | {
    rideId: string;
    carpoolRole: "primary" | "secondary" | null;
    riderName: string;
    pickup: Place3;
    dropoff: Place3;
    seats: number;
    fareJmd: number;
  };
  payment: { method: "wallet" };
};

export default function DriverRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  // Fetch + auto-refresh every 8s. If the API flips to 410 because
  // another driver grabbed it, useLiveQuery surfaces that as `error`
  // and we render the "request taken" panel below.
  const query = useLiveQuery<Detail>(id ? `/api/driver/requests/${id}` : null, {
    interval: 8_000,
  });

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const accept = async () => {
    if (!id) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch(`/api/driver/rides/${id}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Server returned ${res.status}`);
      }
      router.push("/driver/active-trip");
    } catch (e) {
      setAcceptError(
        e instanceof Error
          ? e.message
          : "Couldn't accept that ride — someone else may have grabbed it.",
      );
    } finally {
      setAccepting(false);
    }
  };

  if (query.loading && !query.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-2 py-4 md:px-3 md:py-8">
        <HeroSkeleton />
        <MapSkeleton className="h-72 w-full md:h-96" />
        <Skeleton className="h-40 w-full" rounded="2xl" />
        <Skeleton className="h-32 w-full" rounded="2xl" />
      </div>
    );
  }
  if (query.error || !query.data) {
    // "This request is no longer open" — render a friendly bounce.
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-rajlo-red">
          <Icon name="alert-triangle" className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Request unavailable
        </h1>
        <p className="mt-2 text-sm text-muted">
          {query.error ??
            "Another driver may have picked this one up — head back to the live list to see what's still open."}
        </p>
        <Link
          href="/driver/requests"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
        >
          Back to live requests
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Carpool was retired from the driver UI. We keep the original
  // partner type from the API payload so all `if (partner)` conditional
  // branches below still type-check, but route the value through a
  // helper that returns `null` regardless of what the backend sent —
  // every solo branch renders, no carpool branch ever does.
  const { ride, rider, payment } = query.data;
  const stripCarpoolPartner = (
    p: typeof query.data.partner,
  ): typeof query.data.partner => {
    // Argument intentionally unused; lint silencer.
    void p;
    return null;
  };
  const partner = stripCarpoolPartner(query.data.partner);
  const elapsedMin = Math.max(
    0,
    Math.floor((Date.now() - new Date(ride.requestedAt).getTime()) / 60_000),
  );

  // Build the Place objects MapView needs. We unify primary + carpool
  // partner stops into a single list so the map shows the full route
  // a driver would actually drive (primary pickup → secondary pickup
  // → primary dropoff → secondary dropoff is the typical order, but
  // the matcher decides — we render whatever's in stops[]).
  const pickup: Place = placeFrom(ride.pickup);
  const dropoff: Place = placeFrom(ride.dropoff);
  const allStops: Place[] = ride.stops.map((s) =>
    placeFrom({
      name: s.name,
      address: s.address,
      parish: s.parish,
      lat: s.lat,
      lng: s.lng,
    }),
  );
  if (partner) {
    // Drop the partner's pickup as a stop in the middle.
    allStops.push(placeFrom(partner.pickup));
  }

  const totalFare = partner
    ? ride.estimatedFareJmd + partner.fareJmd
    : ride.estimatedFareJmd;
  const totalSeats = partner ? ride.seats + partner.seats : ride.seats;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-3 md:px-3 md:py-8">
      <Link
        href="/driver/requests"
        className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-rajlo-red"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
        Back to live requests
      </Link>

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
              <span className="rounded-full bg-rajlo-red px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                {partner ? "Carpool · 2 riders" : "Solo ride"}
              </span>
              <LiveIndicator
                variant="dark"
                lastUpdated={query.lastUpdated}
                refreshing={query.refreshing}
                onRefresh={query.refresh}
              />
              {elapsedMin <= 1 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  New
                </span>
              ) : (
                <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                  {elapsedMin}m waiting
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {ride.pickup.name} <span className="text-white/60">→</span>{" "}
              {ride.dropoff.name}
            </h1>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
              <HeroStat label="Fare" value={formatJMD(totalFare)} accent />
              <HeroStat label="Seats" value={String(totalSeats)} />
              <HeroStat
                label="Trip distance"
                value={
                  ride.estimatedDistanceKm !== null
                    ? `${ride.estimatedDistanceKm.toFixed(1)} km`
                    : "—"
                }
              />
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Map — real route preview */}
      <FadeUp delay={0.05}>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <MapView
            viewer="driver"
            pickup={pickup}
            stops={allStops}
            dropoff={dropoff}
            className="h-72 w-full md:h-96"
          />
          <div className="border-t border-line bg-surface-soft px-5 py-3 text-[11px] text-muted">
            {ride.distanceFromDriverKm !== null ? (
              <>
                Pickup is{" "}
                <span className="font-extrabold text-rajlo-red">
                  {ride.distanceFromDriverKm.toFixed(1)} km
                </span>{" "}
                from your last drop-off.{" "}
                {ride.estimatedEtaMinutes !== null && (
                  <>
                    Estimated trip time:{" "}
                    <span className="font-extrabold text-foreground">
                      {ride.estimatedEtaMinutes}m
                    </span>
                    .
                  </>
                )}
              </>
            ) : (
              "Distance from you is unknown — start a trip to enable live distance."
            )}
          </div>
        </div>
      </FadeUp>

      {/* Route detail */}
      <FadeUp delay={0.07}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Route
          </p>
          <ol className="relative mt-4 space-y-4">
            <span
              className="absolute left-[15px] top-3 bottom-3 w-px bg-line"
              aria-hidden
            />
            <RouteRow
              label="A"
              tone="emerald"
              kind="Pickup"
              place={ride.pickup}
            />
            {ride.stops.map((s, i) => (
              <RouteRow
                key={`stop-${s.position}`}
                label={String.fromCharCode(66 + i)}
                tone="black"
                kind={`Stop ${i + 1}`}
                place={{
                  name: s.name,
                  address: s.address,
                  parish: s.parish,
                  lat: s.lat,
                  lng: s.lng,
                }}
              />
            ))}
            {partner && (
              <RouteRow
                label={String.fromCharCode(66 + ride.stops.length)}
                tone="amber"
                kind="Second pickup"
                place={partner.pickup}
                extraBadge={`Carpool · ${partner.riderName}`}
              />
            )}
            <RouteRow
              label={String.fromCharCode(
                66 + ride.stops.length + (partner ? 1 : 0),
              )}
              tone="red"
              kind={partner ? "First dropoff" : "Dropoff"}
              place={ride.dropoff}
            />
            {partner && (
              <RouteRow
                label={String.fromCharCode(67 + ride.stops.length + 1)}
                tone="red"
                kind="Second dropoff"
                place={partner.dropoff}
                extraBadge={`Carpool · ${partner.riderName}`}
              />
            )}
          </ol>
        </div>
      </FadeUp>

      {/* Rider card */}
      <FadeUp delay={0.09}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Rider
          </p>
          <div className="mt-3 flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-soft text-base font-extrabold text-rajlo-red">
              {rider.firstName[0]?.toUpperCase() ?? "R"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold tracking-tight">
                {rider.firstName}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                {rider.averageRating !== null ? (
                  <span className="inline-flex items-center gap-1 font-bold text-foreground">
                    <Icon name="star" className="h-3 w-3 text-rajlo-red" />
                    {rider.averageRating.toFixed(1)} · {rider.ratingCount}{" "}
                    rating{rider.ratingCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                    New rider
                  </span>
                )}
                <span>
                  {rider.completedTrips} completed trip
                  {rider.completedTrips === 1 ? "" : "s"}
                </span>
              </p>
            </div>
          </div>
          {partner && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px]">
              <p className="font-extrabold text-amber-800">Carpool partner</p>
              <p className="mt-0.5 text-amber-900">
                {partner.riderName} is sharing this ride.
              </p>
            </div>
          )}
        </div>
      </FadeUp>

      {/* Fare + payment */}
      <FadeUp delay={0.11}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Fare + payment
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <FareRow
              label="Trip fare"
              value={formatJMD(ride.estimatedFareJmd)}
            />
            {partner && (
              <FareRow
                label={`Carpool partner (${partner.riderName})`}
                value={formatJMD(partner.fareJmd)}
              />
            )}
            <FareRow
              label="Total to driver"
              value={formatJMD(totalFare)}
              emphasise
            />
          </ul>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-soft px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <Icon name="wallet" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold tracking-tight">
                Payment · Rajlo wallet
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {payment.method === "wallet"
                  ? "Funds are pre-loaded in the rider's wallet — your earnings credit automatically when you tap Complete."
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Rider note */}
      {ride.notes && (
        <FadeUp delay={0.13}>
          <div className="rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Note from rider
            </p>
            <p className="mt-2 text-sm leading-relaxed">{ride.notes}</p>
          </div>
        </FadeUp>
      )}

      {acceptError && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {acceptError}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-2 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur md:-mx-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-xs font-bold text-muted">
            {elapsedMin}m since rider tapped book
          </p>
          <button
            type="button"
            onClick={accept}
            disabled={accepting}
            className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:-translate-y-0"
          >
            {accepting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon name="check-circle" className="h-4 w-4" />
            )}
            {accepting ? "Accepting…" : `Accept · ${formatJMD(totalFare)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── pieces ─────────── */

function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
        {label}
      </p>
      <p
        className={`mt-0.5 text-xl font-extrabold tracking-tight md:text-2xl ${
          accent ? "text-rajlo-red" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function RouteRow({
  label,
  tone,
  kind,
  place,
  extraBadge,
}: {
  label: string;
  tone: "emerald" | "red" | "black" | "amber";
  kind: string;
  place: Place3;
  extraBadge?: string;
}) {
  const dot =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "red"
      ? "bg-rajlo-red"
      : tone === "amber"
      ? "bg-amber-500"
      : "bg-rajlo-black";
  return (
    <li className="relative flex items-start gap-3">
      <span
        className={`relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white ${dot}`}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          {kind}
          {place.parish && (
            <span className="ml-1 normal-case tracking-normal text-muted/70">
              · {place.parish}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm font-extrabold">{place.name}</p>
        <p className="mt-0.5 text-xs text-muted">{place.address}</p>
        {extraBadge && (
          <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
            {extraBadge}
          </p>
        )}
      </div>
    </li>
  );
}

function FareRow({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={emphasise ? "font-extrabold" : "text-muted"}>
        {label}
      </span>
      <span
        className={
          emphasise
            ? "text-base font-extrabold tracking-tight text-rajlo-red md:text-lg"
            : "font-bold"
        }
      >
        {value}
      </span>
    </li>
  );
}

function placeFrom(p: Place3): Place {
  return {
    placeId: "",
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    parish: p.parish,
  };
}
