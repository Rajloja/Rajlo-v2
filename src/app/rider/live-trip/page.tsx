"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { MapView } from "@/components/map-view";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRidePosition } from "@/lib/use-ride-position";
import { useBackgroundRefresh } from "@/lib/use-background-refresh";
import { SafetySheet } from "@/components/safety-sheet";
import { CancelReasonDialog } from "@/components/cancel-reason-dialog";
import { riderCancellationFeeJmd } from "@/lib/cancellation-fees";
import { describeEndedTrip } from "@/lib/ride-ended";
import { SafetyCheckModal } from "@/components/safety-check-modal";
import { useUnusualStopDetector } from "@/lib/use-unusual-stop-detector";
import { useOffRouteDetector } from "@/lib/use-off-route-detector";
import { ChatLauncher } from "@/components/chat-launcher";
import { DriverVehicleCard } from "@/components/driver-vehicle-card";
import {
  DriverVehicleCardSkeleton,
  HeroSkeleton,
  MapSkeleton,
  Skeleton,
} from "@/components/skeleton";
import { formatJMD, haversineKm, type Place } from "@/lib/jamaica";

/**
 * Rider's live-trip view.
 *
 * Shows the rider's current ride (in any state from `requested` through
 * `in_progress`) with the assigned driver's card + a status banner that
 * reflects the driver's actions (en-route → arrived at pickup →
 * trip in progress).
 *
 * Polls /api/rider/rides/active every 5s for now; Phase 2A.2 follow-up
 * swaps to a Supabase Realtime subscription.
 */

type ActiveRide = {
  id: string;
  status:
    | "requested"
    | "accepted"
    | "arrived"
    | "in_progress"
    | "completed"
    | "cancelled";
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
  estimatedFareJMD: number;
  estimatedDistanceKm: number | null;
  estimatedEtaMinutes: number | null;
  /** ISO timestamp at which the request auto-cancels if no driver
   *  has accepted. Null for non-`requested` statuses. */
  expiresAt: string | null;
  /** Set when status='cancelled'; 'expired_no_driver' triggers the
   *  "no driver found" UI on this page. */
  cancellationReason: string | null;
  timeline: {
    requestedAt: string | null;
    acceptedAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    cancelledAt: string | null;
  };
  carpool: { groupId: string; partnerFirstName: string | null } | null;
  /** Verify-Your-Ride PIN. Surfaced once a driver is assigned. The
   *  `code` is only set during `accepted`/`arrived` — once the driver
   *  has verified, the rider doesn't need to see it any more. */
  pin: { code: string | null; verified: boolean } | null;
};

type DriverInfo = {
  name: string;
  phone: string | null;
  plateNumber: string | null;
  vehicle: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;
  /** null = no ratings yet (we render a "new driver" pill instead). */
  rating: number | null;
  ratingCount: number;
  avatarUrl: string | null;
};

/** A ride that ended (cancelled/completed) in the last ~2 minutes. */
type RecentlyEndedTrip = {
  id: string;
  status: "cancelled" | "completed";
  pickupName: string;
  dropoffName: string;
  cancellationReason: string | null;
};

type ActiveResponse = {
  ride: ActiveRide | null;
  driver: DriverInfo | null;
  /** Present only when there's no active ride but one ended very
   *  recently — drives the "trip ended" card. */
  recentlyEnded?: RecentlyEndedTrip | null;
};

/**
 * Ride ids whose "trip ended" card the rider has already moved past —
 * tapped through, or navigated away from. Module-scoped so it survives
 * client-side route changes; a full reload clears it (by then the ride
 * is outside the server's 2-minute window anyway).
 */
const dismissedEndedTrips = new Set<string>();

const STATUS_HERO: Record<
  ActiveRide["status"],
  {
    eyebrow: string;
    title: string;
    description: string;
    tone: "red" | "amber" | "emerald";
  }
> = {
  requested: {
    eyebrow: "Looking for a driver",
    title: "We're matching you with a nearby driver…",
    description:
      "Hold tight — verified red-plate drivers are being notified right now.",
    tone: "red",
  },
  accepted: {
    eyebrow: "Driver on the way",
    title: "Your driver is heading to the pickup",
    description: "Watch for them at the pickup spot.",
    tone: "amber",
  },
  arrived: {
    eyebrow: "Driver at pickup",
    title: "Your driver is here",
    description: "Hop in when you're ready.",
    tone: "emerald",
  },
  in_progress: {
    eyebrow: "Trip in progress",
    title: "On your way",
    description: "Sit back and enjoy the ride.",
    tone: "emerald",
  },
  completed: {
    eyebrow: "Trip complete",
    title: "Thanks for riding with Rajlo",
    description: "Hope you had a smooth trip.",
    tone: "emerald",
  },
  cancelled: {
    eyebrow: "Cancelled",
    title: "This trip was cancelled",
    description: "Book another ride from your dashboard.",
    tone: "red",
  },
};

/**
 * Snapshot of a ride that just completed. Held in state so the
 * completion popup can keep showing after `/api/rider/rides/active`
 * starts returning null (the API filters out terminal-state rides).
 * Populated when refresh() observes the active→null transition.
 */
