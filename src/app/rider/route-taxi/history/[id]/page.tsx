"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { MapView } from "@/components/map-view";
import { formatJMD, type Place } from "@/lib/jamaica";

/**
 * /rider/route-taxi/history/[id]
 *
 * Read-only detail / receipt for a settled (or cancelled) route taxi
 * hail. Mirrors the rider's private-ride detail page in shape but
 * tailored to the route taxi data model: TA fare, regulated corridor,
 * concession flag, no rating (until route-hail rating ships).
 *
 * Fetches the same /api/rider/route-taxi/hails/[id] endpoint the live
 * page uses — different render, same source of truth.
 */

type HailStatus =
  | "requested"
  | "accepted"
  | "picked_up"
  | "completed"
  | "cancelled"
  | "no_show";

type Hail = {
  id: string;
  status: HailStatus;
  pickup: string;
  pickupLat: number;
  pickupLng: number;
  dropoff: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceKm: number;
  fareJmd: number;
  concession: boolean;
  requestedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  commissionJmd: number | null;
  driverEarningsJmd: number | null;
  journeyId: string | null;
  legOrder: number | null;
  isTransferLeg: boolean;
  session: null | {
    driver: null | {
      firstName: string | null;
      lastName: string | null;
      plateNumber: string | null;
      vehicleMake: string | null;
      vehicleModel: string | null;
      vehicleColor: string | null;
    };
  };
  route: null | {
    origin: string;
    destination: string;
    parish: string | null;
    distanceKm: number;
    taFareJmd: number;
  };
};

type Payload = { hail: Hail; walletBalanceJmd: number | null };

type JourneyLegSummary = {
  hailId: string;
  legOrder: number | null;
  isTransferLeg: boolean;
  status: string;
  pickup: { name: string };
  dropoff: { name: string };
  fareJmd: number;
};
type JourneyBreakdown = {
  journey: {
    id: string;
    status: "planning" | "active" | "completed" | "cancelled";
    origin: string;
    destination: string;
    totalFareJmd: number;
    settledFareJmd: number;
    refundedFareJmd: number;
    plannedLegCount: number;
    completedLegCount: number;
  };
  legs: JourneyLegSummary[];
};

