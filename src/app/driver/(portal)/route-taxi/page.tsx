"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, m } from "motion/react";
import { MapView } from "@/components/map-view";
import { HailChatSheet } from "@/components/hail-chat-sheet";
import { CallButton } from "@/components/call-button";
import { nearestParish, type Place } from "@/lib/jamaica";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp, Stagger, StaggerItem } from "@/components/anim";
import { ListRowSkeleton, Skeleton } from "@/components/skeleton";
import { SessionQr } from "@/components/session-qr";
import { useBackgroundRefresh } from "@/lib/use-background-refresh";
import { playScanBeep } from "@/lib/play-scan-beep";
import { formatJMD } from "@/lib/jamaica";

/**
 * Driver Route Taxi (Mode B) console.
 *
 * Single page that switches between two states:
 *   1. No active session → route picker (start a session pinned to a route)
 *   2. Active session   → live monitor with three buckets:
 *        - Pending hails on this route waiting to be accepted
 *        - Accepted hails (driver heading to pickup)
 *        - Onboard hails  (rider in the car, drop off + settle)
 *
 * Polls /sessions/current every 5s as a backup so the seat counter and
 * pending hails stay fresh even if realtime drops.
 */

type RouteRow = {
  id: string;
  origin: string;
  destination: string;
  parish: string | null;
  distanceKm: number;
  taFareJmd: number;
  slug: string;
};

type SessionPayload = {
  session: ActiveSession | null;
  pending: HailRow[];
  accepted: AcceptedHail[];
  onboard: OnboardHail[];
  driver: { activated: boolean; onboardingStatus: string } | null;
};

type ActiveSession = {
  id: string;
  routeId: string;
  direction: "forward" | "reverse";
  vehicleCapacity: number;
  seatsTaken: number;
  seatsRemaining: number;
  status: string;
  startedAt: string;
  /** 4-char manual-entry code for riders whose camera can't scan
   *  the session QR. Null on legacy sessions started before the
   *  pickup_code column was added — those still work via QR scan. */
  pickupCode?: string | null;
  route: {
    id: string;
    origin: string;
    destination: string;
    parish: string | null;
    distanceKm: number;
    taFareJmd: number;
    /** Endpoint coords for the corridor polyline on the driver
     *  map. Null on legacy route rows without the lat/lng backfill. */
    originLat?: number | null;
    originLng?: number | null;
    destinationLat?: number | null;
    destinationLng?: number | null;
  } | null;
};

type HailRow = {
  id: string;
  riderId: string;
  pickup: string;
  dropoff: string;
  distanceKm: number;
  fareJmd: number;
  concession?: boolean;
  requestedAt: string;
  /** Set by the server when both the driver and the rider have shared
   *  GPS — the hail row is sorted closest-first when present. */
  proximityKm?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  /** True when this hail is a transfer-in leg of a multi-leg journey
   *  (i.e. the rider just finished a previous corridor and is showing
   *  up here to continue). The session screen badges these so the
   *  driver knows it's a guaranteed-onboarding scan-to-claim job, not
   *  a speculative kerbside hail. */
  isTransferLeg?: boolean;
  journeyId?: string | null;
  legOrder?: number | null;
  /** Mid-corridor projection coords from the corridor-aware
   *  pathfinder. When present, the driver's nav target / map pin
   *  should resolve to these instead of pickupLat/pickupLng (the
   *  rider's typed pickup, which may be slightly off-road). Legacy
   *  hails created before the pathfinder rewrite leave these null
   *  and the driver UI falls back to pickup coords. */
  boardingLat?: number | null;
  boardingLng?: number | null;
  alightingLat?: number | null;
  alightingLng?: number | null;
};

type RiderInfo = {
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
};
type AcceptedHail = HailRow & { acceptedAt: string; rider?: RiderInfo };
type OnboardHail = HailRow & { pickedUpAt: string; rider?: RiderInfo };