type CompletedSnapshot = {
  id: string;
  driverName: string | null;
  fareJMD: number;
};

export default function RiderLiveTripPage() {
  const router = useRouter();
  const [data, setData] = useState<ActiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  // Safety check modal — opens automatically on detected unusual stops
  // (4+ min stationary during in_progress) and also opens manually when
  // the rider taps "Safety toolkit" in the hero. The two paths share
  // the modal; we just toggle `safetyCheckAuto` to swap the framing.
  const [safetyCheckOpen, setSafetyCheckOpen] = useState(false);
  const [safetyCheckAuto, setSafetyCheckAuto] = useState(false);
  const [safetyCheckAlertId, setSafetyCheckAlertId] = useState<string | null>(
    null,
  );
  // Which detector raised the auto-check (drives modal copy: "car
  // stopped" vs "car off route" vs generic).
  const [safetyCheckKind, setSafetyCheckKind] = useState<
    "unusual_stop" | "off_route" | "manual"
  >("manual");
  // Planned route polyline — fetched once per trip from /route-plan
  // when the ride is in flight. Null means the API hasn't returned
  // yet OR Directions is unavailable; the off-route detector is a
  // no-op in either case.
  const [plannedPolyline, setPlannedPolyline] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedSnapshot | null>(null);

  // Once the rider moves past a shown "trip ended" card — taps through
  // it or leaves the page — remember it so a later return lands on a
  // clean "no active trip" rather than re-surfacing the ended ride.
  const recentlyEndedId = data?.recentlyEnded?.id ?? null;
  useEffect(() => {
    if (!recentlyEndedId) return;
    return () => {
      dismissedEndedTrips.add(recentlyEndedId);
    };
  }, [recentlyEndedId]);
  // Tracks the most recent active-ride snapshot we saw, so when
  // refresh() returns `{ ride: null }` we can detect the active → done
  // transition and pop the rating overlay using the previous ride's
  // info. Without this, the rider would just see "No active trip" the
  // moment the driver taps Complete, with no acknowledgement.
  const prevActiveRef = useRef<{
    id: string;
    status: ActiveRide["status"];
    driverName: string | null;
    fareJMD: number;
  } | null>(null);

  // Live tracking. The rider streams their own GPS whenever they have an
  // active ride row — not just after a driver accepts. Why broaden the
  // window: the rider expects to see their own marker on the map while
  // they're waiting for a match (so they can confirm "yes, that's where
  // I am, the driver will know"). Streaming starts in the `requested`
  // phase too; the channel may not have a driver listening yet, but the
  // local state still hydrates `riderPosition` for the map.
  const activeRideId = data?.ride?.id ?? null;
  const liveStatuses = ["requested", "accepted", "arrived", "in_progress"];
  const trackingActive =
    !!data?.ride && liveStatuses.includes(data.ride.status);
  const { driverPosition, riderPosition, geoError } = useRidePosition(
    trackingActive ? activeRideId : null,
    "rider",
    /* streamSelf */ trackingActive,
  );

  // Unusual-stop detector. Fires once per stop event when the driver
  // has been stationary >4 minutes during `in_progress`. We pre-create
  // an `unusual_stop` safety_alert row server-side so admin/ops sees
  // it in their queue even before the rider takes any action; the
  // modal then lets the rider escalate (Call police / Notify ops),
  // dismiss ("I'm fine"), or — if the 30-sec timer runs out — auto-
  // escalates to a real SOS. The alert id flows through to the modal
  // so the "I'm fine" path can mark this specific alert as resolved.
  const fireUnusualStop = useRef(async () => {
    if (!activeRideId) return;
    try {
      const res = await fetch(`/api/rider/rides/${activeRideId}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "unusual_stop",
          message: "Auto-detected: driver stationary >4 min during in_progress.",
          lat: driverPosition?.lat,
          lng: driverPosition?.lng,
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { alertId?: string };
        setSafetyCheckAlertId(j.alertId ?? null);
      }
    } catch {
      /* network blip — modal still opens so the rider can act */
    }
    setSafetyCheckKind("unusual_stop");
    setSafetyCheckAuto(true);
    setSafetyCheckOpen(true);
  });
  // Keep the ref current with the latest activeRideId / driverPosition
  // so the detector's stable callback closure always reads fresh values.
  fireUnusualStop.current = async () => {
    if (!activeRideId) return;
    try {
      const res = await fetch(`/api/rider/rides/${activeRideId}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "unusual_stop",
          message: "Auto-detected: driver stationary >4 min during in_progress.",
          lat: driverPosition?.lat,
          lng: driverPosition?.lng,
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { alertId?: string };
        setSafetyCheckAlertId(j.alertId ?? null);
      }
    } catch {
      /* network blip — modal still opens so the rider can act */
    }
    setSafetyCheckKind("unusual_stop");
    setSafetyCheckAuto(true);
    setSafetyCheckOpen(true);
  };

  useUnusualStopDetector({
    driverPosition,
    rideStatus: data?.ride?.status ?? null,
    enabled: !!activeRideId,
    onUnusualStop: () => {
      void fireUnusualStop.current();
    },
  });

  // Off-route detector — fires once per sustained off-route event
  // (>300m off the planned polyline for >2 min during in_progress).
  // Same UX as unusual-stop: pre-create an `off_route` alert server-
  // side so officers see it instantly, then pop the modal so the
  // rider can either confirm safety or escalate.
  const fireOffRoute = useRef(async () => {
    if (!activeRideId) return;
    try {
      const res = await fetch(`/api/rider/rides/${activeRideId}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "off_route",
          message:
            "Auto-detected: driver >300m off the planned route for >2 min during in_progress.",
          lat: driverPosition?.lat,
          lng: driverPosition?.lng,
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { alertId?: string };
        setSafetyCheckAlertId(j.alertId ?? null);
      }
    } catch {
      /* network blip — modal still opens so the rider can act */
    }
    setSafetyCheckKind("off_route");
    setSafetyCheckAuto(true);
    setSafetyCheckOpen(true);
  });
  // Keep the ref fresh on every render so the detector's stable
  // callback always reads the latest activeRideId / driverPosition.
  fireOffRoute.current = async () => {
    if (!activeRideId) return;
    try {
      const res = await fetch(`/api/rider/rides/${activeRideId}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "off_route",
          message:
            "Auto-detected: driver >300m off the planned route for >2 min during in_progress.",
          lat: driverPosition?.lat,
          lng: driverPosition?.lng,
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { alertId?: string };
        setSafetyCheckAlertId(j.alertId ?? null);
      }
    } catch {
      /* network blip — modal still opens so the rider can act */
    }
    setSafetyCheckKind("off_route");
    setSafetyCheckAuto(true);
    setSafetyCheckOpen(true);
  };

  useOffRouteDetector({
    driverPosition,
    rideStatus: data?.ride?.status ?? null,
    plannedPolyline,
    enabled: !!activeRideId,
    onOffRoute: () => {
      void fireOffRoute.current();
    },
  });

  // Fetch the planned route polyline once per active ride. The endpoint
  // is idempotent — first caller triggers the Directions API hit, every
  // subsequent caller (and every page reload) reads the cached row.
  useEffect(() => {
    if (!activeRideId) {
      setPlannedPolyline(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/rider/rides/${activeRideId}/route-plan`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { polyline?: string } | null) => {
        if (j?.polyline) setPlannedPolyline(j.polyline);
      })
      .catch(() => {
        /* Directions unavailable — detector stays disabled, no retry. */
      });
    return () => ctrl.abort();
  }, [activeRideId]);

  // Persistent safety chat — poll for open alerts on the current ride
  // so the rider can re-enter the conversation after the auto-popup
  // closes (and so the thread survives a page refresh mid-incident).
  // When no alerts are open the pill disappears on its own.
  const [activeAlert, setActiveAlert] = useState<{
    id: string;
    kind: "sos" | "flag" | "unusual_stop" | "off_route";
    acknowledged: boolean;
  } | null>(null);
  useEffect(() => {
    if (!activeRideId) {
      setActiveAlert(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/rider/rides/${activeRideId}/active-alerts`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          alerts: Array<{
            id: string;
            kind: "sos" | "flag" | "unusual_stop" | "off_route";
            acknowledged: boolean;
          }>;
        };
        if (cancelled) return;
        const top = data.alerts[0] ?? null;
        setActiveAlert(top);
        // Keep modal's pointer aligned with what's actually open in
        // the DB. When the rider resolves via "I'm fine" (alert flips
        // to resolved server-side), the next poll clears the id so a
        // future manual open doesn't accidentally point at the
        // closed thread.
        if (top === null) setSafetyCheckAlertId(null);
      } catch {
        /* silent — chat pill is best-effort */
      }
    };
    void poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeRideId]);

  // Pulled out so the Realtime subscription effect can call it without
  // recreating the function (and without re-subscribing on every
  // change). Reads the rider's active ride + assigned driver from the
  // server — used both for the initial fetch and for every postgres_changes
  // push, so we always render the latest joined data, not just whatever
  // came through the row payload.
  //
  // Side-effect: detects the active→null transition (driver tapped
  // Complete) and pops the completion overlay so the rider gets a
  // proper "trip is over" moment rather than instantly seeing the
  // "No active trip" empty state.
  const refresh = async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/rider/rides/active", { signal });
      if (!res.ok) return;
      const json = (await res.json()) as ActiveResponse;
      setData(json);

      const prev = prevActiveRef.current;
      if (json.ride) {
        // Keep the snapshot fresh while the ride is in flight — we'll
        // need it to render the popup if/when the driver completes.
        prevActiveRef.current = {
          id: json.ride.id,
          status: json.ride.status,
          driverName: json.driver?.name ?? null,
          fareJMD: json.ride.estimatedFareJMD,
        };
      } else if (prev && prev.status === "in_progress") {
        // Active → null after an in_progress ride means the driver hit
        // Complete. Show the rating overlay with the previous ride's
        // data. We don't trigger this for "requested → null" (rider
        // cancelled while waiting) or "accepted/arrived → null"
        // (cancelled before the trip really started) — those don't
        // warrant a celebration screen.
        setCompleted({
          id: prev.id,
          driverName: prev.driverName,
          fareJMD: prev.fareJMD,
        });
        prevActiveRef.current = null;
      } else {
        prevActiveRef.current = null;
      }
    } catch (err) {
      // AbortError is expected when the effect unmounts — swallow it.
      if ((err as { name?: string })?.name === "AbortError") return;
      /* other network blip — Realtime will fire another refresh shortly */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    refresh(ac.signal);

    // Subscribe to any change on the rider's own rides. RLS gates this
    // to the signed-in user's rows so we don't need a filter — but the
    // active ride id isn't known until the first fetch resolves, and a
    // global rides-table subscription is fine because each rider only
    // ever sees their own. We re-fetch from the server on every push so
    // the joined driver profile (plate, avatar, etc.) stays in sync.
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("rider-live-trip")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => refresh(),
      )
      .subscribe();

    return () => {
      ac.abort();
      supabase.removeChannel(channel);
    };
  }, []);

  // Belt-and-braces backup poll. Realtime is the fast path, but a
  // websocket can drop silently — phone backgrounds the tab, mobile
  // OS sleeps the radio, network blips, browser disconnects after a
  // long idle. Without this, the rider could come back to a stale
  // "looking for a driver" screen even after the driver accepted.
  // Hook pauses while the tab is hidden and re-fetches the moment
  // it comes back into focus, so the cost is bounded.
  useBackgroundRefresh(() => refresh(), 5_000);

  // Expiry trigger — when a `requested` ride's countdown hits zero, no
  // postgres_changes row event fires (the row hasn't actually changed
  // until somebody calls /api/rider/rides/active and the
  // expire-on-read flips it). So we schedule a refresh ourselves at
  // the moment of expiry to force the server-side flip + UI update.
  //
  // We add a 1.5s buffer to account for client/server clock skew. If
  // the first refresh comes back still 'requested' (deeper skew, slow
  // network, etc.), we re-poll every 3s until status changes — the
  // server will flip on the next read because expires_at is now well
  // in the past.
  useEffect(() => {
    if (!data?.ride) return;
    if (data.ride.status !== "requested") return;
    if (!data.ride.expiresAt) return;

    const expiresMs = new Date(data.ride.expiresAt).getTime();
    const now = Date.now();
    const initialDelay = Math.max(0, expiresMs - now + 1500);

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const initialTimer = setTimeout(() => {
      void refresh();
      // If the server didn't flip on the first call (clock skew, blip),
      // keep nudging. The interval stops itself when the ride leaves
      // the 'requested' state via the cleanup below or via the next
      // useEffect run when `data.ride.status` changes.
      pollTimer = setInterval(() => {
        void refresh();
      }, 3000);
    }, initialDelay);

    return () => {
      clearTimeout(initialTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ride?.id, data?.ride?.status, data?.ride?.expiresAt]);

  // When the trip status flips (driver accepted, arrived, started,
  // completed) scroll the rider to the top so the new hero copy +
  // status timeline are immediately in view. Without this, riders
  // mid-scroll on the receipt section miss the "Driver arrived"
  // change. Skips the very first render.
  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const next = data?.ride?.status ?? null;
    if (next && lastStatusRef.current && lastStatusRef.current !== next) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    lastStatusRef.current = next;
  }, [data?.ride?.status]);

  const handleCancel = () => {
    if (!data?.ride) return;
    setCancelDialogOpen(true);
  };

  const performCancel = async (reason: string) => {
    if (!data?.ride) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/rider/rides/${data.ride.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Server returned ${res.status}`);
      }
      // The next poll will pick up the cancelled state. Optimistic update:
      setData((prev) =>
        prev?.ride
          ? {
              ride: {
                ...prev.ride,
                status: "cancelled",
                cancellationReason: reason || prev.ride.cancellationReason,
              },
              driver: prev.driver,
            }
          : prev,
      );
      setCancelDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel ride");
    } finally {
      setCancelling(false);
    }
  };

  /* ── Loading — skeleton mirrors the real shape: hero + map +
       driver card + trip details. Same vertical rhythm as the
       loaded view so it doesn't jump when data arrives. ── */
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-2 md:px-3 md:py-8">
        <HeroSkeleton />
        <MapSkeleton />
        <DriverVehicleCardSkeleton />
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8" rounded="full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-44" rounded="md" />
                <Skeleton className="h-2.5 w-32" rounded="md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── No active trip ── */
  if (!data?.ride) {
    // A trip that JUST ended (driver cancelled, expired, no-show) —
    // show what happened + a way forward before collapsing to the
    // generic empty state. Completed trips are handled by the
    // CompletionDialog overlay below, so we only card-up cancellations.
    const ended = data?.recentlyEnded ?? null;
    const showEndedCard =
      ended != null &&
      ended.status === "cancelled" &&
      !dismissedEndedTrips.has(ended.id);
    // Spell out exactly why the trip ended — wrong PIN, no-show,
    // expiry, or the cancel reason — never a vague "trip cancelled".
    const endedInfo = ended
      ? describeEndedTrip(ended.status, ended.cancellationReason, "rider")
      : null;
    return (
      <>
        {showEndedCard && ended && endedInfo ? (
          <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-rajlo-red">
              <Icon name="x" className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
              {endedInfo.title}
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted">
              {endedInfo.detail}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted">
              {ended.pickupName} → {ended.dropoffName}
            </p>
            <Link
              href="/rider/request"
              onClick={() => dismissedEndedTrips.add(ended.id)}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              Book another ride
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="navigation" className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
              No active trip
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted">
              Book a ride to get started.
            </p>
            <Link
              href="/rider/request"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
            >
              Book a ride
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        )}
        {/* Completion overlay — pops over the empty state when the
           driver just tapped Complete on a trip we were tracking.
           Submitting a rating or dismissing the dialog clears it,
           dropping the rider back onto the empty state. */}
        {completed && (
          <CompletionDialog
            snapshot={completed}
            onDismiss={() => setCompleted(null)}
            onBookAgain={() => router.push("/rider/request")}
          />
        )}
      </>
    );
  }

  const { ride, driver } = data;

  // Special case: the matcher's timeout fired without anyone
  // accepting → render a dedicated "no driver found" view
  // (instead of the generic cancelled hero) with a one-tap retry.
  if (
    ride.status === "cancelled" &&
    ride.cancellationReason === "expired_no_driver"
  ) {
    return (
      <NoDriverFoundView
        rideId={ride.id}
        pickupName={ride.pickup.name}
        dropoffName={ride.dropoff.name}
        fareJMD={ride.estimatedFareJMD}
      />
    );
  }

  const hero = STATUS_HERO[ride.status];

  // Map: while waiting/en-route show the full route (rider sees pickup +
  // dropoff). Once the trip is in_progress, dropoff is the destination.
  const mapPickup: Place = {
    placeId: "",
    name: ride.pickup.name,
    address: ride.pickup.address,
    lat: ride.pickup.lat,
    lng: ride.pickup.lng,
    parish: null,
  };
  const mapDropoff: Place = {
    placeId: "",
    name: ride.dropoff.name,
    address: ride.dropoff.address,
    lat: ride.dropoff.lat,
    lng: ride.dropoff.lng,
    parish: null,
  };
  const mapStops: Place[] = ride.stops.map((s) => ({
    placeId: "",
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    parish: null,
  }));

  const isTerminal = ride.status === "completed" || ride.status === "cancelled";
  const canCancel = ["requested", "accepted", "arrived"].includes(ride.status);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 py-6 md:px-3 md:py-8">
      <FadeUp>
        <div
          className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-xl md:p-8 ${
            hero.tone === "emerald"
              ? "bg-emerald-600 shadow-emerald-600/30"
              : hero.tone === "amber"
                ? "bg-rajlo-black shadow-rajlo-black/30"
                : "bg-rajlo-red shadow-rajlo-red/30"
          }`}
        >
          <ArcWatermark
            size={360}
            variant="white"
            className="absolute -right-20 -bottom-24 opacity-[0.10]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
              {hero.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              {hero.title}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/85">
              {hero.description}
            </p>
            {ride.status === "accepted" && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Live · driver heading to you
              </div>
            )}
          </div>
        </div>
      </FadeUp>

      {/* Carpool badge — shown when this trip was matched with another
         rider via the share-and-save toggle. We don't expose the
         partner's pickup/dropoff (privacy), just their first name. */}
      {ride.carpool && (
        <FadeUp delay={0.04}>
          <div className="flex items-center gap-3 rounded-2xl border border-rajlo-red/30 bg-primary-soft px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
              <Icon name="users" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Carpool
              </p>
              <p className="mt-0.5 text-sm font-bold leading-snug">
                {ride.carpool.partnerFirstName
                  ? `Sharing this trip with ${ride.carpool.partnerFirstName}`
                  : "Sharing this trip with another rider"}
              </p>
            </div>
          </div>
        </FadeUp>
      )}

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}
      {geoError && trackingActive && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {geoError} Sharing your live position helps your driver find you.
        </div>
      )}

      <FadeUp delay={0.05}>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lg shadow-rajlo-red/4">
          {/* Live-tracking is the primary task on this page, so let the
             map dominate. `h-[55vh]` scales with the device — about half
             the viewport on phones, comfortable on desktop.

             Live-route mode flips the polyline from "preview the whole
             trip" to "where the driver is going right now":
              - accepted/arrived → driver→pickup line
              - in_progress      → driver→dropoff line
             Anything else (requested while waiting for a match,
             completed, cancelled) falls back to the static preview. */}
          <MapView
            pickup={mapPickup}
            stops={mapStops}
            dropoff={mapDropoff}
            driverPosition={driverPosition}
            riderPosition={riderPosition}
            liveRoute={
              ride.status === "accepted" || ride.status === "arrived"
                ? { target: "pickup" }
                : ride.status === "in_progress"
                  ? { target: "dropoff" }
                  : null
            }
            // Radar overlay while the matcher is still scanning —
            // turns off the moment a driver accepts and the
            // status flips to "accepted". `searchingUntil` drives
            // the countdown ring inside the overlay.
            searching={ride.status === "requested"}
            searchingUntil={ride.status === "requested" ? ride.expiresAt : null}
            // Explicit so a future MapView default change doesn't
            // accidentally let scrolls past the map pan it on phones.
            lockable
            className="h-[55vh] min-h-80 w-full md:h-[60vh] md:max-h-160"
          />
        </div>
      </FadeUp>

      {driver && (
        <FadeUp delay={0.1}>
          <DriverVehicleCard
            name={driver.name}
            avatarUrl={driver.avatarUrl}
            rating={driver.rating}
            ratingCount={driver.ratingCount}
            phone={driver.phone}
            plateNumber={driver.plateNumber}
            vehicleMake={driver.vehicleMake}
            vehicleModel={driver.vehicleModel}
            vehicleYear={driver.vehicleYear}
            vehicleColor={driver.vehicleColor}
            extraAction={
              <ChatLauncher
                rideId={ride.id}
                myRole="rider"
                peerName={driver.name}
                peerAvatarUrl={driver.avatarUrl}
                peerPhone={driver.phone}
                rideActive
                variant="soft"
              />
            }
          />
          {/* Live "X km · Y min" pill — only renders while the driver
             is heading to pickup AND we actually have a fresh GPS fix
             from them. Distance is haversine (straight-line) which
             under-estimates road distance ~1.3×; we apply that fudge
             factor + an avg city speed to reach a useful ETA without
             a Directions API round-trip on every ping. */}
          {(ride.status === "accepted" || ride.status === "arrived") &&
            driverPosition && (
              <DriverEtaPill
                driverLat={driverPosition.lat}
                driverLng={driverPosition.lng}
                pickupLat={ride.pickup.lat}
                pickupLng={ride.pickup.lng}
              />
            )}
        </FadeUp>
      )}

      {/* Verify-Your-Ride PIN card. Most prominent when the driver
         has arrived (rider's physically about to step in), but we
         show it earlier in `accepted` too so the rider can have the
         number ready. Hidden once the driver has entered it — the
         visible state would just be noise after that. */}
      {ride.pin?.code && !ride.pin.verified && (
        <FadeUp delay={0.12}>
          <div
            className={`relative overflow-hidden rounded-2xl border-2 p-5 shadow-md ${
              ride.status === "arrived"
                ? "border-rajlo-red bg-rajlo-red text-white"
                : "border-rajlo-red/30 bg-primary-soft text-foreground"
            }`}
          >
            <div className="flex items-start gap-4">
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                  ride.status === "arrived"
                    ? "bg-white/15 text-white"
                    : "bg-rajlo-red/15 text-rajlo-red"
                }`}
              >
                <Icon name="shield-check" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    ride.status === "arrived" ? "text-white/85" : "text-rajlo-red"
                  }`}
                >
                  {ride.status === "arrived"
                    ? "Read this PIN to your driver"
                    : "Your PIN for this ride"}
                </p>
                <p
                  className={`mt-0.5 text-sm leading-snug ${
                    ride.status === "arrived" ? "text-white/90" : "text-muted"
                  }`}
                >
                  {ride.status === "arrived"
                    ? "Before you get in, confirm the car + plate match, then read this 4-digit code to your driver. The trip can't start without it."
                    : "Once your driver arrives, read these 4 digits to them so they can start the trip."}
                </p>
                <div
                  aria-label="Verify-your-ride PIN"
                  className={`mt-3 inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-mono text-4xl font-extrabold tracking-[0.4em] ${
                    ride.status === "arrived"
                      ? "bg-white text-rajlo-red shadow-lg"
                      : "bg-white text-rajlo-red ring-2 ring-rajlo-red/20"
                  }`}
                >
                  {ride.pin.code}
                </div>
              </div>
            </div>
          </div>
        </FadeUp>
      )}

      {/* Trip details */}
      <FadeUp delay={0.15}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-start gap-3">
            <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-[11px] font-extrabold text-white">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                Pickup
              </p>
              <p className="mt-0.5 truncate text-sm font-bold">
                {ride.pickup.name}
              </p>
              <p className="truncate text-xs text-muted">
                {ride.pickup.address}
              </p>
            </div>
          </div>

          {ride.stops.map((s) => (
            <div key={s.position} className="mt-4 flex items-start gap-3">
              <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rajlo-black text-[11px] font-extrabold text-white">
                {String.fromCharCode(65 + s.position)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                  Stop {s.position}
                </p>
                <p className="mt-0.5 truncate text-sm font-bold">{s.name}</p>
                <p className="truncate text-xs text-muted">{s.address}</p>
              </div>
            </div>
          ))}

          <div className="mt-4 flex items-start gap-3">
            <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rajlo-red text-[11px] font-extrabold text-white">
              {String.fromCharCode(66 + ride.stops.length)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                Dropoff
              </p>
              <p className="mt-0.5 truncate text-sm font-bold">
                {ride.dropoff.name}
              </p>
              <p className="truncate text-xs text-muted">
                {ride.dropoff.address}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              Estimated fare
            </p>
            <p className="text-lg font-extrabold tracking-tight text-rajlo-red">
              {formatJMD(ride.estimatedFareJMD)}
            </p>
          </div>
        </div>
      </FadeUp>

      {/* Action row — safety + cancel side-by-side while the trip is live. */}
      {!isTerminal && (
        <FadeUp delay={0.2}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setSafetyOpen(true)}
              className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              <Icon name="shield" className="h-4 w-4" />
              Safety toolkit
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-sm font-bold text-muted transition-colors hover:bg-surface-soft hover:text-rajlo-red disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              >
                <Icon name="x" className="h-4 w-4" />
                {cancelling ? "Cancelling…" : "Cancel ride"}
              </button>
            )}
          </div>
        </FadeUp>
      )}

      {isTerminal && (
        <FadeUp delay={0.2}>
          <Link
            href="/rider/request"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            Book another ride
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </FadeUp>
      )}

      {safetyOpen && (
        <SafetySheet
          rideId={ride.id}
          livePosition={
            riderPosition
              ? { lat: riderPosition.lat, lng: riderPosition.lng }
              : null
          }
          onClose={() => setSafetyOpen(false)}
        />
      )}

      {/* Auto-trigger safety-check modal — fires on unusual stops or
         when the rider opens it manually. Always-mounted so the
         component owns its own state transitions; `open` controls
         visibility. */}
      <SafetyCheckModal
        open={safetyCheckOpen}
        rideId={ride.id}
        alertId={safetyCheckAlertId}
        auto={safetyCheckAuto}
        kind={safetyCheckKind}
        currentPosition={
          riderPosition
            ? { lat: riderPosition.lat, lng: riderPosition.lng }
            : null
        }
        onClose={() => {
          setSafetyCheckOpen(false);
          // Intentionally keep `safetyCheckAlertId` so the persistent
          // chat pill below can reopen the modal pointed at the same
          // alert. The alertId is cleared by the active-alerts poll
          // once the underlying alert flips to resolved.
          setSafetyCheckAuto(false);
        }}
      />

      <CancelReasonDialog
        open={cancelDialogOpen}
        role="rider"
        busy={cancelling}
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={performCancel}
        feeWarningJmd={riderCancellationFeeJmd(
          ride.status,
          ride.timeline.requestedAt,
        )}
      />

      {/* Persistent safety-chat pill — visible while any alert is
          open or acknowledged on this ride. Tap to reopen the chat
          thread without re-triggering the auto-escalation timer. */}
      {activeAlert && !safetyCheckOpen && (
        <button
          type="button"
          onClick={() => {
            setSafetyCheckAlertId(activeAlert.id);
            setSafetyCheckKind("manual");
            setSafetyCheckAuto(false);
            setSafetyCheckOpen(true);
          }}
          className="fixed bottom-5 right-5 z-[70] inline-flex items-center gap-2 rounded-full bg-rajlo-red px-4 py-3 text-sm font-bold text-white shadow-2xl shadow-rajlo-red/40 transition-transform hover:-translate-y-0.5"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15">
            <Icon name="mail" className="h-4 w-4" />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span>Rajlo Safety chat</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/85">
              {activeAlert.acknowledged
                ? "Officer is on it"
                : "Open thread"}
            </span>
          </span>
        </button>
      )}

      {/* The chat launcher (icon + sheet + toast) lives inside the
         driver card above. Nothing more to mount here. */}
    </div>
  );
}

