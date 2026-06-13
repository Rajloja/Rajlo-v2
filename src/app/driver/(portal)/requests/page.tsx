"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatJMD } from "@/lib/jamaica";

/**
 * /driver/requests — full live ride-requests inbox.
 *
 * Where the dashboard surfaces a feed alongside other widgets, this
 * page is the dedicated workspace for "what's available right now."
 * The driver can:
 *
 *   - See every open ride visible to them in one scroll
 *   - Sort by oldest waiting, nearest, or highest fare
 *   - Filter by parish or seat count
 *   - Filter to solo vs carpool offerings
 *   - Accept any of them with one tap
 *
 * Real-time on two layers: a 6-second `useLiveQuery` poll AND a
 * Supabase Realtime subscription on the `rides` table so a brand-new
 * request appears within ~200ms of the rider tapping book.
 *
 * The driver must be online + on shift to accept. When offline a
 * sticky banner overlays the action surface and dims the cards so
 * "you're seeing this but can't act on it yet" reads at a glance.
 */

type SoloEntry = {
  kind: "solo";
  id: string;
  pickup: {
    name: string;
    address: string;
    parish: string | null;
    lat: number;
    lng: number;
  };
  dropoff: {
    name: string;
    address: string;
    parish: string | null;
    lat: number;
    lng: number;
  };
  stopsCount: number;
  seats: number;
  notes: string | null;
  estimatedFareJMD: number;
  estimatedDistanceKm: number | null;
  estimatedEtaMinutes: number | null;
  requestedAt: string;
  distanceKmFromDriver: number | null;
};

type CarpoolEntry = {
  kind: "carpool";
  id: string;
  groupId: string;
  rideIds: string[];
  primary: {
    rideId: string;
    pickup: SoloEntry["pickup"];
    dropoff: SoloEntry["dropoff"];
    seats: number;
    fareJMD: number;
  };
  secondary: {
    rideId: string;
    pickup: SoloEntry["pickup"];
    dropoff: SoloEntry["dropoff"];
    seats: number;
    fareJMD: number;
  };
  totalSeats: number;
  combinedFareJMD: number;
  distanceKmFromDriver: number | null;
  requestedAt: string;
};

type Entry = SoloEntry | CarpoolEntry;

type InboxResponse = {
  driver: { id?: string; activated: boolean };
  rides: Entry[];
};

type OnlineResponse = { online: boolean; wentOnlineAt: string | null };

type SortKey = "oldest" | "newest" | "closest" | "highest";
type RideKind = "all" | "solo" | "carpool";

const PARISHES = [
  "Kingston",
  "St. Andrew",
  "St. Catherine",
  "Clarendon",
  "Manchester",
  "St. James",
  "St. Ann",
  "Portland",
  "St. Thomas",
  "St. Mary",
  "Trelawny",
  "Westmoreland",
  "Hanover",
  "St. Elizabeth",
];

const SORTS: {
  key: SortKey;
  label: string;
  icon: "clock" | "trending-up" | "map-pin";
}[] = [
  { key: "oldest", label: "Oldest waiting", icon: "clock" },
  { key: "newest", label: "Newest first", icon: "clock" },
  { key: "closest", label: "Nearest first", icon: "map-pin" },
  { key: "highest", label: "Highest fare", icon: "trending-up" },
];

