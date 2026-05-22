"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { MapView } from "@/components/map-view";
import { HailChatSheet } from "@/components/hail-chat-sheet";
import { extractSessionId } from "@/components/session-qr";
import { useBackgroundRefresh } from "@/lib/use-background-refresh";
import { useSelfGpsPosition } from "@/lib/use-self-gps";
import { formatJMD, type Place } from "@/lib/jamaica";
import { riderCancellationFeeJmd } from "@/lib/cancellation-fees";

/**
 * /rider/route-taxi/live — Live hailing screen.
 *
 * The single dedicated surface for an in-flight Route Taxi hail.
 * Status-adaptive: the same page reshapes through `requested →
 * accepted → picked_up → completed | cancelled` so the rider stays
 * on one tab through the whole flow.
 *
 * Polling: every 5s while the hail is in motion. Stops once the hail
 * settles (no point hammering the API for a frozen receipt).
 *
 * Driving the design language:
 *   • Hero hue maps to status (dark/red/emerald/muted) so a glance
 *     tells the rider what's happening without reading copy.
 *   • A 4-dot timeline reinforces the same info for accessibility.
 *   • The driver card surfaces the moment a session attaches —
 *     plate, vehicle, call button.
 *   • Fare is permanently visible. After settlement the receipt-style
 *     summary shows the wallet debit and balance.
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
  routeId: string;
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
  /** Set when this hail is one leg of a multi-leg journey. Drives the
   *  journey ladder + transfer-claim panel below. */
  journeyId?: string | null;
  legOrder?: number | null;
  isTransferLeg?: boolean;
  session: null | {
    id: string;
    seatsTaken: number;
    vehicleCapacity: number;
    currentLat: number | null;
    currentLng: number | null;
    lastPositionAt: string | null;
    driver: null | {
      firstName: string | null;
      lastName: string | null;
      plateNumber: string | null;
      vehicleMake: string | null;
      vehicleModel: string | null;
      vehicleColor: string | null;
      phone: string | null;
      selfieUrl: string | null;
    };
  };
  route: null | {
    id: string;
    origin: string;
    destination: string;
    parish: string | null;
    distanceKm: number;
    taFareJmd: number;
  };
};

type Payload = { hail: Hail; walletBalanceJmd: number | null };

/* Shape of /api/rider/route-taxi/journeys/[id] — only the pieces the
 * live page consumes (progress ladder + transfer-claim panel). The
 * server endpoint returns more; we ignore what we don't need. */
type JourneyLegSummary = {
  hailId: string;
  legOrder: number | null;
  isTransferLeg: boolean;
  status: string;
  pickup: { name: string };
  dropoff: { name: string };
  fareJmd: number;
};
type JourneyPayload = {
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
  currentLeg: { hailId: string; legOrder: number | null } | null;
};

export default function RiderRouteTaxiLivePage() {
  return (
    <Suspense fallback={<LoadingFrame />}>
      <LiveInner />
    </Suspense>
  );
}