export default function DriverRouteTaxiPage() {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/route-taxi/sessions/current");
      if (!res.ok) return;
      const json = (await res.json()) as SessionPayload;
      setData(json);
    } catch {
      /* network blip — next tick will catch up */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 5-second backup poll while a session is active. When there's no
  // session the picker is static — no need to hammer the API.
  useBackgroundRefresh(refresh, 5000, { enabled: Boolean(data?.session) });

  // Driver's local GPS — pushed to the session for proximity sort,
  // and used by the in-page map block so the driver sees themselves
  // relative to their assigned riders' pickup/dropoff pins.
  const [driverPosition, setDriverPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  useDriverPositionPush(Boolean(data?.session), setDriverPosition);

  const transition = useCallback(
    async (
      hailId: string,
      to: "accepted" | "picked_up" | "completed" | "cancelled",
    ) => {
      setActionPending(`${hailId}:${to}`);
      setActionError(null);
      try {
        const res = await fetch(`/api/driver/route-taxi/hails/${hailId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.message ?? json.error ?? "Action failed");
        }
        await refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setActionPending(null);
      }
    },
    [refresh],
  );

  const endSession = useCallback(async () => {
    setActionPending("end");
    setActionError(null);
    try {
      const res = await fetch("/api/driver/route-taxi/sessions/end", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? json.error ?? "Couldn't end session");
      }
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't end session");
    } finally {
      setActionPending(null);
    }
  }, [refresh]);

  if (loading) {
    return <RouteTaxiSkeleton />;
  }

  if (!data?.session) {
    return (
      <StartSessionPicker
        onStarted={() => {
          setActionError(null);
          void refresh();
        }}
        outerError={actionError}
        clearError={() => setActionError(null)}
      />
    );
  }

  return (
    <ActiveSessionMonitor
      session={data.session}
      pending={data.pending}
      accepted={data.accepted}
      onboard={data.onboard}
      driverPosition={driverPosition}
      onTransition={transition}
      onEnd={endSession}
      actionPending={actionPending}
      actionError={actionError}
      clearError={() => setActionError(null)}
    />
  );
}

/* ════════════════════ NO SESSION — START PICKER ════════════════════ */

function StartSessionPicker({
  onStarted,
  outerError,
  clearError,
}: {
  onStarted: () => void;
  outerError: string | null;
  clearError: () => void;
}) {
  const [routes, setRoutes] = useState<RouteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [parishFilter, setParishFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<RouteRow | null>(null);
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [capacity, setCapacity] = useState(4);
  const [starting, setStarting] = useState(false);
  // 884 routes is too much to scroll through. Search-first window;
  // expand button reveals more if the driver wants to browse.
  const VISIBLE_LIMIT = 15;
  const [visibleLimit, setVisibleLimit] = useState(VISIBLE_LIMIT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rider/routes");
        if (!res.ok) throw new Error("Failed to load routes");
        const json = (await res.json()) as { routes: RouteRow[] };
        if (cancelled) return;
        setRoutes(json.routes);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load routes");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parishes = useMemo(() => {
    if (!routes) return [];
    const set = new Set<string>();
    for (const r of routes) if (r.parish) set.add(r.parish);
    return Array.from(set).sort();
  }, [routes]);

  const { grouped, filteredCount } = useMemo(() => {
    if (!routes) return { grouped: [], filteredCount: 0 };
    const q = search.trim().toLowerCase();
    const filtered = routes.filter((r) => {
      if (parishFilter && r.parish !== parishFilter) return false;
      if (!q) return true;
      return (
        r.origin.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q)
      );
    });
    const visible = filtered.slice(0, visibleLimit);
    const groups = new Map<string, RouteRow[]>();
    for (const r of visible) {
      const key = r.parish ?? "Other";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return {
      grouped: Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([parish, rows]) => ({ parish, rows })),
      filteredCount: filtered.length,
    };
  }, [routes, search, parishFilter, visibleLimit]);

  // Reset the cap so a leftover expansion from a previous filter
  // doesn't bleed into a fresh search.
  useEffect(() => {
    setVisibleLimit(VISIBLE_LIMIT);
  }, [search, parishFilter]);

  const startSession = async () => {
    if (!selected) return;
    setStarting(true);
    clearError();
    try {
      const res = await fetch("/api/driver/route-taxi/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: selected.id,
          direction,
          vehicleCapacity: capacity,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Couldn't start session");
      }
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start session");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10">
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
              <span className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Mode · Route Taxi
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
              Pick your corridor and go live
            </h1>
            <p className="mt-3 max-w-md text-sm text-white/75 md:text-base">
              Riders hailing on this corridor get matched to your car. Wallet
              auto-debit on drop-off — every dollar accounted for, no cash to
              chase.
            </p>
          </div>
        </section>
      </FadeUp>

      {(outerError || error) && (
        <FadeUp delay={0.04}>
          <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {outerError ?? error}
          </div>
        </FadeUp>
      )}

      <FadeUp delay={0.05}>
        <section className="rounded-3xl border border-line bg-surface p-5 md:p-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-secondary text-[11px] font-bold uppercase tracking-wider text-rajlo-red">
                Choose a route
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight md:text-2xl">
                {routes
                  ? `${routes.length.toLocaleString()} TA-licensed routes`
                  : "Loading…"}
              </h2>
            </div>
            {parishFilter && (
              <button
                type="button"
                onClick={() => setParishFilter(null)}
                className="text-xs font-bold text-rajlo-red hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <label className="relative block">
              <span className="sr-only">Search routes</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Half Way Tree, Papine, Spanish Town…"
                className="block w-full rounded-xl border border-line bg-surface-soft py-3 pl-10 pr-4 text-sm font-medium outline-none placeholder:text-muted focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/20"
              />
            </label>

            {/* "Use my location" — uses browser GPS to pick the
               nearest parish and pre-filter routes to corridors the
               driver could realistically run from where they are. */}
            <UseMyLocationButton onParishDetected={(p) => setParishFilter(p)} />

            {parishes.length > 0 && (
              <div className="-mx-1 flex flex-wrap gap-1.5">
                {parishes.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setParishFilter((cur) => (cur === p ? null : p))
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      parishFilter === p
                        ? "bg-rajlo-red text-white"
                        : "border border-line bg-surface text-muted hover:border-rajlo-red hover:text-rajlo-red"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            {!routes && !error && (
              <div className="space-y-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <ListRowSkeleton key={i} />
                ))}
              </div>
            )}
            {routes && grouped.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-8 text-center">
                <p className="text-sm font-bold">No matching routes</p>
              </div>
            )}
            {routes && grouped.length > 0 && filteredCount > visibleLimit && (
              <p className="mb-3 rounded-xl bg-surface-soft px-3 py-2 text-[11px] text-muted">
                Showing {visibleLimit} of {filteredCount} matching routes —
                refine the search above to find yours quickly.
              </p>
            )}
            {routes && grouped.length > 0 && (
              <Stagger className="space-y-6" amount={0.04}>
                {grouped.map((g) => (
                  <StaggerItem key={g.parish}>
                    <div>
                      <p className="font-secondary mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                        {g.parish} · {g.rows.length}
                      </p>
                      <ul className="space-y-1.5">
                        {g.rows.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => setSelected(r)}
                              className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                                selected?.id === r.id
                                  ? "border-rajlo-red bg-primary-soft"
                                  : "border-line bg-surface hover:border-rajlo-red hover:shadow-md"
                              }`}
                            >
                              <span
                                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                                  selected?.id === r.id
                                    ? "bg-rajlo-red text-white"
                                    : "bg-surface-soft text-muted"
                                }`}
                              >
                                <Icon name="navigation" className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">
                                  {r.origin}{" "}
                                  <span className="text-rajlo-red">→</span>{" "}
                                  {r.destination}
                                </p>
                                <p className="text-[11px] text-muted">
                                  {r.distanceKm.toFixed(1)} km · TA{" "}
                                  {formatJMD(r.taFareJmd)}/leg
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            )}

            {routes && grouped.length > 0 && filteredCount > visibleLimit && (
              <button
                type="button"
                onClick={() => setVisibleLimit((v) => v + 30)}
                className="mt-4 w-full rounded-2xl border-2 border-dashed border-line bg-surface-soft px-4 py-3 text-sm font-bold text-foreground hover:border-rajlo-red hover:text-rajlo-red"
              >
                Show {Math.min(30, filteredCount - visibleLimit)} more
                <span className="ml-2 text-xs font-medium text-muted">
                  ({filteredCount - visibleLimit} remaining)
                </span>
              </button>
            )}
          </div>
        </section>
      </FadeUp>

      {/* Bottom-sheet for the chosen route. Lives outside the page's
         scrolling container as a fixed-viewport panel so it stays
         glued to the bottom of the screen regardless of how far the
         driver has scrolled through the route list. Slides up from
         below on selection, slides back down when cleared — same
         pattern as a native Android "info sheet". */}
      <AnimatePresence>
        {selected && (
          <>
            {/* Backdrop tap clears the selection. Just a translucent
               overlay — leaves the route list visible behind so the
               driver can see what they're picking from. */}
            <m.button
              key="route-sheet-backdrop"
              type="button"
              aria-label="Clear selection"
              className="fixed inset-x-0 bottom-0 top-0 z-30 cursor-default bg-black/30 backdrop-blur-[2px]"
              onClick={() => setSelected(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            />
            <m.section
              key="route-sheet"
              className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-line bg-surface px-5 pb-[max(env(safe-area-inset-bottom,0px),1rem)] pt-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.25)] md:mx-auto md:max-w-3xl md:rounded-3xl md:border md:bottom-4 md:px-6 md:pb-6"
              role="dialog"
              aria-modal="false"
              aria-labelledby="route-sheet-title"
              initial={{ y: "100%", opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.6 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 36,
                mass: 0.9,
              }}
            >
              {/* Grab handle — visual affordance that this is a sheet
                 and tells the eye where to look for a swipe target. */}
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line md:hidden" />

              <div className="flex items-start justify-between gap-3 md:hidden">
                <div className="min-w-0 flex-1">
                  <p
                    id="route-sheet-title"
                    className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red"
                  >
                    Selected
                  </p>
                  <p className="mt-0.5 truncate text-sm font-extrabold tracking-tight">
                    {selected.origin}{" "}
                    <span className="text-rajlo-red">→</span>{" "}
                    {selected.destination}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {selected.distanceKm.toFixed(1)} km ·{" "}
                    {formatJMD(selected.taFareJmd)}/leg
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface-soft text-muted hover:bg-surface"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-4 md:mt-0 md:flex-row md:items-end md:gap-5">
                <div className="hidden min-w-0 flex-1 md:block">
                  <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                    Selected
                  </p>
                  <p className="mt-0.5 truncate text-sm font-extrabold tracking-tight md:text-base">
                    {selected.origin}{" "}
                    <span className="text-rajlo-red">→</span>{" "}
                    {selected.destination}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {selected.distanceKm.toFixed(1)} km ·{" "}
                    {formatJMD(selected.taFareJmd)}/leg
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                  <DirectionToggle value={direction} onChange={setDirection} />
                  <CapacityStepper value={capacity} onChange={setCapacity} />
                </div>

                <button
                  type="button"
                  onClick={startSession}
                  disabled={starting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {starting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                      Going live…
                    </>
                  ) : (
                    <>
                      Go live on this route
                      <Icon name="arrow-right" className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </m.section>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: "forward" | "reverse";
  onChange: (v: "forward" | "reverse") => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-bold">
      <button
        type="button"
        onClick={() => onChange("forward")}
        className={`px-3 py-2 ${
          value === "forward"
            ? "bg-rajlo-black text-white"
            : "bg-surface text-muted hover:bg-surface-soft"
        }`}
      >
        Origin → Dest
      </button>
      <button
        type="button"
        onClick={() => onChange("reverse")}
        className={`px-3 py-2 ${
          value === "reverse"
            ? "bg-rajlo-black text-white"
            : "bg-surface text-muted hover:bg-surface-soft"
        }`}
      >
        Dest → Origin
      </button>
    </div>
  );
}

function CapacityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1.5 text-xs font-bold">
      <span className="px-1 text-muted">Seats</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="grid h-6 w-6 place-items-center rounded-full bg-surface-soft text-muted hover:bg-rajlo-red hover:text-white"
      >
        −
      </button>
      <span className="w-5 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(16, value + 1))}
        className="grid h-6 w-6 place-items-center rounded-full bg-surface-soft text-muted hover:bg-rajlo-red hover:text-white"
      >
        +
      </button>
    </div>
  );
}

/**
 * Compact rider info chip that sits at the top of each accepted /
 * onboard hail card. Driver immediately sees who they're picking up
 * (face + name) and gets one-tap call. The GPS pin lights up when
 * the rider opted into location-share so the driver knows we have
 * a precise pickup spot.
 */
function RiderBadge({
  rider,
  hailId,
  pickupLat,
  pickupLng,
  tone,
  onMessage,
}: {
  rider: RiderInfo;
  hailId: string;
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  tone: "amber" | "emerald";
  onMessage?: () => void;
}) {
  const initial = (rider.name?.[0] ?? "R").toUpperCase();
  const hasGps = pickupLat != null && pickupLng != null;
  const tonePill =
    tone === "emerald"
      ? "bg-white/70 text-emerald-900"
      : "bg-white/70 text-amber-900";
  const initialBg =
    tone === "emerald"
      ? "from-emerald-700 to-emerald-900"
      : "from-amber-600 to-amber-800";

  return (
    <div className="flex items-center gap-3">
      {rider.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rider.avatarUrl}
          alt={rider.name ? `${rider.name}'s photo` : "Rider"}
          className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-white/70"
        />
      ) : (
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-base font-extrabold text-white ${initialBg}`}
        >
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold tracking-tight">
          {rider.name ?? "Rajlo rider"}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tonePill}`}
          >
            <Icon name={hasGps ? "map-pin" : "user"} className="h-3 w-3" />
            {hasGps ? "GPS shared" : "No GPS"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            aria-label="Message rider"
            className="grid h-9 w-9 place-items-center rounded-xl bg-rajlo-red text-white shadow-sm hover:bg-primary-hover"
          >
            <Icon name="mail" className="h-3.5 w-3.5" />
          </button>
        )}
        <CallButton hailId={hailId} variant="subtle" label="" />
      </div>
    </div>
  );
}

