"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { MapView } from "@/components/map-view";
import { ChatLauncher } from "@/components/chat-launcher";
import { CallButton } from "@/components/call-button";
import { CancelReasonDialog } from "@/components/cancel-reason-dialog";
import { PinEntryDialog } from "@/components/pin-entry-dialog";
import { NavBanner } from "@/components/nav/nav-banner";
import { NavControls } from "@/components/nav/nav-controls";
import { NavTripCard } from "@/components/nav/nav-trip-card";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRidePosition } from "@/lib/use-ride-position";
import { useLocationViolationMonitor } from "@/lib/use-location-violation-monitor";
import { useBackgroundRefresh } from "@/lib/use-background-refresh";
import { useTurnByTurn } from "@/lib/use-turn-by-turn";
import * as navVoice from "@/lib/nav-voice";
import type { DirectionsRoute } from "@/lib/turn-by-turn";
import { formatJMD, type Place } from "@/lib/jamaica";
import { NO_SHOW_WAIT_SEC } from "@/lib/cancellation-fees";
import { describeEndedTrip } from "@/lib/ride-ended";
import { HeroSkeleton, MapSkeleton, Skeleton } from "@/components/skeleton";
import {
  getCachedDriverData,
  setCachedDriverData,
} from "@/lib/driver-prefetch";

const ACTIVE_URL = "/api/driver/rides/active";

/** A ride that ended (cancelled/completed) in the last ~2 minutes. */
type RecentlyEndedTrip = {
  id: string;
  status: "cancelled" | "completed";
  pickupName: string;
  dropoffName: string;
  cancellationReason: string | null;
};

/**
 * Ride ids whose "trip ended" card the driver has already moved past
 * — either by tapping through it, or by navigating away from the
 * page. Module-scoped so it survives client-side route changes (a
 * fresh full page load clears it, by which point the ride is well
 * outside the server's 2-minute window anyway).
 */
const dismissedEndedTrips = new Set<string>();

/**
 * Driver's active-trip console.
 *
 * Shows the ride the signed-in driver is currently on (status accepted →
 * arrived → in_progress), with stage-specific copy and the next-action
 * button. Tapping the action calls /api/driver/rides/[id]/status to
 * transition the state-machine forward.
 *
 * Polls /api/driver/rides/active every 5s for now — Phase 2A.2 follow-up
 * swaps to Supabase Realtime so updates are instant.
 */

type ActiveRide = {
  id: string;
  status: "accepted" | "arrived" | "in_progress";
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
  timeline: {
    requestedAt: string | null;
    acceptedAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
  };
};

type CarpoolPartner = {
  rideId: string;
  riderName: string;
  pickup: { name: string; address: string; lat: number; lng: number };
  dropoff: { name: string; address: string; lat: number; lng: number };
  seats: number;
  fareJMD: number;
  status: string;
};

type ActiveResponse = {
  ride: (ActiveRide & {
    /** Verify-Your-Ride. `required` true means the rider opted in and
     *  the trip can't move past `arrived` until `verified` flips to
     *  true via /api/driver/rides/[id]/verify-pin. */
    pin?: { required: boolean; verified: boolean };
  }) | null;
  rider: {
    name: string;
    avatarUrl: string | null;
    phone: string | null;
  } | null;
  carpool: { groupId: string; partner: CarpoolPartner } | null;
  /** Present only when there's no active ride but one ended very
   *  recently — drives the "trip ended" card. */
  recentlyEnded?: RecentlyEndedTrip | null;
};

const STAGE_COPY = {
  accepted: {
    eyebrow: "Heading to pickup",
    headline: "Drive to the pickup location",
    description: "Tap when you arrive so the rider knows you're outside.",
    actionLabel: "I've arrived at pickup",
    actionAction: "arrived" as const,
    nextStatus: "arrived" as const,
  },
  arrived: {
    eyebrow: "At pickup",
    headline: "Pick up your rider",
    description:
      "Confirm the rider is in the vehicle, then start the trip to begin metering.",
    actionLabel: "Start trip",
    actionAction: "start" as const,
    nextStatus: "in_progress" as const,
  },
  in_progress: {
    eyebrow: "On the way",
    headline: "Trip in progress",
    description:
      "Drive safely. Tap complete when the rider has been dropped off.",
    actionLabel: "Complete trip",
    actionAction: "complete" as const,
    nextStatus: "completed" as const,
  },
};