function LiveInner() {
  const router = useRouter();
  const params = useSearchParams();
  const hailId = params.get("id");

  const [data, setData] = useState<Payload | null>(null);
  const [journey, setJourney] = useState<JourneyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!hailId) return;
    try {
      const res = await fetch(`/api/rider/route-taxi/hails/${hailId}`);
      if (res.status === 404) {
        setError("This hail isn't yours, or it expired. Try a new ride.");
        return;
      }
      if (!res.ok) throw new Error("Couldn't load hail");
      const json = (await res.json()) as Payload;
      setData(json);
      setError(null);

      // Multi-leg awareness: when the hail belongs to a journey, poll
      // the journey endpoint in parallel for the progress ladder +
      // transfer-claim panel. The page transparently redirects to the
      // next leg's hail id once the journey advances.
      const journeyId = json.hail.journeyId;
      if (journeyId) {
        try {
          const jr = await fetch(
            `/api/rider/route-taxi/journeys/${journeyId}`,
          );
          if (jr.ok) {
            const jp = (await jr.json()) as JourneyPayload;
            setJourney(jp);
            if (
              jp.journey.status === "active" &&
              jp.currentLeg &&
              jp.currentLeg.hailId !== hailId
            ) {
              // Leg advanced — bounce the URL to the new hail so
              // subsequent polls fetch the correct row.
              router.replace(
                `/rider/route-taxi/live?id=${jp.currentLeg.hailId}`,
              );
            }
          }
        } catch {
          /* journey fetch is best-effort — single-hail view still works */
        }
      } else {
        setJourney(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network glitch — retrying.");
    } finally {
      setLoading(false);
    }
  }, [hailId, router]);

  // No id in URL → look up the rider's currently active hail and
  // redirect to ?id= form. Falls through to the catalogue if none.
  useEffect(() => {
    if (hailId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rider/route-taxi/hails/active");
        if (!res.ok) {
          router.replace("/rider/route-taxi");
          return;
        }
        const json = (await res.json()) as { hail: { id: string } | null };
        if (cancelled) return;
        if (json.hail) {
          router.replace(`/rider/route-taxi/live?id=${json.hail.id}`);
        } else {
          router.replace("/rider/route-taxi");
        }
      } catch {
        if (!cancelled) router.replace("/rider/route-taxi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hailId, router]);

  useEffect(() => {
    if (!hailId) return;
    void refresh();
  }, [hailId, refresh]);

  // Active states keep polling. Completed / cancelled freeze.
  const isLive =
    data?.hail.status === "requested" ||
    data?.hail.status === "accepted" ||
    data?.hail.status === "picked_up";
  useBackgroundRefresh(refresh, 5000, { enabled: isLive });

  // Scroll to top whenever the hail's status changes — driver
  // accepted, picked up, dropped off, etc. So the rider's eye lands
  // on the new hero copy + timeline rather than wherever they were
  // last scrolled. Skips the first render.
  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const next = data?.hail.status ?? null;
    if (next && lastStatusRef.current && lastStatusRef.current !== next) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    lastStatusRef.current = next;
  }, [data?.hail.status]);

  const cancelHail = async () => {
    if (!hailId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/rider/route-taxi/hails/${hailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "cancelled", reason: "Rider cancelled" }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Cancel failed");
      }
      await refresh();
      setCancelArmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  if (!hailId) return <LoadingFrame />;
  if (loading) return <LoadingFrame />;
  if (error && !data) {
    return (
      <ErrorFrame
        title="We couldn't load your hail"
        message={error}
        href="/rider/route-taxi"
      />
    );
  }
  if (!data) return <LoadingFrame />;

  const { hail } = data;

  return (
    <div className="space-y-5 pb-32">
      {/* Journey progress ladder — only renders when this hail is one
         leg of a multi-leg journey. Sits above the leg's own status
         hero so the rider can always see where they are in the overall
         A→B even while leg-N's driver is en route. */}
      {journey && journey.journey.plannedLegCount > 1 && (
        <FadeUp delay={0.02}>
          <JourneyLadder journey={journey} currentHailId={hail.id} />
        </FadeUp>
      )}

      {/* Transfer-claim panel — shown when this hail is a pending
         transfer leg waiting on a driver. Lets the rider scan the
         driver's QR code in person to lock in that specific car. */}
      {journey &&
        hail.isTransferLeg &&
        hail.status === "requested" &&
        journey.journey.status === "active" && (
          <FadeUp delay={0.03}>
            <TransferClaimPanel
              journeyId={journey.journey.id}
              pickupName={hail.pickup}
              fareJmd={hail.fareJmd}
              onClaimed={() => void refresh()}
            />
          </FadeUp>
        )}

      <FadeUp>
        <StatusHero hail={hail} />
      </FadeUp>

      <FadeUp delay={0.04}>
        <StatusTimeline status={hail.status} />
      </FadeUp>

      {/* If we've been searching for a while with no driver, surface
         the "switch to a private ride" escape hatch. The route taxi
         flow respects the rider's time — five minutes of waiting is
         long enough that the alternative deserves to be loud. For
         multi-leg journeys the upgrade target is the journey's
         destination, not the current corridor's end. */}
      <HailTimeoutBanner hail={hail} journey={journey} />

      {hail.session?.driver && (
        <FadeUp delay={0.06}>
          <DriverCard
            driver={hail.session.driver}
            seatsTaken={hail.session.seatsTaken}
            vehicleCapacity={hail.session.vehicleCapacity}
            chatEnabled={
              hail.status === "accepted" || hail.status === "picked_up"
            }
            onOpenChat={() => setChatOpen(true)}
          />
        </FadeUp>
      )}

      {hail.session?.driver && (
        <HailChatSheet
          hailId={hail.id}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          counterpartName={
            [hail.session.driver.firstName, hail.session.driver.lastName]
              .filter(Boolean)
              .join(" ") || "Driver"
          }
          counterpartAvatarUrl={hail.session.driver.selfieUrl}
        />
      )}

      {(hail.status === "accepted" || hail.status === "picked_up") &&
        hail.session?.currentLat != null &&
        hail.session?.currentLng != null && (
          <FadeUp delay={0.08}>
            <MapBlock hail={hail} />
          </FadeUp>
        )}

      <FadeUp delay={0.1}>
        <FareCard hail={hail} walletBalanceJmd={data.walletBalanceJmd} />
      </FadeUp>

      <FadeUp delay={0.12}>
        <TripDetails hail={hail} />
      </FadeUp>

      <ActionBar
        hail={hail}
        cancelArmed={cancelArmed}
        onArmCancel={() => setCancelArmed(true)}
        onConfirmCancel={cancelHail}
        onDismissCancel={() => setCancelArmed(false)}
        cancelling={cancelling}
      />
    </div>
  );
}

/* ════════════════════ Hero ════════════════════ */

function StatusHero({ hail }: { hail: Hail }) {
  const corridor =
    hail.route?.origin && hail.route?.destination
      ? `${hail.route.origin} → ${hail.route.destination}`
      : `${hail.pickup} → ${hail.dropoff}`;

  const meta =
    hail.status === "requested"
      ? {
          eyebrow: "Searching for the next car",
          title: "Notifying drivers on this corridor",
          bg: "bg-rajlo-black",
          accent: "text-rajlo-red",
          dot: "bg-rajlo-red",
        }
      : hail.status === "accepted"
        ? {
            eyebrow: "Driver on the way",
            title: "Heading to your pickup",
            bg: "bg-gradient-to-br from-rajlo-red via-rajlo-red to-[#a30000]",
            accent: "text-white",
            dot: "bg-white",
          }
        : hail.status === "picked_up"
          ? {
              eyebrow: "Trip in progress",
              title: "You're onboard",
              bg: "bg-gradient-to-br from-emerald-700 via-emerald-700 to-emerald-900",
              accent: "text-emerald-100",
              dot: "bg-emerald-200",
            }
          : hail.status === "completed"
            ? {
                eyebrow: "Trip complete",
                title: "Wallet debited",
                bg: "bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900",
                accent: "text-emerald-100",
                dot: "bg-emerald-200",
              }
            : {
                eyebrow:
                  hail.status === "cancelled" ? "Cancelled" : "Did not board",
                title:
                  hail.status === "cancelled"
                    ? "Your hail was cancelled"
                    : "We didn't catch you in time",
                bg: "bg-rajlo-black",
                accent: "text-muted",
                dot: "bg-muted",
              };

  return (
    <section
      className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10 ${meta.bg}`}
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
          {(hail.status === "requested" ||
            hail.status === "accepted" ||
            hail.status === "picked_up") && (
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${meta.dot}`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`}
              />
            </span>
          )}
          <span
            className={`font-secondary text-xs font-bold uppercase tracking-wider ${meta.accent}`}
          >
            {meta.eyebrow}
          </span>
          <span className="h-px flex-1 bg-white/15" />
        </div>
        <h1 className="mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-4xl">
          {meta.title}
        </h1>
        <p className="mt-1 text-sm text-white/75">{corridor}</p>

        {hail.status === "requested" && (
          <>
            <p className="mt-3 max-w-md text-xs text-white/65">
              Drivers running this route are getting notified now. Usually under
              a minute.
            </p>
            <SearchCountdown requestedAt={hail.requestedAt} />
          </>
        )}
        {hail.status === "cancelled" && hail.cancellationReason && (
          <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/85">
            {hail.cancellationReason}
          </p>
        )}
      </div>
    </section>
  );
}

/* ════════════════════ Timeline ════════════════════ */

function StatusTimeline({ status }: { status: HailStatus }) {
  const steps: Array<{ key: HailStatus; label: string }> = [
    { key: "requested", label: "Hailed" },
    { key: "accepted", label: "Driver" },
    { key: "picked_up", label: "Onboard" },
    { key: "completed", label: "Done" },
  ];
  const order = steps.findIndex((s) => s.key === status);
  const isCancelled = status === "cancelled" || status === "no_show";

  return (
    <section className="rounded-2xl border border-line bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        {steps.map((s, i) => {
          const reached = !isCancelled && i <= order;
          const current = !isCancelled && i === order && status !== "completed";
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`relative grid h-7 w-7 place-items-center rounded-full ring-2 ${
                    reached
                      ? "bg-rajlo-red text-white ring-rajlo-red"
                      : "bg-surface-soft text-muted ring-line"
                  }`}
                >
                  {current && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rajlo-red opacity-50" />
                  )}
                  {reached ? (
                    <Icon name="check-circle" className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    reached ? "text-foreground" : "text-muted"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  className={`mx-2 h-[2px] flex-1 rounded-full ${
                    reached && i < order
                      ? "bg-rajlo-red"
                      : "bg-line"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {isCancelled && (
        <p className="font-secondary mt-3 text-center text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
          {status === "cancelled" ? "Hail cancelled" : "No-show recorded"}
        </p>
      )}
    </section>
  );
}

/* ════════════════════ Search countdown ════════════════════
 * Live "we'll keep searching for X more" pill that ticks every
 * second so the rider knows how long until we surface the
 * "switch to private ride" offer.
 */
function SearchCountdown({ requestedAt }: { requestedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const total = HAIL_TIMEOUT_MINUTES * 60 * 1000;
  const elapsed = now - new Date(requestedAt).getTime();
  const remaining = Math.max(0, total - elapsed);
  const mm = Math.floor(remaining / 60_000);
  const ss = String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0");
  const pct = Math.min(100, (elapsed / total) * 100);

  return (
    <div className="mt-4 max-w-sm">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/75">
        <span>Searching</span>
        <span>
          {mm}:{ss} until private-ride offer
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-rajlo-red transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ════════════════════ Hail timeout banner ════════════════════ */

const HAIL_TIMEOUT_MINUTES = 5;

function HailTimeoutBanner({
  hail,
  journey,
}: {
  hail: Hail;
  journey: JourneyPayload | null;
}) {
  const router = useRouter();
  // Re-render every 15s so the "X min waiting" copy stays fresh
  // without coupling to the polling cadence above.
  const [now, setNow] = useState(() => Date.now());
  const [switching, setSwitching] = useState(false);
  // Lets the rider snooze the banner once — "keep searching"
  // suppresses it for another HAIL_TIMEOUT_MINUTES window so it
  // doesn't immediately re-appear after they dismiss it.
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  useEffect(() => {
    if (hail.status !== "requested") return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [hail.status]);

  if (hail.status !== "requested") return null;

  const waitedMin = Math.floor(
    (now - new Date(hail.requestedAt).getTime()) / 60_000,
  );
  if (waitedMin < HAIL_TIMEOUT_MINUTES) return null;
  if (snoozedUntil && now < snoozedUntil) return null;

  const isJourneyTransfer =
    !!journey &&
    !!hail.journeyId &&
    journey.journey.plannedLegCount > 1;

  // Build the deep link back to /rider/request with both endpoints
  // pre-filled. For a multi-leg journey we upgrade to a private ride
  // covering THE REST OF THE TRIP — current transfer point to the
  // journey's final destination. For a regular single-leg hail we use
  // the hail's own endpoints (legacy behaviour, unchanged).
  const params = new URLSearchParams();
  const fromName = hail.pickup;
  const fromLat = hail.pickupLat;
  const fromLng = hail.pickupLng;
  if (fromName) params.set("from_name", fromName);
  if (fromLat) params.set("from_lat", String(fromLat));
  if (fromLng) params.set("from_lng", String(fromLng));
  if (isJourneyTransfer && journey) {
    params.set("to_name", journey.journey.destination);
    // Journey destination coords aren't on JourneyPayload — fall back
    // to the rider's typed dropoff (hail's own) which on the FINAL leg
    // already is the destination. For mid-journey transfer legs the
    // typed name is the only honest hint we can pass; the request
    // page autocompletes it on focus.
    if (hail.dropoffLat) params.set("to_lat", String(hail.dropoffLat));
    if (hail.dropoffLng) params.set("to_lng", String(hail.dropoffLng));
  } else {
    if (hail.dropoff) params.set("to_name", hail.dropoff);
    if (hail.dropoffLat) params.set("to_lat", String(hail.dropoffLat));
    if (hail.dropoffLng) params.set("to_lng", String(hail.dropoffLng));
  }
  const requestHref = `/rider/request?${params.toString()}`;

  const switchToPrivate = async () => {
    setSwitching(true);
    // Cancel the hail first so the rider doesn't end up with two
    // open requests. We don't block on cancel failure — the navigate
    // happens either way (a stale hail is harmless; the rider can
    // see + cancel it from the live page if they come back to it).
    await fetch(`/api/rider/route-taxi/hails/${hail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "cancelled",
        reason: "Switched to a private ride after waiting",
      }),
    }).catch(() => null);
    router.push(requestHref);
  };

  return (
    <FadeUp delay={0.05}>
      <section className="overflow-hidden rounded-3xl border border-amber-300 bg-amber-50">
        <div className="flex items-start gap-3 p-5 md:p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
            <Icon name="clock" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Still searching · {waitedMin} min waiting
            </p>
            <p className="mt-0.5 text-sm font-extrabold tracking-tight text-amber-900 md:text-base">
              {isJourneyTransfer
                ? "No transfer driver yet"
                : "No route taxi has accepted yet"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
              {isJourneyTransfer
                ? "Finish the rest of your trip in a private ride — your locked balance covers the difference, and any remaining hold is refunded."
                : "Switch to a private ride and you'll be picked up directly — your wallet covers it."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-amber-200 bg-white px-5 py-3">
          <button
            type="button"
            onClick={() =>
              setSnoozedUntil(now + HAIL_TIMEOUT_MINUTES * 60_000)
            }
            disabled={switching}
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep searching
          </button>
          <button
            type="button"
            onClick={switchToPrivate}
            disabled={switching}
            className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white shadow-md shadow-rajlo-red/25 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {switching ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Switching…
              </>
            ) : (
              <>
                {isJourneyTransfer
                  ? "Finish in a private ride"
                  : "Book a private ride"}
                <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </section>
    </FadeUp>
  );
}

/* ════════════════════ Driver card ════════════════════ */

function DriverCard({
  driver,
  seatsTaken,
  vehicleCapacity,
  chatEnabled,
  onOpenChat,
}: {
  driver: NonNullable<NonNullable<Hail["session"]>["driver"]>;
  seatsTaken: number;
  vehicleCapacity: number;
  chatEnabled: boolean;
  onOpenChat: () => void;
}) {
  const fullName =
    [driver.firstName, driver.lastName].filter(Boolean).join(" ") ||
    "Your driver";
  const initial = (driver.firstName?.[0] ?? "D").toUpperCase();
  const vehicle =
    [driver.vehicleColor, driver.vehicleMake, driver.vehicleModel]
      .filter(Boolean)
      .join(" ") || null;

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
      <div className="flex items-center gap-4">
        {driver.selfieUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.selfieUrl}
            alt={`${driver.firstName ?? "Driver"}'s photo`}
            className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-md shadow-rajlo-red/30 ring-2 ring-rajlo-red"
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rajlo-red via-rajlo-red to-[#7a0000] text-2xl font-extrabold text-white shadow-md shadow-rajlo-red/30">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Your driver
          </p>
          <p className="truncate text-base font-extrabold tracking-tight md:text-lg">
            {fullName}
          </p>
          <p className="truncate text-xs text-muted">
            {vehicle ?? "Vehicle details unavailable"}
          </p>
        </div>
        {driver.phone && (
          <a
            href={`tel:${driver.phone}`}
            aria-label="Call driver"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white shadow-md shadow-rajlo-red/25 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            <Icon name="phone" className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {driver.plateNumber && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-black px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
            <Icon name="car" className="h-3 w-3" />
            {driver.plateNumber}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-[11px] font-bold text-muted">
          <Icon name="users" className="h-3 w-3" />
          {seatsTaken}/{vehicleCapacity}
        </span>
        {chatEnabled && (
          <button
            type="button"
            onClick={onOpenChat}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-primary-hover"
          >
            <Icon name="mail" className="h-3.5 w-3.5" />
            Message driver
          </button>
        )}
      </div>
    </section>
  );
}

/* ════════════════════ Map ════════════════════ */

function MapBlock({ hail }: { hail: Hail }) {
  const pickup: Place | null = useMemo(
    () =>
      hail.pickupLat && hail.pickupLng
        ? {
            placeId: "",
            name: hail.pickup,
            address: hail.pickup,
            lat: hail.pickupLat,
            lng: hail.pickupLng,
            parish: null,
          }
        : null,
    [hail.pickup, hail.pickupLat, hail.pickupLng],
  );

  const dropoff: Place | null = useMemo(
    () =>
      hail.dropoffLat && hail.dropoffLng
        ? {
            placeId: "",
            name: hail.dropoff,
            address: hail.dropoff,
            lat: hail.dropoffLat,
            lng: hail.dropoffLng,
            parish: null,
          }
        : null,
    [hail.dropoff, hail.dropoffLat, hail.dropoffLng],
  );

  const driverPos =
    hail.session?.currentLat != null && hail.session?.currentLng != null
      ? { lat: hail.session.currentLat, lng: hail.session.currentLng }
      : null;

  // Rider's own GPS for their map marker. Active during every phase
  // except the terminal ones (completed / cancelled / no_show) so the
  // rider sees their dot from "looking for a driver" right through
  // pickup. We don't broadcast — driver position comes via polling on
  // the hail row, not Realtime, so a channel here would be overhead.
  const trackingActive = ["requested", "accepted", "picked_up"].includes(
    hail.status,
  );
  const { position: riderSelf } = useSelfGpsPosition(trackingActive);
  const riderPosition = riderSelf
    ? { lat: riderSelf.lat, lng: riderSelf.lng }
    : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <MapView
        pickup={pickup}
        stops={[]}
        dropoff={dropoff}
        driverPosition={driverPos}
        riderPosition={riderPosition}
        liveRoute={
          hail.status === "accepted"
            ? { target: "pickup" }
            : { target: "dropoff" }
        }
        className="h-72 w-full"
      />
    </section>
  );
}

/* ════════════════════ Fare card ════════════════════ */

function FareCard({
  hail,
  walletBalanceJmd,
}: {
  hail: Hail;
  walletBalanceJmd: number | null;
}) {
  const settled = hail.status === "completed";

  return (
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
            {settled ? "Charged" : "Fare"}
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tracking-tight md:text-4xl">
            {formatJMD(hail.fareJmd)}
          </p>
          <p
            className={`mt-1 text-[11px] ${
              settled ? "text-emerald-900/80" : "text-muted"
            }`}
          >
            {hail.concession ? "Concession (half-fare) · " : ""}
            {hail.distanceKm.toFixed(1)} km · TA-regulated
          </p>
        </div>
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
            settled
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
              : "bg-primary-soft text-rajlo-red"
          }`}
        >
          <Icon name={settled ? "check-circle" : "wallet"} className="h-5 w-5" />
        </span>
      </div>

      {settled ? (
        <div className="border-t border-emerald-200 bg-white px-5 py-3 text-[11px] text-emerald-900">
          {walletBalanceJmd != null ? (
            <>
              Auto-debited from your wallet · balance now{" "}
              <span className="font-extrabold">
                {formatJMD(walletBalanceJmd)}
              </span>
            </>
          ) : (
            "Auto-debited from your wallet."
          )}
        </div>
      ) : (
        <div className="border-t border-line bg-surface-soft px-5 py-3 text-[11px] text-muted">
          Charged to your wallet at drop-off — no cash.
        </div>
      )}
    </section>
  );
}

/* ════════════════════ Trip details ════════════════════ */

function TripDetails({ hail }: { hail: Hail }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
        Trip details
      </p>
      <div className="mt-3 space-y-3">
        <DetailLeg
          icon="map-pin"
          label="Pickup"
          place={hail.pickup}
          time={hail.pickedUpAt ?? hail.acceptedAt}
        />
        <span className="ml-3 block h-4 w-px bg-line" />
        <DetailLeg
          icon="navigation"
          label="Dropoff"
          place={hail.dropoff}
          time={hail.completedAt}
        />
      </div>
    </section>
  );
}

function DetailLeg({
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
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {label}
        </p>
        <p className="truncate text-sm font-bold">{place}</p>
      </div>
      {time && (
        <p className="shrink-0 text-[11px] text-muted">{friendlyTime(time)}</p>
      )}
    </div>
  );
}

/* ════════════════════ Action bar ════════════════════ */

function ActionBar({
  hail,
  cancelArmed,
  onArmCancel,
  onConfirmCancel,
  onDismissCancel,
  cancelling,
}: {
  hail: Hail;
  cancelArmed: boolean;
  onArmCancel: () => void;
  onConfirmCancel: () => void;
  onDismissCancel: () => void;
  cancelling: boolean;
}) {
  const canCancel =
    hail.status === "requested" || hail.status === "accepted";
  const isTerminal =
    hail.status === "completed" ||
    hail.status === "cancelled" ||
    hail.status === "no_show";
  // Cancellation fee that would apply right now — J$0 while still
  // `requested` or inside the 2-min grace window, J$100 once a driver
  // has accepted and the window has passed. Surfaced before the rider
  // confirms so the charge is never a surprise.
  const cancelFeeJmd = riderCancellationFeeJmd(
    hail.status,
    hail.requestedAt,
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-3 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur md:px-4 md:py-4">
      {canCancel && cancelArmed && cancelFeeJmd > 0 && (
        <div className="mx-auto mb-2 max-w-3xl rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold leading-snug text-amber-900">
            Cancelling now charges a{" "}
            <span className="font-extrabold">
              J${cancelFeeJmd.toLocaleString("en-JM")}
            </span>{" "}
            cancellation fee, deducted from your wallet.
          </p>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            {isTerminal ? "Trip" : "Hail"}
          </p>
          <p className="truncate text-sm font-extrabold tracking-tight">
            {formatJMD(hail.fareJmd)}
          </p>
        </div>

        {canCancel && !cancelArmed && (
          <button
            type="button"
            onClick={onArmCancel}
            className="rounded-full border border-line bg-surface px-4 py-2.5 text-xs font-bold text-muted hover:border-rajlo-red hover:text-rajlo-red"
          >
            Cancel hail
          </button>
        )}

        {canCancel && cancelArmed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDismissCancel}
              disabled={cancelling}
              className="rounded-full border border-line bg-surface px-4 py-2.5 text-xs font-bold text-muted hover:bg-surface-soft disabled:opacity-50"
            >
              Keep waiting
            </button>
            <button
              type="button"
              onClick={onConfirmCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-rajlo-red/25 disabled:opacity-50"
            >
              {cancelling ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Cancelling…
                </>
              ) : (
                "Yes, cancel"
              )}
            </button>
          </div>
        )}

        {isTerminal && (
          <Link
            href="/rider/request"
            className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/25 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            Hail another
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ════════════════════ Skeletons & misc ════════════════════ */

function LoadingFrame() {
  return (
    <div className="space-y-5 pb-32">
      <Skeleton className="h-44 w-full" rounded="3xl" />
      <Skeleton className="h-16 w-full" rounded="2xl" />
      <Skeleton className="h-24 w-full" rounded="3xl" />
      <Skeleton className="h-72 w-full" rounded="3xl" />
      <Skeleton className="h-28 w-full" rounded="3xl" />
    </div>
  );
}

function ErrorFrame({
  title,
  message,
  href,
}: {
  title: string;
  message: string;
  href: string;
}) {
  return (
    <section className="rounded-3xl border border-rajlo-red/30 bg-primary-soft p-7 text-center md:p-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rajlo-red text-white shadow-md shadow-rajlo-red/25">
        <Icon name="alert-triangle" className="h-6 w-6" />
      </span>
      <p className="mt-4 text-base font-extrabold tracking-tight text-rajlo-black">
        {title}
      </p>
      <p className="mt-1 text-xs text-rajlo-black/70">{message}</p>
      <Link
        href={href}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/25 hover:-translate-y-0.5 hover:bg-primary-hover"
      >
        Hail a route taxi
        <Icon name="arrow-right" className="h-4 w-4" />
      </Link>
    </section>
  );
}

function friendlyTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  return d.toLocaleTimeString("en-JM", { hour: "numeric", minute: "2-digit" });
}

/* ══════════════════════ Multi-leg journey UI ══════════════════════
 * Renders only when the active hail belongs to a `route_journeys`
 * row. The ladder gives the rider a permanent "where am I in the
 * trip" view; the claim panel lets them scan the next driver's QR
 * code when they arrive at a transfer point.
 * ════════════════════════════════════════════════════════════════ */

function JourneyLadder({
  journey,
  currentHailId,
}: {
  journey: JourneyPayload;
  currentHailId: string;
}) {
  const { plannedLegCount, completedLegCount, totalFareJmd, settledFareJmd } =
    journey.journey;
  const legs = [...journey.legs].sort(
    (a, b) => (a.legOrder ?? 0) - (b.legOrder ?? 0),
  );
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
          Journey · {completedLegCount} of {plannedLegCount} legs done
        </p>
        <p className="text-[11px] font-bold text-muted">
          {formatJMD(settledFareJmd)} settled · {formatJMD(totalFareJmd)} total
        </p>
      </div>
      <ol className="mt-3 space-y-2.5">
        {legs.map((leg, idx) => {
          const isCurrent = leg.hailId === currentHailId;
          const isDone = leg.status === "completed";
          const isCancelled = leg.status === "cancelled";
          const tone = isDone
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : isCurrent
              ? "border-rajlo-red/40 bg-primary-soft text-rajlo-black"
              : isCancelled
                ? "border-line bg-surface-soft text-muted line-through"
                : "border-line bg-surface text-foreground";
          return (
            <li
              key={leg.hailId}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${tone}`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  isDone
                    ? "bg-emerald-500 text-white"
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
                <p className="truncate text-sm font-extrabold tracking-tight">
                  {leg.pickup.name} <span className="text-rajlo-red">→</span>{" "}
                  {leg.dropoff.name}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {legLabel(leg.status)}
                  {leg.isTransferLeg ? " · transfer leg" : ""}
                </p>
              </div>
              <p className="shrink-0 text-[11px] font-bold tabular-nums">
                {formatJMD(leg.fareJmd)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function legLabel(status: string): string {
  switch (status) {
    case "requested":
      return "waiting on driver";
    case "accepted":
      return "driver matched";
    case "picked_up":
      return "in progress";
    case "completed":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return status;
  }
}

function TransferClaimPanel({
  journeyId,
  pickupName,
  fareJmd,
  onClaimed,
}: {
  journeyId: string;
  pickupName: string;
  fareJmd: number;
  onClaimed: () => void;
}) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualId, setManualId] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const claim = useCallback(
    async (sessionId: string) => {
      setClaiming(true);
      setClaimError(null);
      try {
        const res = await fetch(
          `/api/rider/route-taxi/journeys/${journeyId}/claim`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(
            json.message ?? json.error ?? "Couldn't lock in that driver.",
          );
        }
        setScannerOpen(false);
        setManualId("");
        onClaimed();
      } catch (e) {
        setClaimError(
          e instanceof Error ? e.message : "Couldn't lock in that driver.",
        );
      } finally {
        setClaiming(false);
      }
    },
    [journeyId, onClaimed],
  );

  return (
    <section className="rounded-3xl border border-rajlo-red/30 bg-primary-soft p-6 md:p-7">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
        Next leg · transfer
      </p>
      <h2 className="mt-1 text-xl font-extrabold tracking-tight">
        Find your next route taxi
      </h2>
      <p className="mt-1 text-sm text-rajlo-black/75">
        We&apos;ve notified drivers heading through{" "}
        <span className="font-bold">{pickupName}</span>. When the next car
        pulls up, scan the driver&apos;s QR code to lock them in for the next
        leg — {formatJMD(fareJmd)}.
      </p>
      {claimError && (
        <p className="mt-3 rounded-xl border border-rajlo-red/40 bg-white px-3 py-2 text-xs font-semibold text-rajlo-red">
          {claimError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={claiming}
        >
          <Icon name="search" className="h-4 w-4" />
          Scan driver QR
        </button>
        <details className="group rounded-full border border-line bg-white px-4 py-2.5 text-xs font-bold">
          <summary className="cursor-pointer select-none list-none">
            Type code instead
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="text"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="Session UUID from driver's screen"
              className="rounded-xl border border-line bg-white px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={claiming || !manualId.trim()}
              onClick={() => {
                const sid = extractSessionId(manualId);
                if (sid) void claim(sid);
                else setClaimError("That doesn't look like a session code.");
              }}
              className="rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {claiming ? "Locking in…" : "Lock in"}
            </button>
          </div>
        </details>
      </div>
      {scannerOpen && (
        <SessionScannerModal
          onClose={() => setScannerOpen(false)}
          onDetected={(sid) => {
            void claim(sid);
          }}
          claiming={claiming}
        />
      )}
    </section>
  );
}

/* ──────────────────────── Session QR scanner ────────────────────────
 * Same BarcodeDetector pattern as /rider/qr-pay, narrowed to extract
 * a Rajlo session UUID from the canonical `rajlo://route-taxi/session/`
 * payload. Closes the camera stream on unmount / detection.
 * ─────────────────────────────────────────────────────────────────── */

type ScannerWindow = Window & {
  BarcodeDetector?: new (opts: { formats: string[] }) => {
    detect: (
      source: HTMLVideoElement,
    ) => Promise<Array<{ rawValue: string }>>;
  };
};

function SessionScannerModal({
  onClose,
  onDetected,
  claiming,
}: {
  onClose: () => void;
  onDetected: (sessionId: string) => void;
  claiming: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const w = window as ScannerWindow;
      const Detector = w.BarcodeDetector;
      if (!Detector) {
        if (!cancelled) {
          setScanError(
            "This browser can't open the camera. Type the code instead.",
          );
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }
        const detector = new Detector({ formats: ["qr_code"] });
        intervalId = setInterval(async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const c of codes) {
              const sid = extractSessionId(c.rawValue);
              if (sid) {
                if (intervalId) clearInterval(intervalId);
                onDetected(sid);
                return;
              }
            }
          } catch {
            /* per-frame failure — next tick retries */
          }
        }, 500);
      } catch (e) {
        if (cancelled) return;
        setScanError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera permission denied. Type the code instead."
            : "Couldn't open the camera. Type the code instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [onDetected]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 px-4 py-8 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-rajlo-black shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Scan driver QR
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="relative aspect-square w-full bg-black">
          {scanError ? (
            <div className="grid h-full place-items-center px-8 text-center text-white">
              <p className="text-sm font-semibold">{scanError}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="px-5 py-3 text-center text-[11px] text-white/70">
          {claiming
            ? "Locking in your next driver…"
            : "Point at the QR on the driver's screen."}
        </div>
      </div>
    </div>
  );
}