/* ════════════════════ Use my location button ════════════════════
 * Browser geolocation → nearest parish lookup → set the parish
 * filter so the route list collapses to corridors the driver could
 * realistically start from where they are. Silent failures (denied
 * permission, no GPS) just leave the filter alone.
 */
function UseMyLocationButton({
  onParishDetected,
}: {
  onParishDetected: (parish: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);

  const handle = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const parish = nearestParish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setBusy(false);
        if (parish) {
          setDetected(parish);
          onParishDetected(parish);
        } else {
          setError(
            "Couldn't tell which parish you're in. Try the chips below.",
          );
        }
      },
      () => {
        setBusy(false);
        setError("Location permission denied.");
      },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 8_000 },
    );
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-rajlo-red/40 bg-primary-soft px-4 py-2 text-xs font-bold text-rajlo-red transition-all hover:border-rajlo-red disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
            Locating…
          </>
        ) : (
          <>
            <Icon name="map-pin" className="h-3.5 w-3.5" />
            Suggest routes near me
          </>
        )}
      </button>
      {detected && !error && (
        <p className="text-[11px] text-emerald-700">
          Showing corridors in <span className="font-bold">{detected}</span>.
        </p>
      )}
      {error && <p className="text-[11px] text-rajlo-red">{error}</p>}
    </div>
  );
}