export default function DriverActiveTripPage() {
  // Seed from the cross-page cache so a tab-switch back to /driver/active-trip
  // renders content instantly instead of flashing skeletons. The
  // background refresh below still re-fetches to stay accurate.
  const cachedActive = getCachedDriverData<ActiveResponse>(ACTIVE_URL);
  const [data, setData] = useState<ActiveResponse | null>(cachedActive);
  const [loading, setLoading] = useState(cachedActive == null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the just-completed trip so the completion flash can
  // show the rider's name + offer a star rating. We capture this at
  // tap-time because by the time the flash renders, `data.ride` has
  // already been cleared.
  const [completed, setCompleted] = useState<{
    fare: number;
    primaryRideId: string;
    primaryRiderName: string;
    secondary: { rideId: string; riderName: string } | null;
  } | null>(null);
  // Per-ride local state for which ratings the driver has already
  // submitted in this session. Avoids the awkward case where they tap
  // a star, see "saved", and the row stays visually un-rated. Keyed by
  // ride_id since a carpool produces two ratings.
  const [ratedRides, setRatedRides] = useState<Record<string, number>>({});
  // When the driver taps Cancel, we open the reason dialog and remember
  // which ride id to cancel on confirm. Null = dialog closed.
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  // Verify-Your-Ride PIN entry dialog state. Set to the ride id when
  // the driver taps "Start trip" on a PIN-required ride; cleared when
  // they verify, cancel, or the 3-strike auto-cancel fires.
  const [pinTargetId, setPinTargetId] = useState<string | null>(null);
  // No-show confirmation. Tapping "Rider didn't show up" arms this so
  // the driver gets a clear "the rider will be charged" confirmation
  // before the no-show fee actually fires.
  const [noShowArmed, setNoShowArmed] = useState(false);
  // Ticks every second while parked at pickup so the no-show countdown
  // (the driver must wait the full window before the button unlocks)
  // updates live.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Live position channel: driver streams own GPS so the rider can watch
  // the car move on the map. Hook also receives the rider's position so
  // the driver sees a blue dot for the passenger as they approach pickup.
  const activeRideId = data?.ride?.id ?? null;
  const { driverPosition, riderPosition, geoError } = useRidePosition(
    activeRideId,
    "driver",
    /* streamSelf */ true,
  );

  // ─── In-app turn-by-turn navigation state ───
  // The driver's primary surface during an active trip is the
  // top-of-screen instruction banner + voice prompts + map camera
  // that follows their heading — same shape as the Uber driver app.
  // Enabled for solo trips (carpool has a multi-stop tour that
  // doesn't reduce to a single driver→target nav session).
  const [directionsRoute, setDirectionsRoute] =
    useState<DirectionsRoute | null>(null);
  // True after the driver manually drags the map. Surfaces the
  // Recenter button in NavControls. Reset when the user taps it.
  const [cameraDisengaged, setCameraDisengaged] = useState(false);
  // Bumped to re-engage camera-follow inside MapView — any change to
  // this value triggers MapView's recenter effect.
  const [recenterToken, setRecenterToken] = useState(0);
  // Voice mute state mirrored from localStorage. Updated via the
  // floating button in NavControls.
  const [voiceMuted, setVoiceMuted] = useState(() => navVoice.isMuted());
  const handleToggleVoice = () => {
    const next = !voiceMuted;
    navVoice.setMuted(next);
    setVoiceMuted(next);
  };
  // Target for the in-app nav — flips from pickup to dropoff as soon
  // as the trip starts. Read off whichever copy of `ride` is loaded
  // (or default to "pickup" before data arrives so the hook stays
  // stable across mount → first fetch).
  const navTarget: "pickup" | "dropoff" =
    data?.ride?.status === "in_progress" ? "dropoff" : "pickup";
  // Carpool trips have a multi-stop tour rather than a single
  // driver→target nav session. The hook stays mounted (rules-of-hooks)
  // but disabled until carpool resolves false.
  const navEnabled =
    !!data?.ride && !!driverPosition && !data?.carpool;
  const navSnapshot = useTurnByTurn({
    route: directionsRoute,
    position: driverPosition,
    enabled: navEnabled,
    target: navTarget,
  });
  // Nav UI is only painted once we have a real first step from the
  // route fetch — without this, the banner would flash empty for the
  // 1-2 seconds between mount and the first Directions response.
  const navHasRoute = !!navSnapshot.currentStep;

  // Watches location permission during an in_progress trip. If the
  // driver turns location off, vibrates the phone + POSTs a violation
  // record server-side. 2 unresolved violations auto-deactivate the
  // driver (they have to contact support to reinstate).
  useLocationViolationMonitor({
    rideId: activeRideId,
    rideStatus: data?.ride?.status ?? null,
    enabled: !!activeRideId,
  });

  const refresh = async () => {
    try {
      const res = await fetch(ACTIVE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ActiveResponse;
      setData(json);
      setCachedDriverData(ACTIVE_URL, json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load active trip");
    } finally {
      setLoading(false);
    }
  };

  // Scroll to top whenever the ride status changes (accepted →
  // arrived → in_progress → completed) so the driver lands on the
  // updated stage hero + next-action button instead of wherever they
  // were last scrolled. Skips the very first render.
  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const next = data?.ride?.status ?? null;
    if (next && lastStatusRef.current && lastStatusRef.current !== next) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    lastStatusRef.current = next;
  }, [data?.ride?.status]);

  // Initial fetch + Supabase Realtime subscription. RLS gates the driver
  // to their own rides + open requests, so we subscribe to all `rides`
  // changes and let the policy filter what reaches us.
  useEffect(() => {
    let cancelled = false;

    refresh();

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("driver-active-trip")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Belt-and-braces backup poll. Realtime is the fast path, but a
  // websocket can drop silently while the driver is mid-trip — phone
  // backgrounds the tab, mobile OS sleeps the radio, network blips.
  // Without this the driver could come back to a stale "in progress"
  // screen even after the rider cancelled, or miss the rider→driver
  // status change that should have re-enabled an action button.
  // Hook pauses while the tab is hidden and re-fetches the moment it
  // comes back into focus, so the cost is bounded.
  useBackgroundRefresh(refresh, 5_000);

  // Tick once a second only while the driver is parked at pickup, so
  // the no-show countdown stays live without re-rendering the whole
  // page every second the rest of the time.
  const atPickup = data?.ride?.status === "arrived";
  useEffect(() => {
    if (!atPickup) return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [atPickup]);

  // Once the driver navigates away from a shown "trip ended" card,
  // remember it so coming back lands on a clean "no active trip".
  const recentlyEndedId = data?.recentlyEnded?.id ?? null;
  useEffect(() => {
    if (!recentlyEndedId) return;
    return () => {
      dismissedEndedTrips.add(recentlyEndedId);
    };
  }, [recentlyEndedId]);

  const handleAction = async (
    rideId: string,
    action: "arrived" | "start" | "complete",
    fareForCompletion: number,
  ) => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/driver/rides/${rideId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Server returned ${res.status}`);
      }
      if (action === "complete") {
        // The driver completed this trip themselves — the flash card
        // below covers it, so suppress the generic "trip ended" card.
        dismissedEndedTrips.add(rideId);
        // Capture the rider info BEFORE we clear `data` — the flash
        // card uses this snapshot to render the names + rating UI.
        const primary = data?.ride;
        const primaryRider = data?.rider?.name ?? "Rider";
        const partner = data?.carpool?.partner ?? null;
        if (primary) {
          setCompleted({
            fare: fareForCompletion,
            primaryRideId: primary.id,
            primaryRiderName: primaryRider,
            secondary: partner
              ? { rideId: partner.rideId, riderName: partner.riderName }
              : null,
          });
        }
        setData({ ride: null, rider: null, carpool: null });
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update status");
    } finally {
      setActing(false);
    }
  };

  const handleCancel = (rideId: string) => {
    // Pop the reason dialog; the actual cancel happens in performCancel
    // once the driver confirms with a reason.
    setCancelTargetId(rideId);
  };

  const performCancel = async (reason: string) => {
    if (!cancelTargetId) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/driver/rides/${cancelTargetId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Server returned ${res.status}`);
      }
      // The driver cancelled this trip themselves — no need to also
      // show the "trip ended" card for it.
      dismissedEndedTrips.add(cancelTargetId);
      setData({ ride: null, rider: null, carpool: null });
      setCancelTargetId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel ride");
    } finally {
      setActing(false);
    }
  };

  // Report the rider as a no-show. The server enforces the 5-minute
  // wait after arrival — if the driver taps too early it returns a
  // "wait N more minutes" message which surfaces in `error`.
  const handleNoShow = async (rideId: string) => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/driver/rides/${rideId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "no_show" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Server returned ${res.status}`);
      }
      // The driver reported this no-show themselves — don't re-surface
      // it as a generic "trip ended" card on the next poll.
      dismissedEndedTrips.add(rideId);
      setNoShowArmed(false);
      setData({ ride: null, rider: null, carpool: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't report no-show");
    } finally {
      setActing(false);
    }
  };

  /* ─── Loading ─── Skeleton mirrors the active-trip layout: hero
     + map + rider card + trip details. */
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py2 md:px-3 md:py-8">
        <HeroSkeleton />
        <MapSkeleton />
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
          <Skeleton className="h-14 w-14" rounded="full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-2.5 w-12" rounded="md" />
            <Skeleton className="h-4 w-40" rounded="md" />
            <Skeleton className="h-2.5 w-32" rounded="md" />
          </div>
        </div>
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

  /* ─── Just-completed flash ─── */
  if (completed) {
    return (
      <div className="mx-auto max-w-md space-y-6 px-4 py-12">
        <FadeUp>
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-600 text-white shadow-2xl shadow-emerald-600/40">
              <Icon name="check-circle" className="h-10 w-10" />
            </div>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
              Trip complete
            </h1>
            <p className="mt-3 text-sm text-muted">
              Great job. Your earnings for this trip:
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-rajlo-red">
              {formatJMD(completed.fare)}
            </p>
          </div>
        </FadeUp>

        {/* Per-rider rating row(s). For a solo trip there's just one;
           for carpool, two cards stacked. Each card calls the rating
           endpoint for its own ride_id, so the carpool case produces
           two independent ride_ratings rows. */}
        <FadeUp delay={0.1}>
          <RateRiderInline
            rideId={completed.primaryRideId}
            riderName={completed.primaryRiderName}
            label={completed.secondary ? "Rider 1" : "Your rider"}
            alreadyStars={ratedRides[completed.primaryRideId] ?? null}
            onRated={(s) =>
              setRatedRides((m) => ({ ...m, [completed.primaryRideId]: s }))
            }
          />
        </FadeUp>

        {completed.secondary && (
          <FadeUp delay={0.15}>
            <RateRiderInline
              rideId={completed.secondary.rideId}
              riderName={completed.secondary.riderName}
              label="Rider 2"
              alreadyStars={ratedRides[completed.secondary.rideId] ?? null}
              onRated={(s) =>
                setRatedRides((m) => ({
                  ...m,
                  [completed.secondary!.rideId]: s,
                }))
              }
            />
          </FadeUp>
        )}

        <FadeUp delay={0.2}>
          <Link
            href="/driver"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            Back to dashboard
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </FadeUp>
      </div>
    );
  }

  /* ─── No active trip ─── */
  if (!data?.ride) {
    // A trip that JUST ended (the rider cancelled, etc.) — show what
    // happened before collapsing to the generic empty state, so the
    // driver isn't left guessing why the trip vanished.
    const ended = data?.recentlyEnded ?? null;
    if (ended && !dismissedEndedTrips.has(ended.id)) {
      const done = ended.status === "completed";
      // Spell out exactly why the trip ended (wrong PIN, no-show, the
      // rider's own reason) — never a vague "trip cancelled".
      const { title, detail } = describeEndedTrip(
        ended.status,
        ended.cancellationReason,
        "driver",
      );
      return (
        <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
          <span
            className={`grid h-14 w-14 place-items-center rounded-full ${
              done
                ? "bg-emerald-50 text-emerald-600"
                : "bg-primary-soft text-rajlo-red"
            }`}
          >
            <Icon
              name={done ? "check-circle" : "x"}
              className="h-6 w-6"
            />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted">{detail}</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            {ended.pickupName} → {ended.dropoffName}
          </p>
          <Link
            href="/driver"
            onClick={() => dismissedEndedTrips.add(ended.id)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
          >
            Back to dashboard
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      );
    }
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
          <Icon name="navigation" className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          No active trip
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Head back to the dashboard and wait for an incoming request, or accept
          one from your inbox.
        </p>
        <Link
          href="/driver"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover"
        >
          Back to dashboard
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const { ride, rider } = data;
  const stage = STAGE_COPY[ride.status];

  // No-show countdown — the driver must wait the full pickup window
  // after marking "Arrived" before the no-show button unlocks. The
  // server enforces the same wait; this just surfaces it as a live
  // timer instead of letting the driver tap and get rejected.
  const noShowArrivedAt =
    ride.status === "arrived" ? ride.timeline?.arrivedAt ?? null : null;
  const noShowRemainingSec = noShowArrivedAt
    ? Math.max(
        0,
        NO_SHOW_WAIT_SEC.private -
          Math.floor((nowMs - new Date(noShowArrivedAt).getTime()) / 1000),
      )
    : NO_SHOW_WAIT_SEC.private;
  const noShowReady = ride.status === "arrived" && noShowRemainingSec <= 0;
  const initials = rider?.name
    ? rider.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join("")
    : "?";

  // Always pass all the pins to MapView — the component itself hides
  // the pickup pin during in_progress (no longer relevant once the
  // rider is on board) and uses `liveRoute` to draw the polyline from
  // the driver's live position to the right target.
  //
  // For a carpool trip, we synthesise a multi-stop route through both
  // riders' points: primary pickup → partner pickup → primary dropoff
  // → partner dropoff. This gives the driver a clear visual of the
  // whole tour they've signed up for. (Live-route mode is disabled
  // for carpool — a single driver→target line doesn't capture the
  // multi-stage flow; the driver uses Google Maps for actual nav.)
  const carpool = data?.carpool ?? null;

  const mapPickup: Place = {
    placeId: "",
    name: ride.pickup.name,
    address: ride.pickup.address,
    lat: ride.pickup.lat,
    lng: ride.pickup.lng,
    parish: null,
  };
  const mapDropoff: Place = carpool
    ? {
        placeId: "",
        name: carpool.partner.dropoff.name,
        address: carpool.partner.dropoff.address,
        lat: carpool.partner.dropoff.lat,
        lng: carpool.partner.dropoff.lng,
        parish: null,
      }
    : {
        placeId: "",
        name: ride.dropoff.name,
        address: ride.dropoff.address,
        lat: ride.dropoff.lat,
        lng: ride.dropoff.lng,
        parish: null,
      };
  const mapStops: Place[] = carpool
    ? [
        // Partner's pickup goes between the two pickups.
        {
          placeId: "",
          name: carpool.partner.pickup.name,
          address: carpool.partner.pickup.address,
          lat: carpool.partner.pickup.lat,
          lng: carpool.partner.pickup.lng,
          parish: null,
        },
        // Then primary's dropoff. Partner's dropoff is the final dropoff
        // (set as `mapDropoff` above).
        {
          placeId: "",
          name: ride.dropoff.name,
          address: ride.dropoff.address,
          lat: ride.dropoff.lat,
          lng: ride.dropoff.lng,
          parish: null,
        },
      ]
    : ride.stops.map((s) => ({
        placeId: "",
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        parish: null,
      }));

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-2 md:px-3 md:py-8">
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -right-20 -bottom-24 opacity-[0.18]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              {stage.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              {stage.headline}
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/75">
              {stage.description}
            </p>
          </div>
        </div>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}
      {geoError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {geoError} The rider can&apos;t track your position until this is
          fixed.
        </div>
      )}

      <FadeUp delay={0.05}>
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-lg shadow-rajlo-red/[0.04]">
          {/* The map is the driver's primary navigation surface — give
             it real viewport real-estate. Live-route mode draws the
             on-the-road line from the driver's current position to
             pickup (accepted/arrived) or dropoff (in_progress).
             Disabled for carpool: the route is a 4-point tour (two
             pickups + two dropoffs) rather than a single driver→target
             line, so we fall back to the static-route polyline.

             When the solo-trip nav engages (navEnabled + a fetched
             route), MapView switches into navMode — tilt + heading
             follow + camera pinned to the lower third — and we paint
             the NavBanner / NavControls / NavTripCard over the top. */}
          <MapView
            viewer="driver"
            pickup={mapPickup}
            stops={mapStops}
            dropoff={mapDropoff}
            driverPosition={driverPosition}
            riderPosition={riderPosition}
            liveRoute={
              carpool
                ? null
                : ride.status === "in_progress"
                ? { target: "dropoff" }
                : { target: "pickup" }
            }
            navMode={navEnabled}
            onDirectionsRoute={setDirectionsRoute}
            onUserDrag={() => setCameraDisengaged(true)}
            recenterToken={recenterToken}
            className="h-[55vh] min-h-[20rem] w-full md:h-[60vh] md:max-h-[640px]"
          />
          {navHasRoute && (
            <>
              <NavBanner snapshot={navSnapshot} />
              <NavControls
                cameraDisengaged={cameraDisengaged}
                onRecenter={() => {
                  setCameraDisengaged(false);
                  setRecenterToken((t) => t + 1);
                }}
                muted={voiceMuted}
                onToggleMute={handleToggleVoice}
              />
              <NavTripCard
                snapshot={navSnapshot}
                headline={`${
                  navTarget === "pickup" ? "Pick up" : "Drop off"
                } ${rider?.name ?? "rider"}`}
                addressLine={
                  navTarget === "pickup"
                    ? ride.pickup.address
                    : ride.dropoff.address
                }
                actionLabel={stage.actionLabel}
                actionVariant={
                  ride.status === "in_progress" ? "success" : "primary"
                }
                actionDisabled={acting}
                acting={acting}
                onAction={() => {
                  if (
                    stage.actionAction === "start" &&
                    data?.ride?.pin?.required &&
                    !data?.ride?.pin?.verified
                  ) {
                    setPinTargetId(ride.id);
                    return;
                  }
                  handleAction(
                    ride.id,
                    stage.actionAction,
                    ride.estimatedFareJMD,
                  );
                }}
                expandedChildren={
                  <>
                    {ride.status !== "in_progress" && (
                      <button
                        type="button"
                        onClick={() => handleCancel(ride.id)}
                        disabled={acting}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-soft hover:text-rajlo-red disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Icon name="x" className="h-4 w-4" />
                        Cancel ride
                      </button>
                    )}
                    {ride.status === "arrived" && !noShowReady && (
                      <div className="flex items-center justify-center gap-2 rounded-full border border-line bg-surface-soft px-5 py-2.5 text-xs font-bold text-muted">
                        <Icon name="history" className="h-4 w-4" />
                        Report no-show in{" "}
                        {Math.floor(noShowRemainingSec / 60)}:
                        {String(noShowRemainingSec % 60).padStart(2, "0")}
                      </div>
                    )}
                    {ride.status === "arrived" &&
                      noShowReady &&
                      (noShowArmed ? (
                        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
                          <p className="text-xs font-semibold leading-relaxed text-amber-900">
                            Only report a no-show if you waited the full
                            5 minutes and the rider never came. The rider
                            is charged a J$300 no-show fee — you keep J$240.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setNoShowArmed(false)}
                              disabled={acting}
                              className="inline-flex flex-1 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-muted transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNoShow(ride.id)}
                              disabled={acting}
                              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {acting ? "Working…" : "Confirm no-show"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setNoShowArmed(true)}
                          disabled={acting}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-soft hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Icon name="history" className="h-4 w-4" />
                          Rider didn&apos;t show up
                        </button>
                      ))}
                  </>
                }
              />
            </>
          )}
        </div>
      </FadeUp>

      {/* Carpool banner — distinct red ribbon making it crystal-clear
         the driver has two riders. Only shown when partner data is
         present in the response. */}
      {carpool && (
        <FadeUp delay={0.08}>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-rajlo-red/40 bg-primary-soft p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
              <Icon name="users" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Carpool · 2 riders
              </p>
              <p className="mt-0.5 text-sm font-bold leading-snug">
                Pick up {rider?.name ?? "Rider 1"} first, then{" "}
                {carpool.partner.riderName}.
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Combined fare ·{" "}
                {formatJMD(ride.estimatedFareJMD + carpool.partner.fareJMD)}
              </p>
            </div>
          </div>
        </FadeUp>
      )}

      {rider && (
        <FadeUp delay={0.1}>
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-base font-extrabold text-rajlo-red ring-1 ring-rajlo-red/20">
                {rider.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rider.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                  {carpool ? "Rider 1 (pickup first)" : "Rider"}
                </p>
                <p className="mt-0.5 truncate text-base font-extrabold tracking-tight">
                  {rider.name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {ride.seats} seat{ride.seats === 1 ? "" : "s"}
                  {ride.estimatedFareJMD
                    ? ` · ${formatJMD(ride.estimatedFareJMD)} estimated`
                    : ""}
                </p>
              </div>
              {/* Tap-to-call sits next to the chat icon so drivers
                 can reach the rider with one tap ("I'm at your
                 gate"). In-app voice via LiveKit — the rider's
                 PSTN number is never exposed. */}
              <CallButton rideId={ride.id} variant="subtle" label="" />
              {/* Chat icon — `soft` variant (NOT dark) because this
                 card is on a white surface; the dark variant would be
                 invisible white-on-white. */}
              <ChatLauncher
                rideId={ride.id}
                myRole="driver"
                peerName={rider.name}
                peerAvatarUrl={rider.avatarUrl ?? null}
                peerPhone={rider.phone ?? null}
                rideActive
                variant="soft"
                iconSize={44}
              />
            </div>
          </div>
        </FadeUp>
      )}

      {/* Carpool partner card — same shape as the primary rider card
         but visually demoted with "Rider 2 (pickup second)" so the
         driver knows the order. */}
      {carpool && (
        <FadeUp delay={0.12}>
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-rajlo-red/10 text-base font-extrabold text-rajlo-red ring-1 ring-rajlo-red/20">
              {carpool.partner.riderName
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase())
                .join("") || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                Rider 2 (pickup second)
              </p>
              <p className="mt-0.5 truncate text-base font-extrabold tracking-tight">
                {carpool.partner.riderName}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {carpool.partner.seats} seat
                {carpool.partner.seats === 1 ? "" : "s"} ·{" "}
                {formatJMD(carpool.partner.fareJMD)} estimated
              </p>
            </div>
          </div>
        </FadeUp>
      )}

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

          {ride.notes && (
            <div className="mt-5 rounded-xl bg-primary-soft px-4 py-3">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Note from rider
              </p>
              <p className="mt-1 text-sm text-foreground">{ride.notes}</p>
            </div>
          )}
        </div>
      </FadeUp>

      {/* ── Action bar ──
         Hidden when the in-app nav is active — the NavTripCard
         overlay on the map provides the same primary action plus
         cancel / no-show controls behind its "More options" toggle.
         Two action surfaces stacked vertically would just confuse. */}
      {!navHasRoute && (
      <FadeUp delay={0.2}>
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-col gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:relative md:mx-0 md:rounded-2xl md:border md:bg-surface md:px-5 md:py-4">
          {/* Google Maps deep-link — stage-aware. Before pickup, route to
              pickup with the driver's live position as origin (Google
              Maps falls back to "current location" if origin omitted).
              After arrival, route pickup → stops → dropoff so the driver
              follows the ride's actual path. Opens in the Google Maps app
              on mobile, or the Maps web UI on desktop. */}
          <a
            href={buildGoogleMapsDirectionsUrl(ride)}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:bg-primary-soft hover:text-rajlo-red"
          >
            <Icon name="navigation" className="h-4 w-4 text-rajlo-red" />
            {ride.status === "accepted"
              ? "Open Google Maps · drive to pickup"
              : "Open Google Maps · drive to dropoff"}
            <Icon
              name="arrow-right"
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </a>

          <button
            type="button"
            onClick={() => {
              // PIN gate. If the rider opted into Verify-Your-Ride
              // and we haven't entered the right code yet, open the
              // PIN dialog instead of firing the start transition —
              // the server would 412 us anyway, so let's collect
              // the digits first.
              if (
                stage.actionAction === "start" &&
                data?.ride?.pin?.required &&
                !data?.ride?.pin?.verified
              ) {
                setPinTargetId(ride.id);
                return;
              }
              handleAction(ride.id, stage.actionAction, ride.estimatedFareJMD);
            }}
            disabled={acting}
            className={`group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:-translate-y-0 ${
              ride.status === "in_progress"
                ? "bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-700"
                : "bg-rajlo-red shadow-rajlo-red/30 hover:bg-primary-hover"
            }`}
          >
            {acting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                Working…
              </>
            ) : (
              <>
                {stage.actionLabel}
                <Icon
                  name={
                    ride.status === "in_progress"
                      ? "check-circle"
                      : "arrow-right"
                  }
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </>
            )}
          </button>
          {ride.status !== "in_progress" && (
            <button
              type="button"
              onClick={() => handleCancel(ride.id)}
              disabled={acting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-sm font-bold text-muted transition-colors hover:bg-surface-soft hover:text-rajlo-red disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon name="x" className="h-4 w-4" />
              Cancel ride
            </button>
          )}

          {/* No-show — only once the driver is at the pickup, and only
             after the full wait window. Until the timer runs out the
             driver sees a live countdown instead of the button. */}
          {ride.status === "arrived" && !noShowReady && (
            <div className="flex items-center justify-center gap-2 rounded-full border border-line bg-surface-soft px-5 py-3 text-sm font-bold text-muted">
              <Icon name="history" className="h-4 w-4" />
              Report no-show in {Math.floor(noShowRemainingSec / 60)}:
              {String(noShowRemainingSec % 60).padStart(2, "0")}
            </div>
          )}
          {ride.status === "arrived" &&
            noShowReady &&
            (noShowArmed ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-xs font-semibold leading-relaxed text-amber-900">
                  Only report a no-show if you waited the full 5 minutes
                  and the rider never came. The rider is charged a J$300
                  no-show fee — you keep J$240.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setNoShowArmed(false)}
                    disabled={acting}
                    className="inline-flex w-full items-center justify-center rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNoShow(ride.id)}
                    disabled={acting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {acting ? "Working…" : "Confirm no-show"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNoShowArmed(true)}
                disabled={acting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-sm font-bold text-muted transition-colors hover:bg-surface-soft hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name="history" className="h-4 w-4" />
                Rider didn&apos;t show up
              </button>
            ))}
        </div>
      </FadeUp>
      )}

      {/* The chat launcher (icon + sheet + toast) lives inside the
         rider card above. Nothing more to mount here. */}

      <CancelReasonDialog
        open={cancelTargetId !== null}
        role="driver"
        busy={acting}
        onClose={() => setCancelTargetId(null)}
        onConfirm={performCancel}
      />

      <PinEntryDialog
        open={pinTargetId !== null}
        rideId={pinTargetId}
        onClose={() => setPinTargetId(null)}
        onVerified={() => {
          // Server stamped pin_verified_at. Close the dialog and
          // immediately fire the start transition; the gate that
          // 412'd us before now passes.
          const rideId = pinTargetId;
          setPinTargetId(null);
          if (rideId) {
            void handleAction(rideId, "start", ride.estimatedFareJMD);
          }
        }}
        onCancelled={() => {
          // 3-strikes cancel. The ride row is already cancelled
          // server-side — just clear our local state, close the
          // dialog, and let the active-trip refresh bounce us to
          // the empty state.
          setPinTargetId(null);
          void refresh();
        }}
      />
    </div>
  );
}

/**
 * Inline "rate the rider" card shown on the post-completion flash.
 * One per ride — for a carpool, two cards stacked. We do this inline
 * (rather than a modal) because the post-trip flash is a focused
 * moment with nothing else competing for attention; popping a modal
 * over a centered hero would feel weirdly redundant.
 */
function RateRiderInline({
  rideId,
  riderName,
  label,
  alreadyStars,
  onRated,
}: {
  rideId: string;
  riderName: string;
  label: string;
  alreadyStars: number | null;
  onRated: (stars: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stars = alreadyStars ?? 0;
  const submitted = alreadyStars !== null;

  const submit = async (n: number) => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/driver/rides/${rideId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: n }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409) {
          // Already rated — treat as success so the UI doesn't get stuck.
          onRated(n);
        } else {
          throw new Error(j.error ?? `Server returned ${res.status}`);
        }
      } else {
        onRated(n);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save rating");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
        {label} · rate the trip
      </p>
      <p className="mt-1 text-sm font-bold tracking-tight">{riderName}</p>
      <div
        className="mt-3 flex items-center gap-2"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= (hover || stars);
          const locked = submitting || submitted;
          return (
            <button
              key={n}
              type="button"
              disabled={locked}
              onMouseEnter={() => !locked && setHover(n)}
              onClick={() => submit(n)}
              aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
              className={`grid h-10 w-10 place-items-center rounded-full transition-all ${
                filled
                  ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                  : "bg-surface-soft text-muted hover:bg-primary-soft hover:text-rajlo-red"
              } ${locked ? "cursor-default" : "hover:-translate-y-0.5"}`}
            >
              <Icon name="star" className="h-4 w-4" />
            </button>
          );
        })}
        {submitted && (
          <span className="ml-2 text-xs font-bold text-emerald-700">
            Thanks!
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-rajlo-red">{error}</p>
      )}
    </div>
  );
}

/**
 * Build a `https://www.google.com/maps/dir/?...` URL the driver can hand
 * off to. Stage-dependent:
 *
 * - status=accepted   → origin = current location (omitted, Google asks),
 *                       destination = pickup
 * - status=arrived    → same as in_progress (driver is at pickup, about
 *                       to start driving the rider somewhere)
 * - status=in_progress → origin = pickup, destination = dropoff,
 *                        waypoints = each intermediate stop in order
 */
function buildGoogleMapsDirectionsUrl(ride: ActiveRide): string {
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "driving");

  if (ride.status === "accepted") {
    // Drive to pickup — use device's current location as origin (omit it
    // and Google Maps fills in "Your location").
    params.set("destination", `${ride.pickup.lat},${ride.pickup.lng}`);
    params.set("destination_place_id", ""); // ensures coords are honoured
  } else {
    // After arrival → route the actual ride: pickup → stops → dropoff.
    params.set("origin", `${ride.pickup.lat},${ride.pickup.lng}`);
    params.set("destination", `${ride.dropoff.lat},${ride.dropoff.lng}`);
    if (ride.stops.length > 0) {
      params.set(
        "waypoints",
        ride.stops.map((s) => `${s.lat},${s.lng}`).join("|"),
      );
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