export default function RouteTaxiHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [journey, setJourney] = useState<JourneyBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rider/route-taxi/hails/${id}`);
        if (res.status === 404) {
          if (!cancelled) {
            setError("This trip isn't yours, or it's been removed.");
          }
          return;
        }
        if (!res.ok) throw new Error("Couldn't load trip");
        const json = (await res.json()) as Payload;
        if (cancelled) return;
        setData(json);

        // If this hail is part of a multi-leg journey, pull the whole
        // journey so we can render the per-leg fare breakdown. Best-
        // effort — single-leg view still works if the fetch fails.
        if (json.hail.journeyId) {
          try {
            const jr = await fetch(
              `/api/rider/route-taxi/journeys/${json.hail.journeyId}`,
            );
            if (jr.ok && !cancelled) {
              setJourney((await jr.json()) as JourneyBreakdown);
            }
          } catch {
            /* skip — receipt still useful without journey context */
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load trip");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-5 pb-12">
        <Skeleton className="h-44 w-full" rounded="3xl" />
        <Skeleton className="h-72 w-full" rounded="3xl" />
        <Skeleton className="h-32 w-full" rounded="3xl" />
        <Skeleton className="h-28 w-full" rounded="3xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-3xl border border-rajlo-red/30 bg-primary-soft p-7 text-center md:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rajlo-red text-white shadow-md shadow-rajlo-red/25">
          <Icon name="alert-triangle" className="h-6 w-6" />
        </span>
        <p className="mt-4 text-base font-extrabold tracking-tight text-rajlo-black">
          We couldn&apos;t load this trip
        </p>
        <p className="mt-1 text-xs text-rajlo-black/70">
          {error ?? "Try again from the history list."}
        </p>
        <Link
          href="/rider/history"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/25 hover:-translate-y-0.5 hover:bg-primary-hover"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
          Back to history
        </Link>
      </section>
    );
  }

  const { hail, walletBalanceJmd } = data;
  const settled = hail.status === "completed";
  const cancelled =
    hail.status === "cancelled" || hail.status === "no_show";

  const driverName =
    hail.session?.driver?.firstName || hail.session?.driver?.lastName
      ? [hail.session.driver.firstName, hail.session.driver.lastName]
          .filter(Boolean)
          .join(" ")
      : "Driver not assigned";
  const vehicleLine =
    hail.session?.driver &&
    [
      hail.session.driver.vehicleColor,
      hail.session.driver.vehicleMake,
      hail.session.driver.vehicleModel,
    ]
      .filter(Boolean)
      .join(" ");

  const pickupPlace: Place | null =
    hail.pickupLat && hail.pickupLng
      ? {
          placeId: "",
          name: hail.pickup,
          address: hail.pickup,
          lat: hail.pickupLat,
          lng: hail.pickupLng,
          parish: null,
        }
      : null;
  const dropoffPlace: Place | null =
    hail.dropoffLat && hail.dropoffLng
      ? {
          placeId: "",
          name: hail.dropoff,
          address: hail.dropoff,
          lat: hail.dropoffLat,
          lng: hail.dropoffLng,
          parish: null,
        }
      : null;

  return (
    <div className="space-y-5 pb-12">
      <Link
        href="/rider/history"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-rajlo-red"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
        Back to history
      </Link>

      {/* Hero */}
      <FadeUp>
        <section
          className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10 ${
            settled
              ? "bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900"
              : cancelled
                ? "bg-rajlo-black"
                : "bg-gradient-to-br from-rajlo-red via-rajlo-red to-[#a30000]"
          }`}
        >
          <ArcWatermark
            size={520}
            variant="white"
            className="absolute -right-24 -top-24 opacity-[0.06]"
          />
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -bottom-24 -left-20 opacity-[0.16]"
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="font-secondary text-xs font-bold uppercase tracking-wider text-white/80">
                Route Taxi · receipt
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <h1 className="mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-4xl">
              {hail.route
                ? `${hail.route.origin} → ${hail.route.destination}`
                : `${hail.pickup} → ${hail.dropoff}`}
            </h1>
            <p className="mt-2 text-sm text-white/75">
              {settled
                ? "Trip complete"
                : cancelled
                  ? hail.status === "no_show"
                    ? "Did not board"
                    : "Cancelled"
                  : "Hail in flight"}
              {settled && hail.completedAt
                ? ` · ${friendlyDate(hail.completedAt)}`
                : cancelled && hail.cancelledAt
                  ? ` · ${friendlyDate(hail.cancelledAt)}`
                  : ` · ${friendlyDate(hail.requestedAt)}`}
            </p>
            {cancelled && hail.cancellationReason && (
              <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/85">
                {hail.cancellationReason}
              </p>
            )}
          </div>
        </section>
      </FadeUp>

      {/* Map (when we have coords) */}
      {(pickupPlace || dropoffPlace) && (
        <FadeUp delay={0.05}>
          <section className="overflow-hidden rounded-3xl border border-line bg-surface">
            <MapView
              pickup={pickupPlace}
              stops={[]}
              dropoff={dropoffPlace}
              className="h-72 w-full"
            />
          </section>
        </FadeUp>
      )}

      {/* Driver card */}
      {hail.session?.driver && (
        <FadeUp delay={0.06}>
          <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Driver
            </p>
            <div className="mt-2 flex items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rajlo-red via-rajlo-red to-[#7a0000] text-xl font-extrabold text-white shadow-md shadow-rajlo-red/30">
                {(driverName[0] ?? "D").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold tracking-tight md:text-base">
                  {driverName}
                </p>
                <p className="truncate text-xs text-muted">
                  {vehicleLine || "Vehicle details unavailable"}
                  {hail.session.driver.plateNumber
                    ? ` · ${hail.session.driver.plateNumber}`
                    : ""}
                </p>
              </div>
            </div>
          </section>
        </FadeUp>
      )}

      {/* Trip facts */}
      <FadeUp delay={0.08}>
        <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Trip details
          </p>
          <ul className="mt-3 space-y-3">
            <Leg icon="map-pin" label="Pickup" place={hail.pickup} time={hail.pickedUpAt ?? hail.acceptedAt} />
            <Leg icon="navigation" label="Dropoff" place={hail.dropoff} time={hail.completedAt} />
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-xs">
            <Fact label="Distance" value={`${hail.distanceKm.toFixed(1)} km`} />
            <Fact label="Hailed" value={friendlyDate(hail.requestedAt)} />
            {hail.acceptedAt && (
              <Fact label="Accepted" value={friendlyDate(hail.acceptedAt)} />
            )}
            {hail.pickedUpAt && (
              <Fact label="Picked up" value={friendlyDate(hail.pickedUpAt)} />
            )}
          </div>
        </section>
      </FadeUp>

      {/* Receipt */}
      <FadeUp delay={0.1}>
        <section
          className={`overflow-hidden rounded-3xl border ${
            settled ? "border-emerald-300 bg-emerald-50" : "border-line bg-surface"
          }`}
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-6 md:py-5">
            <div className="min-w-0">
              <p
                className={`font-secondary text-[10px] font-bold uppercase tracking-wider ${
                  settled ? "text-emerald-800" : "text-rajlo-red"
                }`}
              >
                {settled ? "Charged" : cancelled ? "Quoted" : "Fare"}
              </p>
              <p className="mt-0.5 text-3xl font-extrabold tracking-tight md:text-4xl">
                {formatJMD(hail.fareJmd)}
              </p>
              <p
                className={`mt-1 text-[11px] ${
                  settled ? "text-emerald-900/80" : "text-muted"
                }`}
              >
                {hail.concession ? "Concession (half-fare) · " : ""}TA-regulated route fare
              </p>
            </div>
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                settled
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : cancelled
                    ? "bg-surface-soft text-muted"
                    : "bg-primary-soft text-rajlo-red"
              }`}
            >
              <Icon
                name={settled ? "check-circle" : cancelled ? "x" : "wallet"}
                className="h-5 w-5"
              />
            </span>
          </div>
          {settled && walletBalanceJmd != null && (
            <div className="border-t border-emerald-200 bg-white px-5 py-3 text-[11px] text-emerald-900">
              Auto-debited from your wallet · balance now{" "}
              <span className="font-extrabold">
                {formatJMD(walletBalanceJmd)}
              </span>
            </div>
          )}
          {cancelled && (
            <div className="border-t border-line bg-surface-soft px-5 py-3 text-[11px] text-muted">
              Wallet was not charged for this trip.
            </div>
          )}
        </section>
      </FadeUp>

      {/* Multi-leg journey breakdown — renders only when this hail
         is one leg of a route_journeys row. Shows every leg's fare so
         the rider can reconcile the wallet debit against the corridor
         chain they actually rode. */}
      {journey && journey.journey.plannedLegCount > 1 && (
        <FadeUp delay={0.11}>
          <JourneyBreakdownPanel journey={journey} currentHailId={hail.id} />
        </FadeUp>
      )}

      <FadeUp delay={0.12}>
        <Link
          href="/rider/request"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-md shadow-rajlo-red/25 transition-all hover:-translate-y-0.5 hover:bg-primary-hover sm:w-auto"
        >
          Book another trip
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </FadeUp>
    </div>
  );
}

function JourneyBreakdownPanel({
  journey,
  currentHailId,
}: {
  journey: JourneyBreakdown;
  currentHailId: string;
}) {
  const j = journey.journey;
  const legs = [...journey.legs].sort(
    (a, b) => (a.legOrder ?? 0) - (b.legOrder ?? 0),
  );
  const settledLegs = legs.filter((l) => l.status === "completed").length;
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-soft px-5 py-4 md:px-6 md:py-5">
        <div className="min-w-0">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Journey breakdown
          </p>
          <p className="mt-0.5 truncate text-sm font-extrabold tracking-tight">
            {j.origin} <span className="text-rajlo-red">→</span>{" "}
            {j.destination}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {settledLegs} of {j.plannedLegCount} legs settled
            {j.refundedFareJmd > 0
              ? ` · ${formatJMD(j.refundedFareJmd)} refunded`
              : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Settled total
          </p>
          <p className="text-2xl font-extrabold tracking-tight">
            {formatJMD(j.settledFareJmd)}
          </p>
        </div>
      </div>
      <ol>
        {legs.map((leg, idx) => {
          const isCurrent = leg.hailId === currentHailId;
          const isDone = leg.status === "completed";
          const isCancelled = leg.status === "cancelled";
          return (
            <li
              key={leg.hailId}
              className={`flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0 md:px-6 ${
                isCurrent ? "bg-primary-soft/30" : ""
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isCancelled
                      ? "bg-surface-soft text-muted"
                      : isCurrent
                        ? "bg-rajlo-red text-white"
                        : "bg-surface-soft text-muted"
                }`}
              >
                {isDone ? (
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                ) : (
                  idx + 1
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-bold ${
                    isCancelled ? "text-muted line-through" : ""
                  }`}
                >
                  {leg.pickup.name}{" "}
                  <span className="text-rajlo-red">→</span>{" "}
                  {leg.dropoff.name}
                </p>
                <p className="text-[11px] text-muted">
                  {isDone
                    ? "Settled"
                    : isCancelled
                      ? "Cancelled"
                      : isCurrent
                        ? "This leg"
                        : "Pending"}
                  {leg.isTransferLeg ? " · transfer" : ""}
                </p>
              </div>
              <p
                className={`shrink-0 text-sm font-extrabold tabular-nums ${
                  isCancelled ? "text-muted" : ""
                }`}
              >
                {formatJMD(leg.fareJmd)}
              </p>
            </li>
          );
        })}
      </ol>
      {j.status === "active" && (
        <div className="bg-surface-soft px-5 py-3 text-[11px] text-muted md:px-6">
          Journey still in flight — the total updates as each leg
          settles.
        </div>
      )}
    </section>
  );
}

function Leg({
  icon,
  label,
  place,
  time,
}: {
  icon: "map-pin" | "navigation";
  label: string;
  place: string;
  time: string | null;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {label}
        </p>
        <p className="truncate text-sm font-bold">{place}</p>
      </div>
      {time && <p className="shrink-0 text-[11px] text-muted">{friendlyDate(time)}</p>}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-soft px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

function friendlyDate(iso: string): string {
  return new Date(iso).toLocaleString("en-JM", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