/** Stamp a hail's lat/lng + name into the Place shape MapView wants. */
function hailToPlace(name: string, lat: number, lng: number): Place {
  return {
    placeId: "",
    name,
    address: name,
    lat,
    lng,
    parish: null,
  };
}

/* ════════════════════ ACTIVE SESSION — MONITOR ════════════════════ */

function ActiveSessionMonitor({
  session,
  pending,
  accepted,
  onboard,
  driverPosition,
  onTransition,
  onEnd,
  actionPending,
  actionError,
  clearError,
}: {
  session: ActiveSession;
  pending: HailRow[];
  accepted: AcceptedHail[];
  onboard: OnboardHail[];
  driverPosition: { lat: number; lng: number } | null;
  onTransition: (
    id: string,
    to: "accepted" | "picked_up" | "completed" | "cancelled",
  ) => void;
  onEnd: () => void;
  actionPending: string | null;
  actionError: string | null;
  clearError: () => void;
}) {
  const seatsFull = session.seatsRemaining <= 0;
  const isPending = (id: string, to: string) =>
    actionPending === `${id}:${to}`;

  // One chat sheet, opens for whichever hail the driver tapped.
  const [chatHail, setChatHail] = useState<{
    id: string;
    riderName: string | null;
    riderAvatarUrl: string | null;
  } | null>(null);

  // Drop-off confirmation. Tapping the green "Drop off" button on an
  // onboard hail arms this dialog instead of immediately settling the
  // fare — settlement charges the rider's wallet and finalises the
  // hail, both irreversible. Mirrors the private-ride "Complete trip"
  // confirmation in /driver/active-trip so both modes ask before
  // taking the rider's money.
  const [dropOffConfirm, setDropOffConfirm] = useState<{
    hailId: string;
    fareJmd: number;
    pickup: string;
    dropoff: string;
  } | null>(null);

  // One pickup-QR modal, opens for the accepted hail the driver is
  // about to board. Hold just the hail id; the modal reads the rest
  // (status, rider info) off the live `accepted`/`onboard` arrays so
  // it auto-flips to the success state the moment the rider's scan
  // moves the row from accepted → onboard.
  const [pickupHailId, setPickupHailId] = useState<string | null>(null);

  // Pick the next-action target so the driver always sees ONE clear
  // pin to head toward (matches the live-trip page's single-driver-
  // single-rider model). Priority:
  //   1. First onboard hail's dropoff (drop them off next)
  //   2. First accepted hail's pickup (head to pickup)
  //   3. First pending hail's pickup (preview before accepting)
  const nextAction = useMemo(() => {
    // Resolve nav-target coords for a hail. The corridor-aware
    // pathfinder writes mid-corridor projection coords
    // (boarding_lat/lng + alighting_lat/lng) which match the EXACT
    // pin the rider sees on their map. When those are present we
    // use them so both phones converge on the same spot. Legacy
    // hails fall back to the rider's typed pickup/dropoff coords.
    const pickupTarget = (
      h: AcceptedHail | OnboardHail | HailRow,
    ): { lat: number; lng: number } | null => {
      if (h.boardingLat != null && h.boardingLng != null) {
        return { lat: h.boardingLat, lng: h.boardingLng };
      }
      if (h.pickupLat != null && h.pickupLng != null) {
        return { lat: h.pickupLat, lng: h.pickupLng };
      }
      return null;
    };
    const dropoffTarget = (
      h: OnboardHail,
    ): { lat: number; lng: number } | null => {
      if (h.alightingLat != null && h.alightingLng != null) {
        return { lat: h.alightingLat, lng: h.alightingLng };
      }
      if (h.dropoffLat != null && h.dropoffLng != null) {
        return { lat: h.dropoffLat, lng: h.dropoffLng };
      }
      return null;
    };

    for (const h of onboard) {
      const t = dropoffTarget(h);
      if (t) {
        return {
          kind: "dropoff" as const,
          place: hailToPlace(h.dropoff, t.lat, t.lng),
        };
      }
    }
    for (const h of accepted) {
      const t = pickupTarget(h);
      if (t) {
        return {
          kind: "pickup" as const,
          place: hailToPlace(h.pickup, t.lat, t.lng),
        };
      }
    }
    for (const h of pending) {
      const t = pickupTarget(h);
      if (t) {
        return {
          kind: "pickup" as const,
          place: hailToPlace(h.pickup, t.lat, t.lng),
        };
      }
    }
    return null;
  }, [onboard, accepted, pending]);

  // Map overlays for the driver's session map. Two things go in:
  //   - Corridor polyline (the route the driver runs) — extracted
  //     from the session's route endpoints. Renders as the same amber
  //     polyline the rider sees on their map, so both sides share a
  //     visual vocabulary.
  //   - Boarding pin on the rider's projected board point when an
  //     accepted (or pending) hail has the corridor-aware coords.
  //     Mirrors the orange "B" pin the rider sees.
  //   - Alighting pin during the drop-off phase for the same reason.
  const driverMapOverlays = useMemo(() => {
    const empty = {
      boarding: null as
        | { coords: { lat: number; lng: number }; walkKm?: number }
        | null,
      alighting: null as
        | { coords: { lat: number; lng: number }; walkKm?: number }
        | null,
      corridorLines: null as Array<{
        from: { lat: number; lng: number };
        to: { lat: number; lng: number };
      }> | null,
    };
    const route = session.route;
    const corridorLines =
      route &&
      route.originLat != null &&
      route.originLng != null &&
      route.destinationLat != null &&
      route.destinationLng != null
        ? [
            {
              from: { lat: route.originLat, lng: route.originLng },
              to: {
                lat: route.destinationLat,
                lng: route.destinationLng,
              },
            },
          ]
        : null;

    if (!nextAction) {
      return { ...empty, corridorLines };
    }

    // Pull the currently-targeted hail so we can surface ITS
    // boarding / alighting projection. We match by which array
    // nextAction came from (dropoff = onboard, pickup = accepted /
    // pending).
    let boardingCoords: { lat: number; lng: number } | null = null;
    let alightingCoords: { lat: number; lng: number } | null = null;
    if (nextAction.kind === "dropoff") {
      const h = onboard[0];
      if (h?.alightingLat != null && h?.alightingLng != null) {
        alightingCoords = { lat: h.alightingLat, lng: h.alightingLng };
      }
    } else {
      const h = accepted[0] ?? pending[0];
      if (h && h.boardingLat != null && h.boardingLng != null) {
        boardingCoords = { lat: h.boardingLat, lng: h.boardingLng };
      }
    }

    return {
      boarding: boardingCoords ? { coords: boardingCoords } : null,
      alighting: alightingCoords ? { coords: alightingCoords } : null,
      corridorLines,
    };
  }, [session.route, nextAction, onboard, accepted, pending]);

  const showMap = Boolean(driverPosition || nextAction);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-7">
          <ArcWatermark
            size={420}
            variant="red"
            className="absolute -right-24 -top-12 opacity-[0.18]"
          />
          <div className="relative grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="font-secondary text-xs font-bold uppercase tracking-wider text-emerald-200">
                  Live · accepting hails
                </span>
              </div>
              <h1 className="mt-2 truncate text-2xl font-extrabold tracking-tight md:text-3xl">
                {session.route?.origin}{" "}
                <span className="text-rajlo-red">→</span>{" "}
                {session.route?.destination}
              </h1>
              <p className="mt-1 text-xs text-white/70">
                {session.direction === "reverse" ? "Reverse leg" : "Forward leg"}{" "}
                · {session.route?.parish ?? ""} ·{" "}
                {session.route?.distanceKm.toFixed(1)} km
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 px-4 py-2.5 text-center">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-white/65">
                  Seats
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-tight">
                  {session.seatsTaken}
                  <span className="text-white/55">/{session.vehicleCapacity}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onEnd}
                disabled={actionPending === "end"}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
              >
                {actionPending === "end" ? "Ending…" : "End session"}
              </button>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* PENDING — hails on this corridor waiting for accept.
         Pulled up to the top of the page so a driver opening the
         app sees the actionable queue first, before any of the
         supporting UI (QR card, map, onboard list). */}
      <FadeUp delay={0.02}>
        <section>
          <SectionHeader
            eyebrow="Hails on this route"
            title={
              pending.length === 0
                ? "Waiting for the next rider…"
                : `${pending.length} rider${pending.length === 1 ? "" : "s"} hailing`
            }
            hint={
              seatsFull
                ? "Vehicle full — drop someone off before accepting more"
                : undefined
            }
          />
          {pending.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface-soft p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-rajlo-red shadow-sm">
                <Icon name="navigation" className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-bold">No hails yet</p>
              <p className="mt-1 text-xs text-muted">
                Stay on this corridor — we&apos;re polling every 5s for new
                riders.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {pending.map((h) => (
                <li
                  key={h.id}
                  className={`rounded-2xl border bg-surface p-4 transition-shadow hover:shadow-md ${
                    h.isTransferLeg
                      ? "border-rajlo-red/40 ring-1 ring-rajlo-red/20"
                      : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {h.isTransferLeg && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rajlo-red px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                            <Icon
                              name="arrow-right"
                              className="h-2.5 w-2.5"
                            />
                            Transfer rider
                          </span>
                        )}
                        <p className="text-sm font-bold">
                          {h.pickup} → {h.dropoff}
                        </p>
                        {typeof h.proximityKm === "number" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                            <Icon name="map-pin" className="h-2.5 w-2.5" />
                            {h.proximityKm < 1
                              ? `${Math.round(h.proximityKm * 1000)} m away`
                              : `${h.proximityKm.toFixed(1)} km away`}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {h.distanceKm.toFixed(1)} km · You earn ~
                        {formatJMD(Math.round(h.fareJmd * 0.85))}
                        {h.concession ? " · concession" : ""}
                        {" · rider scans QR to start"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTransition(h.id, "accepted")}
                      disabled={isPending(h.id, "accepted") || seatsFull}
                      title={seatsFull ? "Vehicle full" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white shadow-md shadow-rajlo-red/25 hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-50 disabled:hover:-translate-y-0"
                    >
                      <Icon name="check-circle" className="h-3.5 w-3.5" />
                      {isPending(h.id, "accepted")
                        ? "Accepting…"
                        : `Accept · ${formatJMD(h.fareJmd)}`}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </FadeUp>

      {/* ACCEPTED — hails the driver has claimed but the rider hasn't
         scanned yet. Sits directly under the corridor's pending list
         so the driver's eye flows: "who's available → who am I
         already going to pick up". Each row carries the
         "Waiting for rider to scan" pill since drivers no longer
         self-confirm pickup. */}
      {accepted.length > 0 && (
        <FadeUp delay={0.03}>
          <section>
            <SectionHeader
              eyebrow="On the way"
              title={`${accepted.length} pickup${accepted.length === 1 ? "" : "s"} pending`}
            />
            <ul className="mt-3 space-y-2.5">
              {accepted.map((h) => (
                <li
                  key={h.id}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                >
                  {h.rider && (
                    <RiderBadge
                      rider={h.rider}
                      hailId={h.id}
                      pickupLat={h.pickupLat}
                      pickupLng={h.pickupLng}
                      tone="amber"
                      onMessage={() =>
                        setChatHail({
                          id: h.id,
                          riderName: h.rider?.name ?? null,
                          riderAvatarUrl: h.rider?.avatarUrl ?? null,
                        })
                      }
                    />
                  )}
                  <div className="mt-3 space-y-3 sm:flex sm:flex-wrap sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
                    <div className="min-w-0 sm:flex-1">
                      <p className="text-sm font-bold text-amber-900">
                        Pick up at {h.pickup}
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-800/80">
                        Going to {h.dropoff} · {h.distanceKm.toFixed(1)} km ·{" "}
                        {formatJMD(h.fareJmd)}
                      </p>
                      {/* Reminder for the driver: the corridor-aware
                          rider app shows the rider where to stand
                          along the corridor. The driver runs the
                          corridor as normal; the rider flags them
                          down at the boarding pin. No detour needed. */}
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                        <Icon name="map-pin" className="h-2.5 w-2.5" />
                        Rider waiting along your corridor
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* Tapping "Pick up rider" pops the QR modal.
                          The rider scans, both phones chirp, and the
                          modal swaps to a "Start trip" confirmation.
                          Driver self-tap to picked_up is gone —
                          the rider's scan is still the only path
                          into picked_up state on the server. */}
                      <button
                        type="button"
                        onClick={() => setPickupHailId(h.id)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/25 transition-all hover:-translate-y-0.5 hover:bg-amber-700 sm:flex-none"
                      >
                        <Icon name="check-circle" className="h-3.5 w-3.5" />
                        Pick up rider
                      </button>
                      <button
                        type="button"
                        onClick={() => onTransition(h.id, "cancelled")}
                        disabled={isPending(h.id, "cancelled")}
                        className="rounded-full border border-amber-700/30 bg-white px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </FadeUp>
      )}

      {/* Boarding QR is no longer rendered standalone on the page.
         The QR pops up on demand inside the PickupModal when the
         driver taps "Pick up rider" on an accepted hail — keeps the
         session screen clean and makes the action sequence explicit
         on both ends (driver acts → modal opens → rider scans →
         beep on both phones → trip starts). */}

      {/* Live map — shows the driver's GPS pin + the next-action
         pickup/dropoff so they always know where to head. Mirrors
         the rider's live-trip map: one driver, one target. */}
      {showMap && (
        <FadeUp delay={0.03}>
          <section className="overflow-hidden rounded-3xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line bg-surface-soft px-5 py-3">
              <div className="min-w-0">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  {nextAction?.kind === "dropoff"
                    ? "Drop off next"
                    : nextAction?.kind === "pickup"
                      ? onboard.length > 0 || accepted.length > 0
                        ? "Pick up next"
                        : "Closest hail"
                      : "Live map"}
                </p>
                <p className="truncate text-sm font-bold">
                  {nextAction?.place.name ?? "Waiting for hails…"}
                </p>
              </div>
              {!driverPosition && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200">
                  Awaiting GPS
                </span>
              )}
            </div>
            <MapView
              viewer="driver"
              pickup={
                nextAction?.kind === "pickup" ? nextAction.place : null
              }
              stops={[]}
              dropoff={
                nextAction?.kind === "dropoff" ? nextAction.place : null
              }
              boarding={driverMapOverlays.boarding}
              alighting={driverMapOverlays.alighting}
              corridorLines={driverMapOverlays.corridorLines}
              driverPosition={driverPosition}
              liveRoute={
                nextAction
                  ? { target: nextAction.kind }
                  : null
              }
              className="h-72 w-full"
            />
          </section>
        </FadeUp>
      )}

      {actionError && (
        <FadeUp delay={0.04}>
          <div className="flex items-start gap-3 rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 font-medium">{actionError}</p>
            <button
              type="button"
              onClick={clearError}
              className="text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>
        </FadeUp>
      )}

      {/* ONBOARD */}
      {onboard.length > 0 && (
        <FadeUp delay={0.05}>
          <section>
            <SectionHeader
              eyebrow="Onboard"
              title={`${onboard.length} rider${onboard.length === 1 ? "" : "s"} in the car`}
            />
            <ul className="mt-3 space-y-2.5">
              {onboard.map((h) => (
                <li
                  key={h.id}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                >
                  {h.rider && (
                    <RiderBadge
                      rider={h.rider}
                      hailId={h.id}
                      pickupLat={h.pickupLat}
                      pickupLng={h.pickupLng}
                      tone="emerald"
                      onMessage={() =>
                        setChatHail({
                          id: h.id,
                          riderName: h.rider?.name ?? null,
                          riderAvatarUrl: h.rider?.avatarUrl ?? null,
                        })
                      }
                    />
                  )}
                  <div className="mt-3 space-y-3 sm:flex sm:flex-wrap sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
                    <div className="min-w-0 sm:flex-1">
                      <p className="text-sm font-bold text-emerald-900">
                        {h.pickup} → {h.dropoff}
                      </p>
                      <p className="mt-0.5 text-[11px] text-emerald-800/80">
                        {h.distanceKm.toFixed(1)} km · {formatJMD(h.fareJmd)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDropOffConfirm({
                            hailId: h.id,
                            fareJmd: h.fareJmd,
                            pickup: h.pickup,
                            dropoff: h.dropoff,
                          })
                        }
                        disabled={isPending(h.id, "completed")}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:-translate-y-0.5 hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
                      >
                        <Icon name="check-circle" className="h-3.5 w-3.5" />
                        {isPending(h.id, "completed")
                          ? "Settling…"
                          : `Drop off · ${formatJMD(h.fareJmd)}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => onTransition(h.id, "cancelled")}
                        disabled={isPending(h.id, "cancelled")}
                        className="rounded-full border border-emerald-700/30 bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </FadeUp>
      )}

      {/* Drop-off confirmation — front-stops the irreversible
         settlement so the driver gets one explicit "yes, charge the
         rider" before the wallet debit fires. Mirrors the private-
         ride Complete-trip dialog at /driver/active-trip so both
         modes ask before taking money. Cancel just closes; Confirm
         calls the same `onTransition(hailId, "completed")` the
         button used to call directly. */}
      {dropOffConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-rajlo-black/60 p-4 backdrop-blur-sm md:items-center">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-surface p-5 shadow-2xl md:p-6">
            <div>
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Drop off
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">
                Confirm drop-off and settle?
              </h2>
              <p className="mt-2 text-sm text-muted">
                Tapping confirm charges the rider{" "}
                <span className="font-bold text-foreground">
                  {formatJMD(dropOffConfirm.fareJmd)}
                </span>{" "}
                for{" "}
                <span className="font-bold text-foreground">
                  {dropOffConfirm.pickup} → {dropOffConfirm.dropoff}
                </span>
                . You can&apos;t undo it.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDropOffConfirm(null)}
                disabled={isPending(dropOffConfirm.hailId, "completed")}
                className="inline-flex w-full items-center justify-center rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-muted hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => {
                  const hailId = dropOffConfirm.hailId;
                  setDropOffConfirm(null);
                  void onTransition(hailId, "completed");
                }}
                disabled={isPending(dropOffConfirm.hailId, "completed")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isPending(dropOffConfirm.hailId, "completed") ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon name="check-circle" className="h-4 w-4" />
                )}
                Yes, drop off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat sheet — single instance, opens for whichever hail the
         driver tapped. RLS ensures the driver can only see + send on
         hails attached to their session. */}
      {chatHail && (
        <HailChatSheet
          hailId={chatHail.id}
          open
          onClose={() => setChatHail(null)}
          counterpartName={chatHail.riderName ?? "Rider"}
          counterpartAvatarUrl={chatHail.riderAvatarUrl}
        />
      )}

      {/* Pickup modal — pops up when the driver taps "Pick up rider"
         on an accepted hail. Shows the session QR for the rider to
         scan; auto-detects the status flip from accepted → picked_up
         (via parent re-render) and swaps to the "Start trip" success
         state with a beep. */}
      {pickupHailId &&
        (() => {
          const acceptedHail = accepted.find((h) => h.id === pickupHailId);
          const onboardHail = onboard.find((h) => h.id === pickupHailId);
          // If the hail vanished (rider cancelled, journey aborted),
          // close the modal next tick.
          if (!acceptedHail && !onboardHail) {
            return (
              <PickupModal
                sessionId={session.id}
                pickupCode={session.pickupCode ?? null}
                hailStatus="missing"
                rider={null}
                pickup={null}
                dropoff={null}
                onClose={() => setPickupHailId(null)}
              />
            );
          }
          const live = (onboardHail ?? acceptedHail)!;
          return (
            <PickupModal
              sessionId={session.id}
              pickupCode={session.pickupCode ?? null}
              hailStatus={onboardHail ? "picked_up" : "accepted"}
              rider={live.rider ?? null}
              pickup={live.pickup}
              dropoff={live.dropoff}
              onClose={() => setPickupHailId(null)}
            />
          );
        })()}
    </div>
  );
}