/**
 * Trip-completion dialog. Lets the rider:
 *   - rate the driver 1–5 stars (purely cosmetic for now — no backend
 *     persistence yet; we'll wire `/api/rider/rides/[id]/rate` later)
 *   - book another ride (routes to /rider/request)
 *   - dismiss with a close button
 *
 * Lives at module scope (rather than nested) so the parent's render
 * tree stays tidy and the dialog has its own local "selected stars"
 * state that resets each time it's opened.
 */
function CompletionDialog({
  snapshot,
  onDismiss,
  onBookAgain,
}: {
  snapshot: CompletedSnapshot;
  onDismiss: () => void;
  onBookAgain: () => void;
}) {
  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  // After tapping a star we POST to the rating endpoint, lock the
  // input, and flip the CTA copy. If the POST fails (network blip,
  // already-rated, etc.) we surface a small error line but keep the
  // selection visible so the rider can retry on close + reopen.
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitRating = async (n: number) => {
    if (submitting || submitted) return;
    setStars(n);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/rider/rides/${snapshot.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: n }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        // 409 already-rated is a benign "you can't rate twice" case —
        // treat it like success so the rider isn't confused.
        if (res.status === 409) {
          setSubmitted(true);
        } else {
          throw new Error(j.error ?? `Server returned ${res.status}`);
        }
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Couldn't save rating",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-title"
      className="fixed inset-0 z-50 grid place-items-center bg-rajlo-black/60 px-4 py-6 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface shadow-2xl">
        {/* Close button — top-right of the dialog. */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-line hover:text-foreground"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>

        <div className="relative bg-emerald-600 px-6 py-7 text-white md:px-8">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-emerald-600 shadow-lg">
            <Icon name="check-circle" className="h-7 w-7" />
          </div>
          <h2
            id="completion-title"
            className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl"
          >
            Trip complete!
          </h2>
          <p className="mt-1 text-sm text-white/85">
            {snapshot.driverName
              ? `Hope ${snapshot.driverName} got you there safely.`
              : "Hope you got where you were going safely."}
          </p>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/85">
            Trip total
          </p>
          <p className="mt-0.5 text-2xl font-extrabold tracking-tight">
            {formatJMD(snapshot.fareJMD)}
          </p>
        </div>

        <div className="px-6 py-6 md:px-8">
          <p className="text-center text-sm font-bold">
            {submitted
              ? "Thanks for rating!"
              : submitting
                ? "Saving your rating…"
                : "How was your ride?"}
          </p>
          <div
            className="mt-3 flex items-center justify-center gap-2"
            onMouseLeave={() => setHoverStars(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= (hoverStars || stars);
              const locked = submitted || submitting;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={locked}
                  onMouseEnter={() => !locked && setHoverStars(n)}
                  onClick={() => submitRating(n)}
                  aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                  className={`grid h-11 w-11 place-items-center rounded-full transition-all ${
                    filled
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "bg-surface-soft text-muted hover:bg-primary-soft hover:text-rajlo-red"
                  } ${locked ? "cursor-default" : "hover:-translate-y-0.5"}`}
                >
                  <Icon name="star" className="h-5 w-5" />
                </button>
              );
            })}
          </div>
          {submitError && (
            <p className="mt-3 text-center text-xs font-semibold text-rajlo-red">
              {submitError}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onBookAgain}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Book another ride
              <Icon
                name="arrow-right"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full border border-line bg-surface px-5 py-2.5 text-xs font-bold text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
            >
              {submitted ? "Done" : "Skip rating"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dedicated "no driver found" view, shown when a request hits its
 * 5-minute timeout without an accept. Two paths forward:
 *
 *   - Try again → POST /api/rider/rides/[id]/retry, which clones
 *     the original ride into a fresh `requested` row. The page
 *     then refetches /api/rider/rides/active and lands on the
 *     normal live-trip view with a brand-new countdown.
 *   - Cancel → just route to /rider/request. The expired ride is
 *     already in their history.
 *
 * Designed to feel reassuring rather than alarming — high demand
 * happens, this isn't the rider's fault, retry is one tap.
 */
function NoDriverFoundView({
  rideId,
  pickupName,
  dropoffName,
  fareJMD,
}: {
  rideId: string;
  pickupName: string;
  dropoffName: string;
  fareJMD: number;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/rider/rides/${rideId}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Server returned ${res.status}`);
      }
      // The new ride lands as the rider's active record on the next
      // /api/rider/rides/active fetch — refresh to pick it up.
      router.refresh();
      // Belt-and-suspenders: also force a hard reload so the page's
      // useEffect re-runs and the radar starts fresh.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't re-request ride.");
      setRetrying(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-10 md:py-16">
      <FadeUp>
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-rajlo-red text-white shadow-2xl shadow-rajlo-red/40">
            <span aria-hidden className="text-4xl leading-none">😢</span>
          </div>
          <p className="mt-6 font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            No driver found
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            We couldn&apos;t match you in time
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted">
            Demand is high in your area right now. No nearby red-plate driver
            picked up your request within the 5-minute window — try again and
            we&apos;ll keep looking.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            Your request
          </p>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-start gap-3">
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-[10px] font-extrabold text-white">
                A
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{pickupName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red text-[10px] font-extrabold text-white">
                B
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{dropoffName}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <p className="text-xs font-semibold text-muted">Estimated fare</p>
            <p className="text-base font-extrabold tracking-tight text-rajlo-red">
              {formatJMD(fareJMD)}
            </p>
          </div>
        </div>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}

      <FadeUp delay={0.15}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-rajlo-red px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retrying ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Re-requesting…
              </>
            ) : (
              <>
                Try again
                <Icon name="arrow-right" className="h-4 w-4" />
              </>
            )}
          </button>
          <Link
            href="/rider/request"
            className="inline-flex items-center justify-center rounded-full border border-line bg-surface px-5 py-3 text-xs font-bold text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
          >
            Change pickup or dropoff
          </Link>
        </div>
      </FadeUp>

      <FadeUp delay={0.2}>
        <p className="text-center text-[11px] text-muted">
          You weren&apos;t charged. Most retries find a driver within 2-3
          minutes.
        </p>
      </FadeUp>
    </div>
  );
}

/* ════════════════════ Driver ETA pill ════════════════════
 * Renders straight-line distance + a generous-but-honest ETA
 * derived from average city traffic. Re-computes whenever the
 * driverPosition prop changes (every realtime ping). */
function DriverEtaPill({
  driverLat,
  driverLng,
  pickupLat,
  pickupLng,
}: {
  driverLat: number;
  driverLng: number;
  pickupLat: number;
  pickupLng: number;
}) {
  const distanceKm = haversineKm(
    { lat: driverLat, lng: driverLng },
    { lat: pickupLat, lng: pickupLng },
  );
  // Road-distance fudge (typical 1.3×) + 25 km/h average urban speed.
  const roadKm = distanceKm * 1.3;
  const etaMin = Math.max(1, Math.round((roadKm / 25) * 60));
  const distLabel =
    distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25">
        <Icon name="navigation" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-emerald-800">
          Driver heading to you
        </p>
        <p className="mt-0.5 text-sm font-extrabold tracking-tight text-emerald-900">
          {distLabel} away · ~{etaMin} min
        </p>
      </div>
    </div>
  );
}
