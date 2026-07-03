"use client";

import Link from "next/link";
import { LiveTripMap } from "@/components/live-trip-map";
import { Icon } from "@/components/icons";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * Live trips — admin ops surface.
 *
 * Renders every in-flight trip (private rides + route hails) with a
 * live map per trip showing pickup, dropoff, AND the current driver
 * + rider positions. Used by support / ops to spot stalled drivers,
 * verify that a rider's hail is being picked up, and intervene
 * during incidents.
 *
 * Data flow:
 *   - The list itself polls /api/admin/live-trips every 8 seconds
 *     so newly-accepted trips appear quickly and completed ones drop
 *     off without a refresh.
 *   - Each individual map subscribes to the realtime channel
 *     `ride:<tripId>:position` to overlay live GPS broadcasts on
 *     top of the cached starting positions from the API. For private
 *     rides this is where the driver's car icon comes from. For
 *     route-taxi hails (which don't currently broadcast per-hail)
 *     we fall back to the cached driver_sessions.current_* coords.
 */

type Pos = { lat: number; lng: number } | null;

type LiveTrip = {
  id: string;
  kind: "private" | "route_taxi";
  status: string;
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
  dropoffName: string;
  dropoffLat: number;
  dropoffLng: number;
  riderName: string;
  driverName: string;
  driverPlate: string | null;
  driverPosition: Pos;
  fareJmd: number;
  acceptedAt: string | null;
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  accepted: { bg: "bg-amber-50", text: "text-amber-800", label: "Accepted" },
  arrived: { bg: "bg-emerald-50", text: "text-emerald-700", label: "At pickup" },
  in_progress: { bg: "bg-emerald-100", text: "text-emerald-700", label: "On trip" },
  picked_up: { bg: "bg-emerald-100", text: "text-emerald-700", label: "On trip" },
};

export default function AdminLiveTripsPage() {
  const live = useLiveQuery<{ trips: LiveTrip[] }>(
    "/api/admin/live-trips",
    { interval: 8_000 },
  );
  const trips = live.data?.trips ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-2 md:px-3 md:py-8">
      {/* ─── Hero ─── */}
      <div className="rounded-3xl border border-line bg-surface p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Live operations
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              Live trips
            </h1>
            <p className="mt-1 text-sm text-muted">
              Every trip in progress right now — private rides and route taxi
              hails. Maps update every few seconds.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-rajlo-black px-4 py-3 text-center text-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">
              In flight
            </p>
            <p className="text-3xl font-extrabold tabular-nums">
              {live.loading && trips.length === 0 ? "—" : trips.length}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Body ─── */}
      {live.loading && trips.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center text-sm text-muted">
          Loading active trips…
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <p className="text-base font-semibold">No trips in flight right now.</p>
          <p className="mt-2 text-sm text-muted">
            Trips appear here the moment a driver accepts. Refresh in a few
            seconds.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {trips.map((t) => (
            <TripCard key={`${t.kind}-${t.id}`} trip={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One card per active trip. Wraps MapView with the live position
 * subscription so the driver marker tracks in real time. Falls back
 * to the cached `driverPosition` from the API when realtime hasn't
 * delivered a fix yet (or never will, for route-taxi hails which
 * don't broadcast per-hail today).
 */
function TripCard({ trip }: { trip: LiveTrip }) {
  const statusStyle = STATUS_STYLES[trip.status] ?? {
    bg: "bg-surface-soft",
    text: "text-muted",
    label: trip.status,
  };

  // "N min ago" display. We read Date.now() during render which the
  // React 19 purity rule flags, but the parent page polls this list
  // every 8 seconds — every poll triggers a re-render that recomputes
  // this value, so it stays current without needing a timer of its
  // own. The rule's worry (stale display because Date.now() captured
  // once never updates) doesn't apply here.
  const acceptedMins = trip.acceptedAt
    ? Math.max(
        0,
        // eslint-disable-next-line react-hooks/purity
        Math.floor((Date.now() - new Date(trip.acceptedAt).getTime()) / 60_000),
      )
    : null;

  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
      {/* Header strip */}
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text}`}
            >
              {statusStyle.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              {trip.kind === "private" ? "Private ride" : "Route taxi"}
            </span>
            {acceptedMins !== null && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {acceptedMins} min ago
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-semibold">
            {trip.pickupName} → {trip.dropoffName}
          </p>
        </div>
        <p className="shrink-0 text-base font-extrabold text-rajlo-red tabular-nums">
          {formatJMD(trip.fareJmd)}
        </p>
      </div>

      {/* Map */}
      <LiveTripMap
        rideId={trip.id}
        pickupName={trip.pickupName}
        pickupLat={trip.pickupLat}
        pickupLng={trip.pickupLng}
        dropoffName={trip.dropoffName}
        dropoffLat={trip.dropoffLat}
        dropoffLng={trip.dropoffLng}
        cachedDriverPosition={trip.driverPosition}
      />

      {/* Parties row */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        <div className="rounded-2xl border border-line bg-surface-soft px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Rider
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">{trip.riderName}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-soft px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Driver
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">{trip.driverName}</p>
          {trip.driverPlate && (
            <p className="text-[11px] font-mono uppercase tracking-wider text-rajlo-red">
              {trip.driverPlate}
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
        <span className="font-mono uppercase">{trip.id.slice(0, 8)}</span>
        <Link
          href={
            trip.kind === "private"
              ? `/admin/ride-monitoring?q=${trip.id.slice(0, 8)}`
              : `/admin/route-sessions`
          }
          className="inline-flex items-center gap-1 font-bold text-rajlo-red hover:underline"
        >
          Open in admin
          <Icon name="arrow-right" className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}