/* ════════════ Geolocation push hook ════════════ */

/**
 * While `enabled` is true, sample the browser geolocation every 15s
 * and POST it to the session position endpoint. No-ops cleanly when
 * the user denies permission or the browser doesn't support geo.
 *
 * 15s strikes the balance: granular enough that the matcher's
 * proximity sort feels live, infrequent enough that we don't drain
 * the driver's battery while they're parked at a stand.
 */
function useDriverPositionPush(
  enabled: boolean,
  onPosition?: (pos: { lat: number; lng: number }) => void,
): void {
  // Hold the latest callback in a ref so changes to it don't restart
  // the interval (would cause a fresh GPS prompt every render).
  const onPositionRef = useRef(onPosition);
  useEffect(() => {
    onPositionRef.current = onPosition;
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    const push = () => {
      if (cancelled) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          onPositionRef.current?.({ lat, lng });
          void fetch("/api/driver/route-taxi/sessions/position", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng }),
          }).catch(() => {
            /* offline / 5xx — next tick will retry */
          });
        },
        () => {
          /* permission denied / timeout — drop this tick silently */
        },
        { enableHighAccuracy: false, maximumAge: 10_000, timeout: 8_000 },
      );
    };

    push();
    const id = setInterval(push, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);
}

function SectionHeader({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-extrabold tracking-tight md:text-xl">
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function RouteTaxiSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full" rounded="2xl" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/* ════════════ Pickup modal ════════════
 *
 * Pops up when the driver taps "Pick up rider" on an accepted hail.
 * Two states:
 *
 *   1. `accepted` — rider hasn't scanned yet. Modal renders the
 *      session QR + a "waiting for rider to scan" pulse.
 *
 *   2. `picked_up` — the parent's polling detected the status flip
 *      (rider's scan endpoint moved the hail from accepted to
 *      onboard). Modal swaps to a success state, fires a beep, and
 *      shows a "Start trip" CTA the driver taps to dismiss.
 *
 * The actual money-moving + status-changing happens server-side via
 * the rider's POST to /api/rider/route-taxi/hails/[id]/scan. The
 * modal is purely a presentation surface — closing it doesn't undo
 * the pickup.
 */
function PickupModal({
  sessionId,
  pickupCode,
  hailStatus,
  rider,
  pickup,
  dropoff,
  onClose,
}: {
  sessionId: string;
  pickupCode: string | null;
  hailStatus: "accepted" | "picked_up" | "missing";
  rider: { name: string | null; avatarUrl: string | null; phone: string | null } | null;
  pickup: string | null;
  dropoff: string | null;
  onClose: () => void;
}) {
  // Fire the beep exactly once when status crosses from accepted to
  // picked_up. A ref-flag guards against double-beeps from React
  // re-renders.
  const beepedRef = useRef(false);
  useEffect(() => {
    if (hailStatus === "picked_up" && !beepedRef.current) {
      beepedRef.current = true;
      playScanBeep();
    }
  }, [hailStatus]);

  const success = hailStatus === "picked_up";
  const missing = hailStatus === "missing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-rajlo-black text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            {success ? "Trip started" : missing ? "Pickup ended" : "Pick up rider"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pickup modal"
            className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {missing ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm font-bold">
              This pickup is no longer active.
            </p>
            <p className="mt-1 text-xs text-white/70">
              The rider may have cancelled before scanning. Close to
              continue.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-rajlo-black hover:bg-white/90"
            >
              Got it
            </button>
          </div>
        ) : success ? (
          <div className="px-6 py-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40">
              <Icon name="check-circle" className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-extrabold tracking-tight">
              Rider scanned in
            </p>
            <p className="mt-1 text-xs text-white/70">
              {rider?.name ?? "Your rider"} is onboard
              {dropoff ? ` — heading to ${dropoff}` : ""}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-3 text-sm font-bold text-white shadow-md shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Start trip
              <Icon name="arrow-right" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="px-6 py-6">
            <div className="grid place-items-center">
              <SessionQr sessionId={sessionId} size={220} />
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-bold">
                {rider?.name ?? "Your rider"} scans this code to start
              </p>
              {pickup && (
                <p className="mt-1 text-[11px] text-white/70">
                  Pickup at {pickup}
                  {dropoff ? ` → ${dropoff}` : ""}
                </p>
              )}
            </div>

            {/* Manual-entry fallback — surfaced inline so a rider
                with a dead camera can read these 4 chars off the
                screen and type them on their phone. The rider's
                scan endpoint accepts either the QR's session UUID
                or this code (active-only lookup). */}
            {pickupCode && (
              <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-white/55">
                  Camera not working? Read this code aloud
                </p>
                <p className="mt-1 text-center font-mono text-3xl font-extrabold tracking-[0.4em] text-white">
                  {pickupCode}
                </p>
              </div>
            )}

            <div className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/85">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Waiting for rider to scan
            </div>
            <p className="mt-3 text-center text-[10px] text-white/55">
              No money moves until the rider scans. You&apos;ll hear a
              beep on both phones the moment they do.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