export default function DriverLiveRequestsPage() {
  const router = useRouter();

  /* ─────────── Live data ─────────── */

  const inbox = useLiveQuery<InboxResponse>("/api/driver/inbox", {
    interval: 6_000,
  });
  const onlineQuery = useLiveQuery<OnlineResponse>("/api/driver/online", {
    interval: 30_000,
  });

  // Realtime burst on top of polling — gets a brand-new ride to the
  // page within ~200ms instead of waiting up to 6s for the next poll.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("driver-live-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rides",
          // We can't filter by status=requested here because Supabase
          // Realtime applies the filter to BOTH old + new rows, which
          // would miss the "requested → accepted" transition that
          // should remove a card from this view. So we listen to all
          // ride changes and let the next refresh decide what's still
          // visible.
        },
        () => {
          inbox.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [inbox]);

  /* ─────────── Filters + sort ─────────── */

  const [sortKey, setSortKey] = useState<SortKey>("oldest");
  const [rideKind, setRideKind] = useState<RideKind>("all");
  const [parish, setParish] = useState("");
  const [minSeats, setMinSeats] = useState(1);

  // Carpool was retired from the driver UI. The inbox API may still
  // surface carpool entries to other consumers, so we filter them
  // out at the top of the funnel here — every downstream filter,
  // sort, and render path treats this page as solo-only.
  const allEntries = useMemo<Entry[]>(
    () => (inbox.data?.rides ?? []).filter((e) => e.kind !== "carpool"),
    [inbox.data?.rides],
  );

  const visible = useMemo(() => {
    let list = allEntries;
    if (rideKind !== "all") list = list.filter((e) => e.kind === rideKind);
    if (parish) {
      list = list.filter((e) => {
        if (e.kind === "solo")
          return e.pickup.parish === parish || e.dropoff.parish === parish;
        return (
          e.primary.pickup.parish === parish ||
          e.primary.dropoff.parish === parish ||
          e.secondary.pickup.parish === parish ||
          e.secondary.dropoff.parish === parish
        );
      });
    }
    if (minSeats > 1) {
      list = list.filter((e) => {
        const seats = e.kind === "solo" ? e.seats : e.totalSeats;
        return seats >= minSeats;
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return (
            new Date(b.requestedAt).getTime() -
            new Date(a.requestedAt).getTime()
          );
        case "highest": {
          const fa = a.kind === "solo" ? a.estimatedFareJMD : a.combinedFareJMD;
          const fb = b.kind === "solo" ? b.estimatedFareJMD : b.combinedFareJMD;
          return fb - fa;
        }
        case "closest": {
          const da = a.distanceKmFromDriver ?? Number.POSITIVE_INFINITY;
          const db = b.distanceKmFromDriver ?? Number.POSITIVE_INFINITY;
          return da - db;
        }
        case "oldest":
        default:
          return (
            new Date(a.requestedAt).getTime() -
            new Date(b.requestedAt).getTime()
          );
      }
    });
    return sorted;
  }, [allEntries, sortKey, rideKind, parish, minSeats]);

  /* ─────────── Aggregate stats for the hero strip ─────────── */

  const stats = useMemo(() => {
    if (allEntries.length === 0) {
      return {
        count: 0,
        avgFare: 0,
        closest: null as number | null,
        oldestMin: 0,
      };
    }
    const fares = allEntries.map((e) =>
      e.kind === "solo" ? e.estimatedFareJMD : e.combinedFareJMD,
    );
    const distances = allEntries
      .map((e) => e.distanceKmFromDriver)
      .filter((d): d is number => d !== null);
    const avg = Math.round(fares.reduce((s, f) => s + f, 0) / fares.length);
    const closest = distances.length > 0 ? Math.min(...distances) : null;
    const oldestMin = Math.floor(
      Math.max(
        ...allEntries.map(
          (e) => (Date.now() - new Date(e.requestedAt).getTime()) / 60_000,
        ),
      ),
    );
    return { count: allEntries.length, avgFare: avg, closest, oldestMin };
  }, [allEntries]);

  /* ─────────── Accept handler ─────────── */

  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const handleAccept = async (rideId: string) => {
    setAccepting(rideId);
    setAcceptError(null);
    try {
      const res = await fetch(`/api/driver/rides/${rideId}/accept`, {
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
      setAccepting(null);
    }
  };

  const isOnline = onlineQuery.data?.online === true;
  const driverActivated = inbox.data?.driver.activated ?? true;

  /* ─────────── Render ─────────── */

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div
          className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-2xl md:p-9 ${
            isOnline
              ? "bg-linear-to-br from-emerald-700 via-rajlo-black to-rajlo-black shadow-emerald-700/30"
              : "bg-rajlo-black shadow-rajlo-black/30"
          }`}
        >
          <ArcWatermark
            size={520}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.10]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Live ride requests
              </p>
              <LiveIndicator
                variant="dark"
                lastUpdated={inbox.lastUpdated}
                refreshing={inbox.refreshing}
                onRefresh={inbox.refresh}
              />
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                  isOnline
                    ? "bg-emerald-500 text-white"
                    : "bg-white/15 text-white/85 backdrop-blur"
                }`}
              >
                <span
                  className={`relative grid h-1.5 w-1.5 place-items-center`}
                >
                  {isOnline && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-white opacity-60" />
                  )}
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isOnline ? "bg-white" : "bg-white/60"
                    }`}
                  />
                </span>
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {inbox.loading
                ? "Looking for requests…"
                : stats.count === 0
                ? "No requests right now"
                : `${stats.count} request${
                    stats.count === 1 ? "" : "s"
                  } waiting`}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80 md:text-base">
              {isOnline
                ? "Pick the one that fits your route. Tap accept and head to pickup."
                : "Go online from your dashboard to start accepting requests."}
            </p>

            {/* Stat strip */}
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
              <HeroStat
                label="Avg fare"
                value={
                  inbox.loading || stats.count === 0
                    ? "—"
                    : formatJMD(stats.avgFare)
                }
              />
              <HeroStat
                label="Closest"
                value={
                  inbox.loading || stats.closest === null
                    ? "—"
                    : `${stats.closest.toFixed(1)} km`
                }
              />
              <HeroStat
                label="Longest wait"
                value={
                  inbox.loading || stats.count === 0
                    ? "—"
                    : `${stats.oldestMin}m`
                }
              />
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Driver-not-activated banner */}
      {!inbox.loading && !driverActivated && (
        <FadeUp delay={0.05}>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Verification required
            </p>
            <p className="mt-1 text-sm font-extrabold tracking-tight text-amber-900">
              Your driver account isn&apos;t activated yet.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Finish TA verification before you can accept ride requests.
            </p>
            <Link
              href="/driver/verification"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-amber-700"
            >
              Open verification
              <Icon name="arrow-right" className="h-3 w-3" />
            </Link>
          </div>
        </FadeUp>
      )}

      {/* Filter / sort bar */}
      <FadeUp delay={0.06}>
        <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => {
              const active = sortKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSortKey(s.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    active
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "bg-surface-soft text-muted hover:text-foreground"
                  }`}
                >
                  <Icon name={s.icon} className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {/* Solo/carpool ride-type filter removed with the
               carpool retirement; only solo rides surface now, so
               there's nothing to filter between. */}
            <select
              value={parish}
              onChange={(e) => setParish(e.target.value)}
              className="rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-semibold focus:border-rajlo-red focus:outline-none"
            >
              <option value="">All parishes</option>
              {PARISHES.map((p) => (
                <option key={p} value={p}>
                  Touches {p}
                </option>
              ))}
            </select>
            <select
              value={minSeats}
              onChange={(e) => setMinSeats(parseInt(e.target.value, 10))}
              className="rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-semibold focus:border-rajlo-red focus:outline-none"
            >
              <option value={1}>Any seat count</option>
              <option value={2}>2+ seats</option>
              <option value={3}>3+ seats</option>
              <option value={4}>4+ seats</option>
            </select>
          </div>
        </div>
      </FadeUp>

      {acceptError && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {acceptError}
        </div>
      )}

      {/* List */}
      {inbox.loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full" rounded="2xl" />
          ))}
        </div>
      ) : inbox.error ? (
        <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft p-5 text-center text-sm font-semibold text-rajlo-red">
          {inbox.error}
        </div>
      ) : visible.length === 0 ? (
        <FadeUp delay={0.1}>
          <EmptyState online={isOnline} totalAvailable={allEntries.length} />
        </FadeUp>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((entry, i) => (
            <FadeUp key={entry.id} delay={0.04 + i * 0.02}>
              {entry.kind === "solo" ? (
                <SoloRideCard
                  entry={entry}
                  online={isOnline}
                  accepting={accepting === entry.id}
                  disabled={accepting !== null && accepting !== entry.id}
                  onAccept={() => handleAccept(entry.id)}
                />
              ) : (
                <CarpoolRideCard
                  entry={entry}
                  online={isOnline}
                  accepting={accepting === entry.id}
                  disabled={accepting !== null && accepting !== entry.id}
                  onAccept={() => handleAccept(entry.id)}
                />
              )}
            </FadeUp>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────── Hero stat tile ─────────── */

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-extrabold tracking-tight md:text-2xl">
        {value}
      </p>
    </div>
  );
}

/* ─────────── Empty state ─────────── */

function EmptyState({
  online,
  totalAvailable,
}: {
  online: boolean;
  totalAvailable: number;
}) {
  // Two distinct empty states: "nothing matches your filters" vs.
  // "actually nothing's coming through" — they need different copy.
  const hasFiltered = totalAvailable > 0;
  if (hasFiltered) {
    return (
      <div className="rounded-3xl border border-dashed border-line bg-surface-soft p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-rajlo-red">
          <Icon name="search" className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-extrabold tracking-tight">
          No requests match these filters
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
          {totalAvailable} request{totalAvailable === 1 ? "" : "s"} waiting
          overall — widen your sort or parish filter to see them.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-dashed border-line bg-surface-soft p-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-rajlo-red">
        <Icon name="inbox" className="h-6 w-6" />
      </span>
      <p className="mt-4 text-base font-extrabold tracking-tight">
        Nothing in the queue right now
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
        {online
          ? "New requests will pop up here the second a rider taps book. Keep this tab open."
          : "Go online from your dashboard so requests can start landing here."}
      </p>
    </div>
  );
}

/* ─────────── Solo ride card ─────────── */

function SoloRideCard({
  entry,
  online,
  accepting,
  disabled,
  onAccept,
}: {
  entry: SoloEntry;
  online: boolean;
  accepting: boolean;
  disabled: boolean;
  onAccept: () => void;
}) {
  const elapsed = elapsedMinutes(entry.requestedAt);
  const fresh = elapsed < 1;
  const stale = elapsed > 5;
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg hover:shadow-rajlo-red/10 ${
        online ? "border-line" : "border-line opacity-70"
      }`}
    >
      {/* Card body — wrapped in a Link so tapping anywhere opens the
         detail page where the driver can see the route on a map +
         rider info before committing. The accept button stays a
         sibling below, so clicking it never triggers the navigation. */}
      <Link
        href={`/driver/requests/${entry.id}`}
        aria-label="See full ride details"
        className="block flex-1"
      >
        {/* Header strip */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-surface-soft px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-rajlo-red px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
              Solo ride
            </span>
            {fresh && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                New
              </span>
            )}
            {stale && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                {elapsed}m waiting
              </span>
            )}
            {entry.stopsCount > 0 && (
              <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                {entry.stopsCount} stop{entry.stopsCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="text-2xl font-extrabold tracking-tight text-rajlo-red">
            {formatJMD(entry.estimatedFareJMD)}
          </p>
        </div>

        {/* Route */}
        <div className="flex-1 space-y-3 px-5 py-4">
          <RoutePoint
            tone="emerald"
            label="Pickup"
            name={entry.pickup.name}
            parish={entry.pickup.parish}
          />
          <div className="ml-3.5 h-3 w-px bg-line" aria-hidden />
          <RoutePoint
            tone="red"
            label="Dropoff"
            name={entry.dropoff.name}
            parish={entry.dropoff.parish}
          />

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px]">
            <Meta
              icon="user"
              value={`${entry.seats} seat${entry.seats === 1 ? "" : "s"}`}
            />
            {entry.estimatedDistanceKm !== null && (
              <Meta
                icon="navigation"
                value={`${entry.estimatedDistanceKm.toFixed(1)} km trip`}
              />
            )}
            {entry.estimatedEtaMinutes !== null && (
              <Meta
                icon="clock"
                value={`~${entry.estimatedEtaMinutes}m drive`}
              />
            )}
            {entry.distanceKmFromDriver !== null && (
              <Meta
                icon="map-pin"
                value={`${entry.distanceKmFromDriver.toFixed(1)} km away`}
                accent
              />
            )}
          </div>

          {entry.notes && (
            <div className="mt-2 rounded-xl bg-primary-soft/60 px-3 py-2">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Note from rider
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">
                {entry.notes}
              </p>
            </div>
          )}

          {/* "View details" affordance so the link behavior is
             discoverable — the whole region is tappable but a small
             cue helps thumbs find it. */}
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold text-rajlo-red transition-transform group-hover:translate-x-0.5">
            See route, stops + rider details
            <Icon name="arrow-right" className="h-3 w-3" />
          </p>
        </div>
      </Link>

      {/* Footer / accept — sibling to the Link so the button click
         doesn't trigger navigation. */}
      <div className="border-t border-line bg-surface-soft px-5 py-3">
        {online ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={accepting || disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:-translate-y-0"
          >
            {accepting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon name="check-circle" className="h-4 w-4" />
            )}
            {accepting ? "Accepting…" : "Accept ride"}
          </button>
        ) : (
          <p className="text-center text-xs font-bold text-muted">
            Go online to accept this ride
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────── Carpool ride card ─────────── */

function CarpoolRideCard({
  entry,
  online,
  accepting,
  disabled,
  onAccept,
}: {
  entry: CarpoolEntry;
  online: boolean;
  accepting: boolean;
  disabled: boolean;
  onAccept: () => void;
}) {
  const elapsed = elapsedMinutes(entry.requestedAt);
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-lg hover:shadow-rajlo-red/10 ${
        online ? "border-rajlo-red/30" : "border-line opacity-70"
      }`}
    >
      <Link
        href={`/driver/requests/${entry.id}`}
        aria-label="See full carpool details"
        className="block flex-1"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line bg-rajlo-black px-5 py-3 text-white">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-rajlo-red px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
              Carpool · 2 riders
            </span>
            {elapsed > 5 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                {elapsed}m waiting
              </span>
            )}
          </div>
          <p className="text-2xl font-extrabold tracking-tight">
            {formatJMD(entry.combinedFareJMD)}
          </p>
        </div>

        <div className="flex-1 space-y-4 px-5 py-4">
          <div>
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              First pickup
            </p>
            <div className="mt-1.5 space-y-2">
              <RoutePoint
                tone="emerald"
                label="Pickup"
                name={entry.primary.pickup.name}
                parish={entry.primary.pickup.parish}
              />
              <RoutePoint
                tone="red"
                label="Dropoff"
                name={entry.primary.dropoff.name}
                parish={entry.primary.dropoff.parish}
              />
            </div>
          </div>
          <div className="border-t border-dashed border-line pt-3">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              Then
            </p>
            <div className="mt-1.5 space-y-2">
              <RoutePoint
                tone="emerald"
                label="Pickup"
                name={entry.secondary.pickup.name}
                parish={entry.secondary.pickup.parish}
              />
              <RoutePoint
                tone="red"
                label="Dropoff"
                name={entry.secondary.dropoff.name}
                parish={entry.secondary.dropoff.parish}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px]">
            <Meta icon="user" value={`${entry.totalSeats} seats total`} />
            {entry.distanceKmFromDriver !== null && (
              <Meta
                icon="map-pin"
                value={`${entry.distanceKmFromDriver.toFixed(
                  1,
                )} km to first pickup`}
                accent
              />
            )}
          </div>

          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold text-rajlo-red transition-transform group-hover:translate-x-0.5">
            See full route, both riders + payment
            <Icon name="arrow-right" className="h-3 w-3" />
          </p>
        </div>
      </Link>

      <div className="border-t border-line bg-surface-soft px-5 py-3">
        {online ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={accepting || disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:-translate-y-0"
          >
            {accepting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon name="check-circle" className="h-4 w-4" />
            )}
            {accepting ? "Accepting…" : "Accept carpool"}
          </button>
        ) : (
          <p className="text-center text-xs font-bold text-muted">
            Go online to accept this carpool
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────── Tiny pieces ─────────── */

function RoutePoint({
  tone,
  label,
  name,
  parish,
}: {
  tone: "emerald" | "red";
  label: string;
  name: string;
  parish: string | null;
}) {
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-rajlo-red";
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-1 grid h-3 w-3 shrink-0 place-items-center rounded-full ${dot} ring-2 ring-white`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          {label}
          {parish && (
            <span className="ml-1 normal-case tracking-normal text-muted/70">
              · {parish}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm font-extrabold">{name}</p>
      </div>
    </div>
  );
}

function Meta({
  icon,
  value,
  accent,
}: {
  icon: "user" | "navigation" | "clock" | "map-pin";
  value: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        accent ? "font-extrabold text-rajlo-red" : "text-muted"
      }`}
    >
      <Icon name={icon} className="h-3 w-3" />
      {value}
    </span>
  );
}

function elapsedMinutes(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  );
}
