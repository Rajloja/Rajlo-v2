"use client";

import { use, useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { MapView } from "@/components/map-view";
import { DriverVehicleCard } from "@/components/driver-vehicle-card";
import { Skeleton } from "@/components/skeleton";
import { useRidePosition } from "@/lib/use-ride-position";
import { type Place } from "@/lib/jamaica";

/**
 * Public trip-share page.
 *
 * Anyone with the URL can open this — the unguessable token in the path
 * is the only auth. We render a stripped-down view: pickup/dropoff,
 * status, driver name + plate, and the live driver/rider position.
 *
 * No login required, no PII beyond what the rider chose to share.
 */

type TripData = {
  rideId: string;
  status:
    | "requested"
    | "accepted"
    | "arrived"
    | "in_progress"
    | "completed"
    | "cancelled";
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  stops: Array<{
    position: number;
    name: string;
    lat: number;
    lng: number;
  }>;
  estimatedEtaMinutes: number | null;
  driver: {
    name: string;
    plateNumber: string | null;
    vehicle: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    vehicleColor: string | null;
    avatarUrl: string | null;
  } | null;
  recipientLabel: string | null;
};

const STATUS_LABELS: Record<TripData["status"], string> = {
  requested: "Looking for a driver",
  accepted: "Driver on the way",
  arrived: "Driver at pickup",
  in_progress: "On the way",
  completed: "Trip complete",
  cancelled: "Trip cancelled",
};

export default function TripSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<TripData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Live ETA in minutes derived from the most recent Directions
  // response the MapView fetched as the driver moves. Overrides the
  // server's `estimatedEtaMinutes` (which is frozen at request time
  // and never updates) so the trip-share viewer actually sees the
  // ETA tick down as the car approaches.
  const [liveEtaMinutes, setLiveEtaMinutes] = useState<number | null>(null);

  // Refresh on a slow timer so the friend's view gets status changes even
  // before the realtime channel pushes (we can't subscribe to RLS-protected
  // tables anonymously). Live driver position still flows through the
  // broadcast channel below — that's not gated by RLS.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/trip/${token}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Server returned ${res.status}`);
        }
        const json = (await res.json()) as TripData;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load trip.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();
    const interval = setInterval(refresh, 8_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  // Subscribe to the same broadcast channel the rider/driver use — anyone
  // with the channel name (= ride id) can subscribe. The rider already
  // knows we have it because they shared the link, so this is fine.
  const isLive =
    !!data &&
    ["accepted", "arrived", "in_progress"].includes(data.status);
  const { driverPosition, riderPosition } = useRidePosition(
    isLive ? data.rideId : null,
    "rider", // role doesn't matter when streamSelf is false; we only listen
    /* streamSelf */ false,
  );

  if (loading) {
    // Skeleton mirrors the real shape: top bar, dark hero, map block,
    // driver card, then the route list. Same vertical rhythm so the
    // moment data lands the layout doesn't shift.
    return (
      <div className="min-h-screen bg-surface-soft pb-12">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-2 py-3 backdrop-blur md:px-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <Logo size="sm" tagline />
            <Skeleton className="h-6 w-28" rounded="full" />
          </div>
        </header>
        <div className="mx-auto max-w-3xl space-y-4 px-2 pt-6 md:px-3">
          <div className="space-y-3 rounded-3xl bg-rajlo-black p-6 md:p-8">
            <Skeleton variant="dark" className="h-3 w-32" rounded="full" />
            <Skeleton variant="dark" className="h-9 w-3/4 max-w-md" rounded="lg" />
            <Skeleton variant="dark" className="h-4 w-32" rounded="md" />
          </div>
          <Skeleton className="h-72 w-full md:h-96" rounded="3xl" />
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12" rounded="full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3 max-w-48" rounded="md" />
                <Skeleton className="h-3 w-1/2 max-w-32" rounded="md" />
              </div>
            </div>
          </div>
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" rounded="md" />
              <Skeleton className="h-5 w-32" rounded="full" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8" rounded="full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-16" rounded="md" />
                  <Skeleton className="h-4 w-2/3 max-w-64" rounded="md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-soft px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
            <span aria-hidden className="text-3xl leading-none">😢</span>
          </span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
            Trip not available
          </h1>
          <p className="mt-2 text-sm text-muted">
            {error ?? "This share link may have expired or been revoked."}
          </p>
        </div>
      </div>
    );
  }

  const pickup: Place = {
    placeId: "",
    name: data.pickup.name,
    address: "",
    lat: data.pickup.lat,
    lng: data.pickup.lng,
    parish: null,
  };
  const dropoff: Place = {
    placeId: "",
    name: data.dropoff.name,
    address: "",
    lat: data.dropoff.lat,
    lng: data.dropoff.lng,
    parish: null,
  };
  // Multi-stop rides need each waypoint on the map AND in the route
  // list below. Map markers come from this array (ordered); route-list
  // letter labels are computed from the index in render below.
  const stops: Place[] = (data.stops ?? []).map((s) => ({
    placeId: "",
    name: s.name,
    address: "",
    lat: s.lat,
    lng: s.lng,
    parish: null,
  }));

  const isTerminal = data.status === "completed" || data.status === "cancelled";

  return (
    <div className="min-h-screen bg-surface-soft pb-12">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-2 py-3 backdrop-blur md:px-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Logo size="sm" tagline />
          <span className="rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold text-rajlo-red">
            Live trip share
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-2 pt-6 md:px-3">
        {/* Status hero */}
        <div
          className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-xl md:p-8 ${
            data.status === "in_progress" || data.status === "arrived"
              ? "bg-emerald-600 shadow-emerald-600/30"
              : data.status === "completed"
                ? "bg-emerald-700 shadow-emerald-700/30"
                : data.status === "cancelled"
                  ? "bg-rajlo-black shadow-rajlo-black/30"
                  : "bg-rajlo-red shadow-rajlo-red/30"
          }`}
        >
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
            {data.recipientLabel
              ? `Trip share for ${data.recipientLabel}`
              : "Trip share"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
            {STATUS_LABELS[data.status]}
          </h1>
          {/* Prefer the live ETA derived from the driver's current
             position; fall back to the server's frozen estimate if
             the live route hasn't returned yet. */}
          {(() => {
            const eta = liveEtaMinutes ?? data.estimatedEtaMinutes;
            if (eta === null || isTerminal) return null;
            return (
              <p className="mt-2 text-sm text-white/85">
                ETA ~{eta} min
                {liveEtaMinutes !== null && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
                    live
                  </span>
                )}
              </p>
            );
          })()}
        </div>

        {/* Map */}
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lg shadow-rajlo-red/[0.04]">
          <MapView
            pickup={pickup}
            stops={stops}
            dropoff={dropoff}
            driverPosition={driverPosition}
            riderPosition={riderPosition}
            // Engage the live-route polyline + Directions refresh so
            // the ETA recomputes as the driver moves. Pre-pickup
            // (accepted / arrived) → route driver→pickup; once the
            // trip starts → route driver→dropoff. Idle / terminal
            // states leave it null so we don't burn Directions API
            // quota on a frozen view.
            liveRoute={
              data.status === "accepted" || data.status === "arrived"
                ? { target: "pickup" }
                : data.status === "in_progress"
                  ? { target: "dropoff" }
                  : null
            }
            // Every time MapView re-fetches Directions (driver moved
            // 120m+, target flipped, etc.) it hands us the freshest
            // route. We extract the traffic-adjusted duration and
            // surface it as the live ETA.
            onDirectionsRoute={(route) => {
              const legSeconds = (route.legs ?? []).reduce(
                (sum, leg) =>
                  sum +
                  (leg.duration_in_traffic?.value ??
                    leg.duration?.value ??
                    0),
                0,
              );
              if (legSeconds > 0) {
                setLiveEtaMinutes(Math.max(1, Math.round(legSeconds / 60)));
              }
            }}
            className="h-72 w-full md:h-96"
          />
        </div>

        {/* Driver + vehicle card. Phone is intentionally NOT passed
           on the public share view — the rider shares "where I am",
           not "how to reach my driver". */}
        {data.driver && (
          <DriverVehicleCard
            name={data.driver.name}
            avatarUrl={data.driver.avatarUrl}
            plateNumber={data.driver.plateNumber}
            vehicleMake={data.driver.vehicleMake}
            vehicleModel={data.driver.vehicleModel}
            vehicleYear={data.driver.vehicleYear}
            vehicleColor={data.driver.vehicleColor}
          />
        )}

        {/* Pickup → stops → dropoff. Letter labels match the map
           markers: A = pickup, B/C/... = each stop, final letter =
           dropoff. Same convention as the rider history detail page.
           When there are intermediate stops we surface the count in the
           section header so the recipient can't miss that this is a
           multi-stop trip — that was missing before and people thought
           shared multi-stop rides only had pickup + dropoff. */}
        {(() => {
          const tripStops = data.stops ?? [];
          const stopCount = tripStops.length;
          const rows = [
            {
              key: "pickup",
              kind: "Pickup" as const,
              label: "A",
              name: data.pickup.name,
              dotClass: "bg-emerald-500",
            },
            ...tripStops.map((s, i) => ({
              key: `stop-${s.position}`,
              kind: `Stop ${i + 1} of ${stopCount}` as const,
              label: String.fromCharCode(66 + i),
              name: s.name,
              dotClass: "bg-rajlo-black",
            })),
            {
              key: "dropoff",
              kind: "Dropoff" as const,
              label: String.fromCharCode(66 + stopCount),
              name: data.dropoff.name,
              dotClass: "bg-rajlo-red",
            },
          ];
          return (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  Route
                </p>
                {stopCount > 0 && (
                  <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rajlo-red">
                    {stopCount} stop{stopCount === 1 ? "" : "s"} along the way
                  </span>
                )}
              </div>
              <ol className="relative space-y-4">
                {/* Vertical thread connecting the markers — purely decorative,
                   makes the multi-stop list read as a single route rather than
                   a stack of separate rows. */}
                <span
                  className="absolute left-[15px] top-3 bottom-3 w-px bg-line"
                  aria-hidden
                />
                {rows.map((r) => (
                  <li
                    key={r.key}
                    className="relative flex items-start gap-3"
                  >
                    <span
                      className={`relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white ${r.dotClass}`}
                    >
                      {r.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                        {r.kind}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-bold">
                        {r.name}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          );
        })()}

        <p className="text-center text-[11px] text-muted">
          You&apos;re viewing a Rajlo trip share. The link stops working when
          the trip ends.
        </p>
      </div>
    </div>
  );
}
