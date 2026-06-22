"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { MapView } from "@/components/map-view";
import {
  RiderBottomSheet,
  useFloatingControlsOffset,
} from "@/components/rider-bottom-sheet";
import { AnonymousBookingPrompt } from "@/components/anonymous-booking-prompt";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useIsMobile } from "@/lib/use-is-mobile";
import { MapPinPicker } from "@/components/map-pin-picker";
import { SavedPlaceChips } from "@/components/saved-place-chips";
import { Skeleton } from "@/components/skeleton";
import { InsufficientFundsDialog } from "@/components/insufficient-funds-dialog";
import { loadGoogleMaps } from "@/lib/google-maps";
import { useFleet } from "@/lib/use-fleet";
import { formatEta } from "@/lib/format-eta";
import {
  detectParish,
  estimateFare,
  fareForDistance,
  formatJMD,
  type FareEstimate,
  type Place,
} from "@/lib/jamaica";
import type { CorridorPath } from "@/lib/route-taxi-pathfinder";

type RouteTaxiMatch = {
  route: {
    id: string;
    origin: string;
    destination: string;
    parish: string | null;
    distanceKm: number;
    taFareJmd: number;
    slug: string;
  };
  direction: "forward" | "reverse";
  fareJmd: number;
  confidence: "high" | "medium" | "low";
};

/**
 * Rider booking screen. Multi-stop aware: pickup + 0–4 intermediate stops +
 * dropoff. Live map preview, live fare preview.
 *
 * Two completely separate layouts (mobile / desktop) rendered side by side
 * with `md:hidden` / `hidden md:flex`. The breakpoint just swaps which tree
 * is mounted — no layout-property overrides between mobile and desktop.
 *
 * - Mobile: map on top (h-64), sliding-sheet form below, action bar fixed
 *   at the viewport bottom.
 * - Desktop: map card on the left (flex-1 with rounded corners), form card
 *   on the right (w-[420px] with rounded corners). The action bar lives
 *   INSIDE the form card at the bottom — width = column width = 420px,
 *   never covers map content, never spans the full viewport.
 */
export default function RiderRequestPage() {
  const router = useRouter();
  const [pickup, setPickup] = useState<Place | null>(null);
  // Stops is `(Place | null)[]` so an "Add stop" tap can spawn an empty row
  // the user fills via autocomplete. Filtered to non-null when computing
  // the route + fare.
  const [stops, setStops] = useState<(Place | null)[]>([]);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [seats, setSeats] = useState(1);
  const [notes, setNotes] = useState("");
  // Concession (half-fare) for TA-recognised categories: children,
  // students in uniform, physically disabled, seniors. Self-declared
  // here; drivers do the visual eligibility check at pickup. Only
  // applies to route-taxi trips — Private rides aren't covered by
  // the TA tariff concession.
  const [concession, setConcession] = useState(false);
  // Carpool was scoped out of launch — the toggle and matching logic
  // are intentionally hidden from the UI until we have the bandwidth
  // to do the matcher properly. The server still defaults `allowCarpool`
  // to false, so no contract change is required here.
  // Mode B (Route Taxi) lives inside this flow now. The picker only
  // surfaces once we have both pickup + dropoff — before that, the
  // matcher has nothing to chew on. Default mode is `private` because
  // route taxi may not even be available for this trip.
  const [mode, setMode] = useState<"private" | "route_taxi">("private");
  // Multi-step wizard inside the request page:
  //   step 1 "locations"   — pickup / stops / dropoff inputs
  //   step 2 "choose-ride" — locations as read-only summary + ride
  //                          cards (private + route taxi) + tiered
  //                          walk pill + leg breakdown dropdown
  //   step 3 "summary"     — locations text + selected mode + seats
  //                          + notes + fare breakdown + confirm CTA
  // Keeping everything on one route (no URL change) means back/
  // forward arrows + a partially-completed booking survive a tab
  // accidentally swiping away to /dashboard mid-flow.
  const [step, setStep] = useState<"locations" | "choose-ride" | "summary">(
    "locations",
  );
  const [matches, setMatches] = useState<RouteTaxiMatch[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // Multi-leg journey fallback — when the corridor matcher returns
  // zero rows, we run the pathfinder to see if a chain of corridors
  // can cover the same A → B (e.g. 7-Mile → Negril Bus Park →
  // Sav-la-Mar). The result, when present, drives the Route Taxi
  // card instead of the single-corridor variant.
  const [journeyQuote, setJourneyQuote] = useState<CorridorPath | null>(null);
  const [journeyQuoting, setJourneyQuoting] = useState(false);
  // Collapses the leg-by-leg breakdown on the Route Taxi card.
  // Default open when a journey first loads so the rider sees the
  // detail without an extra tap; they can collapse if they want.
  const [legsExpanded, setLegsExpanded] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Triggered when the booking API returns 402 (insufficient wallet
  // balance). Holds both numbers we need to show the "short by X"
  // breakdown in the modal — set together from the API response so
  // the dialog doesn't have to fetch the balance again.
  const [insufficientFunds, setInsufficientFunds] = useState<{
    fareJmd: number;
    balanceJmd: number;
  } | null>(null);
  // While we're checking on mount whether the user already has an active
  // ride (and should be sent to the live-trip view instead of the booking
  // form), hide the form to avoid a flash of "book a ride" UI.
  const [bootstrapping, setBootstrapping] = useState(true);

  // Anonymous-visitor support. /rider/request is reachable without a
  // session so first-time visitors can see the trip preview (map +
  // pickup + dropoff + fare estimate) before being asked to sign in.
  //   null  = haven't checked auth yet (suppress overlay during first
  //           paint to avoid flicker)
  //   true  = visitor is signed out → show AnonymousBookingPrompt
  //   false = signed in → normal booking flow
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setIsAnonymous(!data.user);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mobile XOR desktop. The previous Tailwind-only switch left BOTH
  // layout trees mounted, so MapView, the form, and every WaypointSlot
  // / PlacesAutocomplete ran in duplicate. That's also a class of bug
  // we want to avoid here (subscriptions, Google Places listeners).
  const { isMobile, mounted: viewportReady } = useIsMobile();

  // Push MapView's floating controls (locate-me button) above the
  // bottom sheet's collapsed snap so they stay visible. 0.55 not
  // 0.5 — the 5% extra is the small gap so the button sits ABOVE
  // the sheet edge, not flush with it (where it'd be half-hidden).
  const floatingControlsOffset = useFloatingControlsOffset(0.55);

  // Imperative collapse signal for the bottom sheet. Bumped after
  // the rider picks a dropoff (with pickup already set) so the sheet
  // shrinks back to its collapsed snap and the map gets a wider view
  // of the full A→B route. Counter, not boolean, because the SHEET
  // listens for CHANGES — re-collapsing after a route edit means
  // bumping again.
  const [collapseSheetSignal, setCollapseSheetSignal] = useState(0);
  const collapseSheetForRouteView = () => {
    setCollapseSheetSignal((c) => c + 1);
    // Dismiss the mobile keyboard so the sheet doesn't have to fight
    // it on the way down. Without this, the keyboard stays up and our
    // keyboard-auto-expand effect would spring the sheet back open
    // the moment it sees keyboardOpen is still true on the next tick.
    if (typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }
  };

  // Map-pin picker overlay state. When non-null we render the
  // fullscreen `<MapPinPicker>` over the booking page, letting the
  // rider drag the map under a fixed centre pin to set whichever
  // endpoint they're picking. `null` = picker closed.
  const [pinPickerTarget, setPinPickerTarget] = useState<
    "pickup" | "dropoff" | null
  >(null);

  // On mount: if the rider already has an in-flight trip — either a
  // private ride (Mode A) or a route taxi hail (Mode B) — skip the
  // booking form and send them to the live surface for whichever they're
  // on. This makes the booking flow refresh-survivable AND blocks
  // double-booking when one trip is already in flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rideRes, hailRes] = await Promise.all([
          fetch("/api/rider/rides/active"),
          fetch("/api/rider/route-taxi/hails/active").catch(() => null),
        ]);
        if (hailRes && hailRes.ok) {
          const hailJson = (await hailRes.json()) as {
            hail: { id: string } | null;
          };
          if (!cancelled && hailJson.hail) {
            router.replace(
              `/rider/route-taxi/live?id=${hailJson.hail.id}`,
            );
            return;
          }
        }
        if (!rideRes.ok) return;
        const json = (await rideRes.json()) as {
          ride: { id: string } | null;
        };
        if (!cancelled && json.ride) {
          router.replace("/rider/live-trip");
          return;
        }
      } catch {
        /* offline → just show the booking form */
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Pre-fill pickup + dropoff from URL params — used by:
  //   - The dashboard's "Where you go most" cards (dropoff only,
  //     via `to_*` params)
  //   - The history detail's "Book again" button (BOTH pickup +
  //     dropoff, via `from_*` AND `to_*`)
  //
  // Multistops are deliberately not deep-linked — the booking page
  // starts with a clean A → B route and the rider can add stops
  // manually if they want them. Mount-only read; we don't react to
  // URL changes after this since the rider would then see their
  // typed locations get overwritten on a back-nav.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // Dropoff (`to_*`)
    const toName = params.get("to_name");
    const toLat = parseFloat(params.get("to_lat") ?? "");
    const toLng = parseFloat(params.get("to_lng") ?? "");
    if (toName && Number.isFinite(toLat) && Number.isFinite(toLng)) {
      setDropoff({
        placeId: params.get("to_place") ?? "",
        name: toName,
        address: params.get("to_address") ?? "",
        lat: toLat,
        lng: toLng,
        // Parish gets re-detected the next time the rider edits the
        // field. The fare estimate works off lat/lng, so a missing
        // parish here is fine.
        parish: null,
      });
    }

    // Pickup (`from_*`)
    const fromName = params.get("from_name");
    const fromLat = parseFloat(params.get("from_lat") ?? "");
    const fromLng = parseFloat(params.get("from_lng") ?? "");
    if (fromName && Number.isFinite(fromLat) && Number.isFinite(fromLng)) {
      setPickup({
        placeId: params.get("from_place") ?? "",
        name: fromName,
        address: params.get("from_address") ?? "",
        lat: fromLat,
        lng: fromLng,
        parish: null,
      });
    }

    // Passenger count from the landing booking widget. Clamped to the
    // 1–4 range the seats picker exposes; anything else falls back to
    // the default of 1.
    const seatsParam = parseInt(params.get("seats") ?? "", 10);
    if (Number.isFinite(seatsParam) && seatsParam >= 1 && seatsParam <= 4) {
      setSeats(seatsParam);
    }
  }, []);

  const filledStops = useMemo(
    () => stops.filter((s): s is Place => s !== null),
    [stops],
  );

  // Whenever both endpoints land, hit the matcher to see if any TA
  // corridor covers this trip. Multi-stop trips can't use Mode B
  // (route taxi is single-leg by definition) — skip the call and
  // force-pin the rider to private.
  useEffect(() => {
    if (!pickup || !dropoff || filledStops.length > 0) {
      setMatches(null);
      setSelectedRouteId(null);
      if (mode !== "private") setMode("private");
      return;
    }
    let cancelled = false;
    setMatching(true);
    (async () => {
      try {
        const res = await fetch("/api/rider/route-taxi/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: {
              name: pickup.name,
              address: pickup.address,
              parish: pickup.parish,
              lat: pickup.lat,
              lng: pickup.lng,
            },
            dropoff: {
              name: dropoff.name,
              address: dropoff.address,
              parish: dropoff.parish,
              lat: dropoff.lat,
              lng: dropoff.lng,
            },
          }),
        });
        if (!res.ok) throw new Error("match failed");
        const json = (await res.json()) as { matches: RouteTaxiMatch[] };
        if (cancelled) return;
        setMatches(json.matches);
        // Pre-select the top match so the rider can flip to Route Taxi
        // mode in one tap without picking from the list. They can swap
        // to a different match if there are several.
        if (json.matches.length > 0) {
          setSelectedRouteId(json.matches[0].route.id);
        } else {
          setSelectedRouteId(null);
          if (mode !== "private") setMode("private");
        }
      } catch {
        if (!cancelled) {
          setMatches([]);
          setSelectedRouteId(null);
        }
      } finally {
        if (!cancelled) setMatching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally don't depend on `mode` — it's only set HERE,
    // never the trigger. Putting it in deps creates a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, dropoff, filledStops.length]);

  // Multi-leg fallback. When the corridor matcher returns zero rows
  // we still want to offer Route Taxi if a chain of corridors can
  // cover the A → B (e.g. 7-Mile → Negril Bus Park → Sav-la-Mar).
  // Triggers only after the matcher has settled (matching === false)
  // AND matches is an empty array (not null = "still loading"). The
  // journey-quote endpoint snaps pickup/dropoff to the nearest
  // corridor endpoints and runs Dijkstra over the corridor graph.
  useEffect(() => {
    if (!pickup || !dropoff || filledStops.length > 0) {
      setJourneyQuote(null);
      return;
    }
    if (matching) return;
    if (!matches || matches.length > 0) {
      // Either still loading, or a direct corridor was found — no
      // need for the multi-leg fallback.
      setJourneyQuote(null);
      return;
    }
    let cancelled = false;
    setJourneyQuoting(true);
    (async () => {
      try {
        const res = await fetch("/api/rider/route-taxi/journey-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: {
              name: pickup.name,
              lat: pickup.lat,
              lng: pickup.lng,
            },
            dropoff: {
              name: dropoff.name,
              lat: dropoff.lat,
              lng: dropoff.lng,
            },
          }),
        });
        if (!res.ok) throw new Error("journey-quote failed");
        const json = (await res.json()) as {
          journey: CorridorPath | null;
        };
        if (cancelled) return;
        setJourneyQuote(json.journey);
      } catch {
        if (!cancelled) setJourneyQuote(null);
      } finally {
        if (!cancelled) setJourneyQuoting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, filledStops.length, matching, matches]);

  // The match the rider would get IF they pick Route Taxi — drives
  // the card render. Defaults to the top match the matcher returned;
  // changes when the rider picks a different one from the sub-list.
  const displayMatch = useMemo(
    () =>
      (matches ?? []).find((m) => m.route.id === selectedRouteId) ??
      matches?.[0] ??
      null,
    [matches, selectedRouteId],
  );
  // The match the rider has actually committed to — only non-null
  // when they're in route_taxi mode. Drives the submit handler +
  // action-bar fare/CTA.
  const selectedMatch = mode === "route_taxi" ? displayMatch : null;

  // Auto-flip mode back to "private" when Route Taxi is no longer a
  // viable choice — either the matcher returned no direct corridor
  // AND the multi-leg journey is non-hailable (rider too far from
  // any road). Without this the rider could land on the page in
  // route_taxi mode with no match + no hailable journey, see an
  // off-corridor info card, and still hit "Hail next car" in the
  // action bar — which would silently fall through to private ride
  // creation.
  useEffect(() => {
    if (mode !== "route_taxi") return;
    const hasMatch = (matches ?? []).length > 0;
    const hasHailableJourney =
      journeyQuote !== null && journeyQuote.hailable;
    if (!hasMatch && !hasHailableJourney) {
      setMode("private");
    }
  }, [mode, matches, journeyQuote]);

  const allPoints = useMemo(() => {
    const list: Place[] = [];
    if (pickup) list.push(pickup);
    filledStops.forEach((s) => list.push(s));
    if (dropoff) list.push(dropoff);
    return list;
  }, [pickup, filledStops, dropoff]);

  // Straight-line fallback — only used if Google Directions is
  // unavailable. It is NEVER shown as the live price (that caused the
  // "low fare flashes, then jumps higher" bug) — while the accurate
  // lookup runs the UI shows a "Calculating…" state instead.
  const localFare = useMemo(
    () => estimateFare(allPoints, seats),
    [allPoints, seats],
  );

  // Real road distance from Google Directions, keyed to the EXACT set
  // of points it was computed for — so a stale result from a previous
  // trip can never be shown while a new lookup is in flight.
  const [drivingDist, setDrivingDist] = useState<{
    key: Place[];
    totalKm: number;
    etaMinutes: number;
  } | null>(null);
  // The points set the Directions lookup failed for (if any).
  const [fareFailedKey, setFareFailedKey] = useState<Place[] | null>(null);

  useEffect(() => {
    if (allPoints.length < 2) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        const ds = new g.maps.DirectionsService();
        const origin = allPoints[0];
        const destination = allPoints[allPoints.length - 1];
        const result = await ds.route({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          waypoints: allPoints.slice(1, -1).map((p) => ({
            location: { lat: p.lat, lng: p.lng },
            stopover: true,
          })),
          travelMode: g.maps.TravelMode.DRIVING,
          region: "jm",
        });
        if (cancelled) return;
        const legs = result.routes[0]?.legs ?? [];
        let meters = 0;
        let seconds = 0;
        for (const leg of legs) {
          meters += leg.distance?.value ?? 0;
          seconds += leg.duration?.value ?? 0;
        }
        if (meters <= 0) {
          setFareFailedKey(allPoints);
          return;
        }
        setDrivingDist({
          key: allPoints,
          totalKm: meters / 1000,
          etaMinutes: Math.max(5, Math.round(seconds / 60)),
        });
      } catch {
        if (!cancelled) setFareFailedKey(allPoints);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allPoints]);

  // The accurate distance only counts when it's for the CURRENT points.
  const drivingMatches =
    drivingDist && drivingDist.key === allPoints ? drivingDist : null;

  // True while the accurate fare is still being fetched. The price UI
  // shows "Calculating…" rather than the rough straight-line estimate,
  // so the rider only ever sees one final, correct number.
  const fareCalculating =
    allPoints.length >= 2 && !drivingMatches && fareFailedKey !== allPoints;

  // Re-price from the real road distance; recomputes instantly when
  // the seat count changes (no need to re-hit Directions). Falls back
  // to the straight-line estimate only if Directions failed.
  const fare = useMemo<FareEstimate>(() => {
    if (drivingMatches) {
      return fareForDistance({
        totalKm: drivingMatches.totalKm,
        etaMinutes: drivingMatches.etaMinutes,
        intermediateStops: Math.max(0, allPoints.length - 2),
        extraSeats: Math.max(0, seats - 1),
      });
    }
    return localFare;
  }, [drivingMatches, allPoints, seats, localFare]);

  // Subscribe to the global fleet channel so we can show car icons on the
  // booking-screen map. Disabled while we're bootstrapping (no point
  // opening a websocket if we're about to redirect away).
  const fleetDrivers = useFleet(/* active */ !bootstrapping);

  // Pickup ETA bubble = how long the closest online driver would take to
  // reach pickup. We pick the closest fleet dot by great-circle distance
  // and translate to minutes at ~30 km/h (typical Kingston average
  // including traffic + lights). This is a heuristic — the live ETA
  // gets refined the moment we have a real assignment + Directions
  // response — but it's accurate enough to read as "soon" vs "a while"
  // for a rider deciding whether to book now.
  const pickupEtaMinutes = useMemo<number | null>(() => {
    if (!pickup || fleetDrivers.length === 0) return null;
    let nearestKm = Infinity;
    for (const d of fleetDrivers) {
      // Quick equirectangular approx — fine at the city scale we care
      // about and 30× cheaper than a full haversine in a hot poll.
      const dLat = d.lat - pickup.lat;
      const dLng = (d.lng - pickup.lng) * Math.cos((pickup.lat * Math.PI) / 180);
      const km = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
      if (km < nearestKm) nearestKm = km;
    }
    if (!isFinite(nearestKm)) return null;
    // ~2 min/km at 30 km/h, plus a 1-minute floor so we never claim "0
    // min" even when a driver is parked on the pickup spot.
    return Math.max(1, Math.round(nearestKm * 2));
  }, [pickup, fleetDrivers]);

  const canSubmit =
    Boolean(pickup) &&
    Boolean(dropoff) &&
    !submitting &&
    // Don't let a private ride book while its fare is still being
    // calculated — the rider must see the final price first.
    !(mode !== "route_taxi" && fareCalculating);

  const addStop = () => {
    if (stops.length >= 4) return;
    setStops((s) => [...s, null]);
  };

  const updateStop = (index: number, place: Place) => {
    setStops((prev) => {
      const next = [...prev];
      next[index] = place;
      return next;
    });
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  // Swap a stop with its neighbour. Riders use this to reorder the
  // route after dropping pins — e.g. they realise stop 3 should come
  // first, or want to put the pharmacy stop ahead of the supermarket
  // one. We only allow neighbour-swapping (not jump-to-position) so
  // each tap moves the row visibly by one slot — easy to undo, easy
  // to follow, no drag-and-drop accessibility tax.
  const moveStop = (index: number, direction: "up" | "down") => {
    setStops((prev) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit || !pickup || !dropoff) return;
    // Anonymous visitor — bounce them through the login flow with a
    // `next` param so they land right back here after sign-in with
    // the same trip preview pre-loaded. Done at the top of submit so
    // we never POST to any booking endpoint without an authenticated
    // session.
    if (isAnonymous) {
      const qs = new URLSearchParams(window.location.search).toString();
      const next = qs ? `/rider/request?${qs}` : "/rider/request";
      router.push(`/auth/rider/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    // Route Taxi (Mode B) — two flavours depending on whether a
    // direct corridor exists. Both end with the rider on the live
    // surface; the difference is which endpoint creates the row +
    // whether a wallet hold is placed.
    //
    //   • Direct corridor match → /api/rider/route-taxi/hail
    //     (single-leg, legacy path, no journey)
    //   • Multi-leg journey from the pathfinder → /api/rider/route-taxi/journey
    //     (creates a route_journeys row, locks the total fare in a
    //     wallet_holds row, broadcasts leg-1)
    if (mode === "route_taxi" && !selectedMatch && journeyQuote) {
      try {
        const res = await fetch("/api/rider/route-taxi/journey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: {
              name: pickup.name,
              address: pickup.address,
              lat: pickup.lat,
              lng: pickup.lng,
              parish: pickup.parish,
            },
            dropoff: {
              name: dropoff.name,
              address: dropoff.address,
              lat: dropoff.lat,
              lng: dropoff.lng,
              parish: dropoff.parish,
            },
            plan: journeyQuote,
            concession,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          error?: string;
          journey?: { id: string };
          leg?: { id: string };
          fareJmd?: number;
          availableJmd?: number;
          requiredJmd?: number;
          balanceJmd?: number;
        };
        if (res.status === 402) {
          setInsufficientFunds({
            fareJmd: json.requiredJmd ?? journeyQuote.totalFareJmd,
            balanceJmd: json.balanceJmd ?? json.availableJmd ?? 0,
          });
          setSubmitting(false);
          return;
        }
        if (!res.ok || !json.ok || !json.leg?.id) {
          throw new Error(
            json.message ?? json.error ?? "Couldn't start journey.",
          );
        }
        router.push(`/rider/route-taxi/live?id=${json.leg.id}`);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Couldn't start journey.",
        );
        setSubmitting(false);
      }
      return;
    }

    if (mode === "route_taxi" && selectedMatch) {
      try {
        const res = await fetch("/api/rider/route-taxi/hail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: selectedMatch.route.id,
            // Full Place objects — let the server store the rider's
            // actual A→B (not the route's named endpoints) so the
            // driver map shows real pickup spots and the timeout
            // fallback can deep-link into Private Ride with the same
            // points prefilled.
            pickup: {
              name: pickup.name,
              address: pickup.address,
              lat: pickup.lat,
              lng: pickup.lng,
              parish: pickup.parish,
            },
            dropoff: {
              name: dropoff.name,
              address: dropoff.address,
              lat: dropoff.lat,
              lng: dropoff.lng,
              parish: dropoff.parish,
            },
            concession,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          error?: string;
          hail?: { id: string };
          fareJmd?: number;
          balanceJmd?: number;
        };
        if (res.status === 402) {
          // Surface the InsufficientFundsDialog instead of an inline
          // error string — far more actionable, and the modal's CTA
          // sends the rider straight into the wallet deposit flow.
          setInsufficientFunds({
            fareJmd: json.fareJmd ?? fare.fareJMD,
            balanceJmd: json.balanceJmd ?? 0,
          });
          setSubmitting(false);
          return;
        }
        if (!res.ok || !json.ok || !json.hail?.id) {
          throw new Error(json.message ?? json.error ?? "Hail failed");
        }
        // Hand off to the dedicated live hailing screen with the new
        // hail's id. The page polls /[id] and renders the right UI for
        // each status — searching → driver matched → onboard → done.
        router.push(`/rider/route-taxi/live?id=${json.hail.id}`);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Couldn't hail a route taxi.",
        );
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/rider/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: {
            name: pickup.name,
            address: pickup.address,
            lat: pickup.lat,
            lng: pickup.lng,
            parish: pickup.parish,
            placeId: pickup.placeId,
          },
          dropoff: {
            name: dropoff.name,
            address: dropoff.address,
            lat: dropoff.lat,
            lng: dropoff.lng,
            parish: dropoff.parish,
            placeId: dropoff.placeId,
          },
          stops: filledStops.map((s) => ({
            name: s.name,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            parish: s.parish,
            placeId: s.placeId,
          })),
          seats,
          notes,
          fare: {
            totalKm: fare.totalKm,
            etaMinutes: fare.etaMinutes,
            fareJMD: fare.fareJMD,
          },
        }),
      });
      if (res.status === 402) {
        // Same wallet-gate behaviour as the route-taxi path — open the
        // top-up modal instead of throwing a generic error.
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          balanceJmd?: number;
          requiredJmd?: number;
        };
        setInsufficientFunds({
          fareJmd: json.requiredJmd ?? fare.fareJMD,
          balanceJmd: json.balanceJmd ?? 0,
        });
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Server returned ${res.status}`);
      }
      // Ride is created — hand off to the live-trip view, which is the
      // single source of truth for any ride state. We don't keep the
      // ride id in component state because that doesn't survive a
      // refresh; the live-trip page reads the active ride from the API.
      router.push("/rider/live-trip");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Couldn't create ride.",
      );
      setSubmitting(false);
    }
  };

  // Map overlays for the route taxi journey: boarding / alighting
  // pins + corridor polylines + the dashed walking lines MapView
  // computes from pickup → boarding and alighting → dropoff. Only
  // populated when the rider has actively picked Route Taxi mode —
  // we don't want the corridor pins flashing on the Private Ride
  // view, which would just look like noise.
  // Declared above the bootstrapping early-return so the hook order
  // stays stable across renders (Rules of Hooks).
  const journeyMapOverlays = useMemo(() => {
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
    if (mode !== "route_taxi") return empty;

    // Direct corridor match (single-corridor hail — no multi-leg
    // journey). Synthesise a single boarding→alighting corridor line
    // straight from the rider's pickup to dropoff so the yellow+black
    // taxi sandwich draws on the map. Without this branch the static
    // red polyline would draw instead and the rider couldn't tell
    // visually that they'd switched modes.
    if (!journeyQuote && selectedMatch && pickup && dropoff) {
      const boardingCoords = { lat: pickup.lat, lng: pickup.lng };
      const alightingCoords = { lat: dropoff.lat, lng: dropoff.lng };
      return {
        boarding: { coords: boardingCoords, walkKm: 0 },
        alighting: { coords: alightingCoords, walkKm: 0 },
        corridorLines: [{ from: boardingCoords, to: alightingCoords }],
      };
    }

    if (!journeyQuote) return empty;

    // Corridor polylines, one per leg whose endpoints have coords.
    // A leg with missing coords (an endpoint not yet geocoded in the
    // DB) gets a STITCH that links the previous leg's geometry to
    // the next one — without it the map would show disconnected
    // amber segments with a visible gap, which reads as a bug to
    // riders even though it's just a data-completeness gap.
    //
    // Algorithm: walk leg-by-leg, emitting a corridor line for each
    // leg with coords. For each gap (1+ consecutive legs missing
    // coords), emit a single stitch from the last-known coords on
    // the left to the next-known coords on the right. MapView's
    // DirectionsService upgrades the straight-line stitch to a
    // road-following polyline on render, so visually the gap looks
    // like a normal stretch of road. As a final guard, if NO legs
    // had coords at all, fall back to a single boarding→alighting
    // segment — guarantees the map never shows a blank corridor.
    type Pt = { lat: number; lng: number };
    const legs = journeyQuote.legs;
    const corridorLines: Array<{ from: Pt; to: Pt }> = [];
    let lastTo: Pt | null = {
      lat: journeyQuote.boarding.coords.lat,
      lng: journeyQuote.boarding.coords.lng,
    };
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      const hasCoords =
        l.originLat != null &&
        l.originLng != null &&
        l.destinationLat != null &&
        l.destinationLng != null;
      if (hasCoords) {
        corridorLines.push({
          from: { lat: l.originLat as number, lng: l.originLng as number },
          to: {
            lat: l.destinationLat as number,
            lng: l.destinationLng as number,
          },
        });
        lastTo = {
          lat: l.destinationLat as number,
          lng: l.destinationLng as number,
        };
      } else {
        // Gap leg — find the next leg with coords; stitch lastTo to
        // that leg's origin. If no future leg has coords, stitch to
        // the journey alighting point as the final anchor.
        let nextFrom: Pt | null = null;
        for (let j = i + 1; j < legs.length; j++) {
          const nl = legs[j];
          if (nl.originLat != null && nl.originLng != null) {
            nextFrom = {
              lat: nl.originLat as number,
              lng: nl.originLng as number,
            };
            break;
          }
        }
        if (!nextFrom) {
          nextFrom = {
            lat: journeyQuote.alighting.coords.lat,
            lng: journeyQuote.alighting.coords.lng,
          };
        }
        if (lastTo) {
          corridorLines.push({ from: lastTo, to: nextFrom });
        }
        lastTo = nextFrom;
      }
    }
    // Final guard: zero corridor lines emitted means no leg had
    // coords AND the loop above never produced a stitch. Render
    // a single boarding→alighting segment as the last-resort path.
    if (
      corridorLines.length === 0 &&
      journeyQuote.boarding &&
      journeyQuote.alighting
    ) {
      corridorLines.push({
        from: { ...journeyQuote.boarding.coords },
        to: { ...journeyQuote.alighting.coords },
      });
    }

    const result = {
      boarding: {
        coords: journeyQuote.boarding.coords,
        walkKm: journeyQuote.boarding.walkKm,
      },
      alighting: {
        coords: journeyQuote.alighting.coords,
        walkKm: journeyQuote.alighting.walkKm,
      },
      corridorLines: corridorLines.length > 0 ? corridorLines : null,
    };
    // Diagnostic — visible in the browser console when route taxi
    // mode is active. Tells us in one glance whether the pathfinder
    // returned legs with usable coords, how many corridor lines the
    // map will try to render, and which boarding/alighting points
    // anchor them.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log("[route-taxi-overlays]", {
        mode,
        legCount: journeyQuote.legs.length,
        legsWithCoords: journeyQuote.legs.filter(
          (l) =>
            l.originLat != null &&
            l.originLng != null &&
            l.destinationLat != null &&
            l.destinationLng != null,
        ).length,
        corridorLines: result.corridorLines?.length ?? 0,
        boarding: result.boarding.coords,
        alighting: result.alighting.coords,
        firstLeg: journeyQuote.legs[0],
      });
    }
    return result;
    // `selectedMatch`, `pickup`, `dropoff` participate via the direct-
    // corridor synthesis branch above. journeyQuote covers the
    // multi-leg path. Mode gates everything.
  }, [mode, journeyQuote, selectedMatch, pickup, dropoff]);

  if (bootstrapping) {
    // Hide the form while the active-ride check is in flight. Without
    // this the form briefly flashes before the redirect kicks in.
    // Skeleton mirrors the booking form's basic shape (header strip,
    // map block, two waypoint slots) so there's no layout jump when
    // the real form mounts.
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" rounded="full" />
          <Skeleton className="h-4 w-32" rounded="md" />
        </div>
        <Skeleton className="h-56 w-full" rounded="3xl" />
        <Skeleton className="h-14 w-full" rounded="2xl" />
        <Skeleton className="h-14 w-full" rounded="2xl" />
      </div>
    );
  }

  /* ───── shared JSX consts read state from this closure, so no prop
     drilling between the two layouts ───── */

  const breadcrumb = (
    <FadeUp delay={0.05}>
      <div className="pointer-events-none absolute left-4 top-4 right-4 flex items-center gap-2">
        <span className="rounded-full bg-rajlo-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-rajlo-red/30">
          Booking
        </span>
        <span className="rounded-full text-black px-3 py-1.5 text-[11px] font-bold shadow-md backdrop-blur">
          {allPoints.length === 0
            ? "Where are we going?"
            : allPoints.length < 2
            ? "Add a destination"
            : `${stops.length + 2} stops planned`}
        </span>
      </div>
    </FadeUp>
  );

  const formSections = (
    <>
      {submitError && (
        <div className="mb-4 rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {submitError}
        </div>
      )}

      {/* Back link for step 2 and 3 — clicking returns to the
         previous step. Steps 2/3 hide the waypoint inputs so the
         "Back" gesture is the only way to edit locations again. */}
      {step !== "locations" && (
        <FadeUp>
          <button
            type="button"
            onClick={() => {
              if (step === "summary") setStep("choose-ride");
              else if (step === "choose-ride") setStep("locations");
            }}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-rajlo-red"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
            Back
          </button>
        </FadeUp>
      )}

      {/* Page-title chrome (eyebrow + h1 + descriptive paragraph) is
         desktop-only — on the mobile bottom-sheet it ate most of the
         visible card, pushing the actual form below the fold. The
         status badge floating on the map already communicates "you're
         in the booking flow" on mobile. */}
      <FadeUp delay={0.04} className="hidden md:block">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            {step === "locations"
              ? "Where to?"
              : step === "choose-ride"
                ? "Pick your ride"
                : "Trip summary"}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          {step === "locations"
            ? "Plan your trip"
            : step === "choose-ride"
              ? "Choose your ride"
              : "Confirm and request"}
        </h1>
        {step === "locations" && (
          <p className="mt-2 max-w-md text-sm text-muted">
            Add up to 4 stops along the way — pick up groceries, grab a BBQ,
            swing by a friend. We&apos;ll route through every one.
          </p>
        )}
        {step === "choose-ride" && (
          <p className="mt-2 max-w-md text-sm text-muted">
            Private ride door-to-door, or route taxi at TA-regulated rates.
          </p>
        )}
      </FadeUp>

      {/* Locations summary — shows the pickup and dropoff as
         read-only text on steps 2 and 3, replacing the editable
         waypoint inputs from step 1. Tap "Back" to edit. */}
      {step !== "locations" && pickup && dropoff && (
        <FadeUp delay={0.06}>
          <div className="mt-4 space-y-2.5 rounded-2xl border border-line bg-surface-soft p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-[10px] font-extrabold text-white">
                A
              </span>
              <p className="min-w-0 truncate text-sm font-semibold">
                {pickup.name}
              </p>
            </div>
            {stops
              .filter((s): s is Place => !!s)
              .map((s, i) => (
                <div key={`sum-stop-${i}`} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rajlo-black text-[10px] font-extrabold text-white">
                    {String.fromCharCode(66 + i)}
                  </span>
                  <p className="min-w-0 truncate text-sm font-semibold">
                    {s.name}
                  </p>
                </div>
              ))}
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rajlo-red text-[10px] font-extrabold text-white">
                {String.fromCharCode(66 + stops.filter(Boolean).length)}
              </span>
              <p className="min-w-0 truncate text-sm font-semibold">
                {dropoff.name}
              </p>
            </div>
          </div>
        </FadeUp>
      )}

      {/* ═════════════════ STEP 1 · LOCATIONS ═════════════════
         Pickup, optional stops, dropoff. The only step where the
         rider can edit endpoints. Step 1's CTA is "Next" — shown
         in the action bar at the bottom of the page. */}
      {step === "locations" && (<>

      {/* Saved-place chips. Tap one to fill pickup if empty, otherwise
         dropoff — the most common "go from where I am to a saved
         place" flow becomes a single tap. */}
      <FadeUp delay={0.07}>
        <div className="mt-4">
          <SavedPlaceChips
            onPick={(place) => {
              if (!pickup) {
                setPickup(place);
              } else {
                setDropoff(place);
              }
            }}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <div className="mt-6 space-y-3">
          <WaypointSlot
            kind="pickup"
            label="A"
            place={pickup}
            onSelect={(p) => {
              setPickup(p);
              if (!dropoff) {
                // Auto-focus the dropoff input — saves a tap on the
                // typical "Pickup → Where to?" flow. queueMicrotask
                // lets React commit pickup-selected state first.
                queueMicrotask(() => {
                  document.getElementById("waypoint-dropoff")?.focus();
                });
              } else {
                // Dropoff was already set — both endpoints exist, so
                // collapse the sheet to show the now-complete route.
                collapseSheetForRouteView();
              }
            }}
            onClear={() => setPickup(null)}
          />

          {stops.map((stop, i) => (
            <WaypointSlot
              key={`stop-${i}`}
              kind="stop"
              label={String.fromCharCode(66 + i)}
              place={stop}
              onSelect={(p) => updateStop(i, p)}
              onRemove={() => removeStop(i)}
              onMoveUp={i > 0 ? () => moveStop(i, "up") : undefined}
              onMoveDown={
                i < stops.length - 1 ? () => moveStop(i, "down") : undefined
              }
            />
          ))}

          {stops.length < 4 && (
            <button
              type="button"
              onClick={addStop}
              className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-line bg-surface-soft px-4 py-3 text-sm font-semibold text-muted transition-all hover:border-rajlo-red hover:bg-primary-soft/50 hover:text-rajlo-red"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-muted group-hover:bg-rajlo-red group-hover:text-white">
                <Icon name="plus-circle" className="h-4 w-4" />
              </span>
              Add a stop along the way
            </button>
          )}

          <WaypointSlot
            kind="dropoff"
            label={String.fromCharCode(66 + stops.length)}
            place={dropoff}
            onSelect={(p) => {
              setDropoff(p);
              if (pickup) {
                // Both endpoints set — collapse the sheet so the
                // rider sees the full route on the map.
                collapseSheetForRouteView();
              }
            }}
            onClear={() => setDropoff(null)}
            inputId="waypoint-dropoff"
          />
        </div>
      </FadeUp>

      {/* "Set on map" entry — opens the fullscreen MapPinPicker
         pointed at whichever endpoint is empty (or pickup if both
         are empty). Lets the rider drop a pin manually when they
         don't know the address — esp. useful in rural Jamaica where
         autocomplete coverage is patchy. */}
      <FadeUp delay={0.12}>
        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              setPinPickerTarget(!pickup ? "pickup" : "dropoff");
            }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-muted transition-colors hover:border-rajlo-red/40 hover:text-rajlo-red"
          >
            <Icon name="map-pin" className="h-3.5 w-3.5" />
            {!pickup ? "Set pickup on map" : "Set drop-off on map"}
          </button>
        </div>
      </FadeUp>

      </>)}
      {/* ═════════════════ END STEP 1 ═════════════════ */}

      {/* ═════════════════ STEP 2 · CHOOSE RIDE ═════════════════ */}
      {step === "choose-ride" && (<>

      {/* Ride mode picker. Only renders once we have both endpoints —
         before that, the matcher has nothing to look at. The card
         layout collapses gracefully:
           • Multi-stop trip → only Private Ride card (route taxi
             can't serve multi-leg trips)
           • No matching corridor → only Private Ride card
           • Matches found → both cards, rider picks
      */}
      {pickup && dropoff && (
        <FadeUp delay={0.13}>
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Choose your ride
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Private Ride — always available */}
              <button
                type="button"
                onClick={() => setMode("private")}
                aria-pressed={mode === "private"}
                className={`group relative flex flex-col items-stretch gap-2 overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                  mode === "private"
                    ? "border-rajlo-red bg-primary-soft shadow-md shadow-rajlo-red/15"
                    : "border-line bg-surface hover:border-rajlo-red/40 hover:bg-primary-soft/40"
                }`}
              >
                {/* Vehicle illustration — inline SVG side-on sedan in
                   Rajlo brand red, positioned bottom-right of the card.
                   Pure SVG (no asset upload) so it's crisp at any size
                   and recolours via fill/stroke. */}
                <svg
                  aria-hidden
                  viewBox="0 0 120 60"
                  className="pointer-events-none absolute -bottom-2 -right-3 h-16 w-28 opacity-90"
                >
                  <path
                    d="M10 42 L20 28 Q24 22 32 22 L78 22 Q86 22 92 28 L106 42 Z"
                    fill="#f10100"
                  />
                  <path
                    d="M32 22 L40 14 L72 14 L82 22 Z"
                    fill="#6a0000"
                  />
                  <line x1="56" y1="14" x2="56" y2="22" stroke="#f10100" strokeWidth="1.5" />
                  <rect x="14" y="38" width="92" height="6" rx="3" fill="#111906" />
                  <circle cx="28" cy="46" r="6" fill="#111906" />
                  <circle cx="28" cy="46" r="2.5" fill="#ffffff" />
                  <circle cx="92" cy="46" r="6" fill="#111906" />
                  <circle cx="92" cy="46" r="2.5" fill="#ffffff" />
                </svg>
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      mode === "private"
                        ? "bg-rajlo-red text-white"
                        : "bg-primary-soft text-rajlo-red"
                    }`}
                  >
                    <Icon name="car" className="h-4 w-4" />
                  </span>
                  <span className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                    Private Ride
                  </span>
                </div>
                <p className="text-base font-extrabold tracking-tight">
                  {fareCalculating ? (
                    <span className="text-muted">Calculating fare…</span>
                  ) : fare.fareJMD > 0 ? (
                    formatJMD(fare.fareJMD)
                  ) : (
                    "Tap to choose"
                  )}
                </p>
                <p className="relative z-[1] max-w-[60%] text-[11px] leading-relaxed text-muted">
                  {fareCalculating
                    ? "Working out the exact road distance…"
                    : `Door to door, ~${formatEta(fare.etaMinutes)} ETA. Multi-stop ready.`}
                </p>
              </button>

              {/* Route Taxi — only when matches exist AND single-leg */}
              {filledStops.length === 0 && matching && (
                <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-line bg-surface-soft p-4">
                  <Skeleton className="h-9 w-9" rounded="xl" />
                  <Skeleton className="h-4 w-24" rounded="md" />
                  <Skeleton className="h-3 w-full" rounded="md" />
                </div>
              )}
              {filledStops.length === 0 &&
                !matching &&
                matches &&
                matches.length > 0 &&
                displayMatch && (
                  <button
                    type="button"
                    onClick={() => setMode("route_taxi")}
                    aria-pressed={mode === "route_taxi"}
                    className={`group relative flex flex-col items-stretch gap-2 rounded-2xl border p-4 text-left transition-all ${
                      mode === "route_taxi"
                        ? "border-rajlo-red bg-primary-soft shadow-md shadow-rajlo-red/15"
                        : "border-line bg-surface hover:border-rajlo-red/40 hover:bg-primary-soft/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                          mode === "route_taxi"
                            ? "bg-rajlo-red text-white"
                            : "bg-primary-soft text-rajlo-red"
                        }`}
                      >
                        <Icon name="navigation" className="h-4 w-4" />
                      </span>
                      <span className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                        Route Taxi
                      </span>
                    </div>
                    <p className="text-base font-extrabold tracking-tight">
                      {formatJMD(displayMatch.fareJmd)}
                    </p>
                    {/* Show the rider's actual trip endpoints first
                       so they don't read the corridor's named
                       endpoints below and think the route is wrong.
                       Falls back to the corridor names if pickup/
                       dropoff somehow aren't loaded. */}
                    <p className="text-[11px] leading-relaxed text-muted">
                      <span className="font-semibold text-foreground">
                        {pickup && dropoff
                          ? `${pickup.name} → ${dropoff.name}`
                          : displayMatch.direction === "reverse"
                            ? `${displayMatch.route.destination} → ${displayMatch.route.origin}`
                            : `${displayMatch.route.origin} → ${displayMatch.route.destination}`}
                      </span>
                      <br />
                      Via{" "}
                      <span className="font-medium">
                        {displayMatch.route.origin} ↔{" "}
                        {displayMatch.route.destination}
                      </span>{" "}
                      · {displayMatch.route.distanceKm.toFixed(1)} km ·
                      TA-regulated
                    </p>
                  </button>
                )}

              {/* Route Taxi — multi-leg fallback. Surfaces when no
                  direct corridor matches but the pathfinder found a
                  chain (e.g. 7-Mile → Negril Bus Park → Sav-la-Mar). */}
              {filledStops.length === 0 && journeyQuoting && (
                <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-line bg-surface-soft p-4">
                  <Skeleton className="h-9 w-9" rounded="xl" />
                  <Skeleton className="h-4 w-32" rounded="md" />
                  <Skeleton className="h-3 w-full" rounded="md" />
                </div>
              )}
              {filledStops.length === 0 &&
                !matching &&
                !journeyQuoting &&
                (!matches || matches.length === 0) &&
                journeyQuote &&
                journeyQuote.hailable && (
                  <div
                    className={`group relative flex flex-col items-stretch gap-2 overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                      mode === "route_taxi"
                        ? "border-rajlo-red bg-primary-soft shadow-md shadow-rajlo-red/15"
                        : "border-line bg-surface hover:border-rajlo-red/40 hover:bg-primary-soft/40"
                    }`}
                  >
                    {/* Vehicle illustration — route taxi minivan. Taller +
                       more boxy than the private-ride sedan, with a
                       sliding-door panel line on the side so the rider
                       reads it as a route taxi at a glance. */}
                    <svg
                      aria-hidden
                      viewBox="0 0 120 60"
                      className="pointer-events-none absolute -bottom-2 -right-3 h-16 w-28 opacity-90"
                    >
                      <path
                        d="M8 44 L10 18 Q10 12 16 12 L96 12 Q104 12 110 22 L114 44 Z"
                        fill="#f10100"
                      />
                      <rect x="20" y="16" width="22" height="14" rx="2" fill="#6a0000" />
                      <rect x="46" y="16" width="22" height="14" rx="2" fill="#6a0000" />
                      <rect x="72" y="16" width="22" height="14" rx="2" fill="#6a0000" />
                      <line x1="44" y1="16" x2="44" y2="30" stroke="#f10100" strokeWidth="1" />
                      <line x1="70" y1="16" x2="70" y2="30" stroke="#f10100" strokeWidth="1" />
                      <rect x="12" y="40" width="98" height="6" rx="3" fill="#111906" />
                      <circle cx="28" cy="48" r="6" fill="#111906" />
                      <circle cx="28" cy="48" r="2.5" fill="#ffffff" />
                      <circle cx="94" cy="48" r="6" fill="#111906" />
                      <circle cx="94" cy="48" r="2.5" fill="#ffffff" />
                    </svg>
                    <button
                      type="button"
                      onClick={() => setMode("route_taxi")}
                      aria-pressed={mode === "route_taxi"}
                      className="text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                            mode === "route_taxi"
                              ? "bg-rajlo-red text-white"
                              : "bg-primary-soft text-rajlo-red"
                          }`}
                        >
                          <Icon name="navigation" className="h-4 w-4" />
                        </span>
                        <span className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                          Route Taxi
                          {journeyQuote.legCount > 1
                            ? ` · ${journeyQuote.legCount} legs`
                            : ""}
                        </span>
                      </div>
                      <p className="mt-2 text-base font-extrabold tracking-tight">
                        {formatJMD(journeyQuote.totalFareJmd)}
                      </p>
                      {/* Rider's own pickup → dropoff sits ABOVE the
                         taxi-corridor breakdown so they see THEIR
                         trip first, not the corridor names. Without
                         this line riders read the corridor names in
                         the legs-expanded view as "the route is
                         wrong" — when in fact the corridor is just
                         the named TA route-taxi line they hail. */}
                      {pickup && dropoff && (
                        <p className="relative z-[1] mt-1 truncate text-[11px] font-semibold leading-snug text-foreground">
                          {pickup.name} → {dropoff.name}
                        </p>
                      )}
                      <p className="relative z-[1] max-w-[60%] text-[11px] leading-relaxed text-muted">
                        {journeyQuote.totalDistanceKm.toFixed(1)} km
                        {journeyQuote.legCount > 1
                          ? ` · ${journeyQuote.legCount} taxis`
                          : ""}
                      </p>
                    </button>
                    {/* Detailed corridor breakdown — collapsible dropdown.
                       Each leg gets a numbered row showing origin →
                       destination, per-leg fare, distance. Replaces the
                       cramped arrow chain that used to live above. */}
                    <div className="relative z-[1] mt-3 rounded-xl border border-line/60 bg-white/70">
                      <button
                        type="button"
                        onClick={() => setLegsExpanded((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-foreground"
                      >
                        <span>
                          {journeyQuote.legCount === 1
                            ? "Corridor details"
                            : `${journeyQuote.legCount} legs · transfer details`}
                        </span>
                        <Icon
                          name={legsExpanded ? "chevron-up" : "chevron-down"}
                          className="h-3.5 w-3.5"
                        />
                      </button>
                      {legsExpanded && (
                        <ul className="space-y-1.5 border-t border-line/60 px-3 py-2.5">
                          {journeyQuote.legs.map((l, i) => {
                            // Leg rows describe what the rider does
                            // (board where, get off where) using their
                            // real boarding/alighting locations for
                            // the first and last legs. The corridor's
                            // named endpoints — "Arnett Gardens →
                            // Cross Roads" etc. — are the NAME of the
                            // TA-licensed route-taxi line the rider
                            // hails, not where they're going, so we
                            // demote it to a smaller "via" line.
                            const isFirst = i === 0;
                            const isLast = i === journeyQuote.legs.length - 1;
                            const boardAt = isFirst
                              ? pickup?.name ?? l.origin
                              : l.origin;
                            const alightAt = isLast
                              ? dropoff?.name ?? l.destination
                              : l.destination;
                            return (
                              <li
                                key={`legs-${i}`}
                                className="flex items-start gap-2 text-[11px] leading-tight"
                              >
                                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-rajlo-black text-[9px] font-extrabold text-white">
                                  {i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold">
                                    {isFirst ? "Board near " : "Transfer at "}
                                    {boardAt}
                                    {" · "}
                                    {isLast ? "alight at " : "transfer at "}
                                    {alightAt}
                                  </p>
                                  <p className="truncate text-[10px] text-muted">
                                    Take the{" "}
                                    <span className="font-semibold">
                                      {l.origin} ↔ {l.destination}
                                    </span>{" "}
                                    taxi · {formatJMD(l.fareJmd)} ·{" "}
                                    {l.distanceKm.toFixed(1)} km
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                          <li className="mt-1 flex items-center justify-between border-t border-line/60 pt-1.5 text-[11px] font-bold">
                            <span>Total</span>
                            <span className="text-rajlo-red">
                              {formatJMD(journeyQuote.totalFareJmd)}
                            </span>
                          </li>
                        </ul>
                      )}
                    </div>
                    {/* Tiered walk-distance pill. Hard gate at 2 km is
                        enforced upstream (MAX_HAILABLE_WALK_KM). Inside
                        that, the language graduates with distance so
                        the rider's friction is visible BEFORE they
                        book — rather than them silently discovering
                        a 1.8 km walk after committing the fare. */}
                    {(() => {
                      const pWalk = journeyQuote.boarding.walkKm;
                      const dWalk = journeyQuote.alighting.walkKm;
                      const maxWalk = Math.max(pWalk, dWalk);
                      const fmtWalk = (km: number) =>
                        km < 1
                          ? `${Math.round(km * 1000)} m`
                          : `${km.toFixed(1)} km`;
                      // Tier 1 — on the road (≤ 300 m max walk).
                      if (maxWalk <= 0.3) {
                        return (
                          <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-emerald-900 ring-1 ring-emerald-200">
                            <Icon
                              name="check-circle"
                              className="mr-1 inline h-2.5 w-2.5"
                            />
                            You&apos;re on the{" "}
                            <span className="font-extrabold">
                              {journeyQuote.boarding.corridorLabel}
                            </span>{" "}
                            road. Hail right here — driver will pass you.
                          </p>
                        );
                      }
                      // Tier 2 — short walk (300 m – 1 km max).
                      if (maxWalk <= 1.0) {
                        return (
                          <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-amber-900 ring-1 ring-amber-200">
                            <Icon
                              name="navigation"
                              className="mr-1 inline h-2.5 w-2.5"
                            />
                            Short walk to the{" "}
                            <span className="font-extrabold">
                              {journeyQuote.boarding.corridorLabel}
                            </span>{" "}
                            road.
                            {pWalk >= 0.15 &&
                              ` Pickup ${fmtWalk(pWalk)} away.`}
                            {dWalk >= 0.15 &&
                              ` Alight ${fmtWalk(dWalk)} from your dropoff.`}
                          </p>
                        );
                      }
                      // Tier 3 — longer walk (1 km – 2 km max).
                      return (
                        <p className="mt-1 rounded-lg bg-orange-50 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-orange-900 ring-1 ring-orange-200">
                          <Icon
                            name="alert-triangle"
                            className="mr-1 inline h-2.5 w-2.5"
                          />
                          Longer walk to the{" "}
                          <span className="font-extrabold">
                            {journeyQuote.boarding.corridorLabel}
                          </span>{" "}
                          road — bring water.
                          {pWalk >= 0.15 &&
                            ` Pickup ${fmtWalk(pWalk)} away`}
                          {pWalk >= 0.15 && dWalk >= 0.15 && ", "}
                          {dWalk >= 0.15 &&
                            ` alight ${fmtWalk(dWalk)} from your dropoff`}
                          {(pWalk >= 0.15 || dWalk >= 0.15) && "."}
                        </p>
                      );
                    })()}
                  </div>
                )}

              {/* Off-corridor info card. The pathfinder found a route
                  taxi chain, but the rider's pickup or dropoff sits
                  too far from any corridor to actually hail one (real
                  walking distance, not the 9-km nonsense the older
                  build let through). This card is read-only — the
                  rider cannot select Route Taxi from here. */}
              {filledStops.length === 0 &&
                !matching &&
                !journeyQuoting &&
                (!matches || matches.length === 0) &&
                journeyQuote &&
                !journeyQuote.hailable && (
                  <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-left">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-900">
                        <Icon name="alert-triangle" className="h-4 w-4" />
                      </span>
                      <span className="font-secondary text-[10px] font-bold uppercase tracking-wider text-amber-900">
                        Route taxi · too far to hail
                      </span>
                    </div>
                    {(() => {
                      const pWalk = journeyQuote.boarding.walkKm;
                      const dWalk = journeyQuote.alighting.walkKm;
                      const fmtWalk = (km: number) =>
                        km < 1
                          ? `${Math.round(km * 1000)} m`
                          : `${km.toFixed(1)} km`;
                      const pickupFar = pWalk > 1.0;
                      const dropoffFar = dWalk > 1.0;
                      return (
                        <>
                          <p className="text-[12px] font-semibold leading-snug text-amber-900">
                            {pickupFar && (
                              <>
                                Nearest pickup is{" "}
                                <span className="font-extrabold">
                                  {fmtWalk(pWalk)} away
                                </span>{" "}
                                on the{" "}
                                <span className="font-extrabold">
                                  {journeyQuote.boarding.corridorLabel}
                                </span>{" "}
                                road
                              </>
                            )}
                            {pickupFar && dropoffFar && (
                              <span className="text-amber-900/80">; and</span>
                            )}
                            {dropoffFar && (
                              <>
                                {!pickupFar && "Your dropoff is "}
                                {pickupFar && " your dropoff is "}
                                <span className="font-extrabold">
                                  {fmtWalk(dWalk)}
                                </span>{" "}
                                from the{" "}
                                <span className="font-extrabold">
                                  {journeyQuote.alighting.corridorLabel}
                                </span>{" "}
                                road
                              </>
                            )}
                            .
                          </p>
                          <p className="text-[11px] leading-relaxed text-amber-900/80">
                            Route taxis only stop on the corridor. Take a
                            private ride to the road first to hail, or just
                            book a private ride for the whole trip.
                          </p>
                        </>
                      );
                    })()}
                  </div>
                )}
            </div>

            {/* Hint when neither a direct corridor nor a multi-leg
                path can serve this trip — Private is the only option.
                Different copy for "matcher returned nothing AND
                pathfinder snap failed" so the rider knows it isn't a
                bug, it's geography. */}
            {filledStops.length === 0 &&
              !matching &&
              !journeyQuoting &&
              matches &&
              matches.length === 0 &&
              !journeyQuote && (
                <p className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-[11px] text-muted">
                  No TA route taxi corridor reaches that pickup or dropoff
                  within walking distance — Private Ride is your option.
                </p>
              )}

            {/* Hint when multi-stop blocks Mode B */}
            {filledStops.length > 0 && (
              <p className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-[11px] text-muted">
                Route taxis don&apos;t support multi-stop trips — drop the extra
                stops to see if a corridor matches.
              </p>
            )}
          </div>
        </FadeUp>
      )}

      </>)}
      {/* ═════════════════ END STEP 2 ═════════════════ */}

      {/* ═════════════════ STEP 3 · SUMMARY ═════════════════ */}
      {step === "summary" && (<>

      <FadeUp delay={0.15}>
        <div className={`mt-6 ${mode === "route_taxi" ? "hidden" : ""}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Seats needed</p>
            <p className="text-xs text-muted">
              {seats} passenger{seats === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => {
              const active = seats === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSeats(n)}
                  className={`group relative overflow-hidden rounded-xl border py-3 text-sm font-bold transition-all ${
                    active
                      ? "border-rajlo-red bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "border-line bg-surface text-foreground hover:border-rajlo-red/30 hover:bg-primary-soft/30"
                  }`}
                >
                  <Icon
                    name={n === 1 ? "user" : "users"}
                    className={`mx-auto mb-0.5 h-4 w-4 ${
                      active
                        ? "text-white"
                        : "text-muted group-hover:text-rajlo-red"
                    }`}
                  />
                  <span>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </FadeUp>

      <FadeUp delay={0.2}>
        <div className={`mt-6 ${mode === "route_taxi" ? "hidden" : ""}`}>
          <label className="block">
            <span className="text-sm font-semibold">
              Notes for the driver{" "}
              <span className="ml-1 text-xs font-medium text-muted">
                optional
              </span>
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Wait 5 mins at the BBQ stop · I'll have luggage · etc."
              className="mt-2 w-full rounded-xl border border-line bg-surface-soft px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
            />
          </label>
        </div>
      </FadeUp>

      {!fareCalculating && fare.fareJMD > 0 && mode !== "route_taxi" && (
        <FadeUp delay={0.25}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-soft">
            <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
              <div>
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                  Estimated fare
                </p>
                <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-rajlo-red">
                  {formatJMD(fare.fareJMD)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  ETA
                </p>
                <p className="mt-0.5 text-base font-extrabold">
                  ~{formatEta(fare.etaMinutes)}
                </p>
              </div>
            </div>
            <ul className="space-y-1.5 px-5 py-4">
              {fare.breakdown.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted">{row.label}</span>
                  <span className="font-semibold text-foreground">
                    {formatJMD(row.amountJMD)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line/60 bg-white px-5 py-2.5 text-[11px] leading-relaxed text-muted">
              Final fare confirmed when your driver accepts. Auto-debited from
              your Rajlo wallet — keep it topped up.
            </p>
          </div>
        </FadeUp>
      )}

      {/* Route taxi fare breakdown — leg-by-leg fares + total. Shown
         on step 3 when the rider picked Route Taxi. Replaces the
         private-ride breakdown above (which is mode-gated to
         private). For 1-leg trips this is a single-line breakdown
         that's still useful for the "where's my money going" view. */}
      {mode === "route_taxi" && journeyQuote && (
        <FadeUp delay={0.25}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-soft">
            <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
              <div>
                <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
                  Route taxi fare · {journeyQuote.legCount} leg
                  {journeyQuote.legCount === 1 ? "" : "s"}
                </p>
                <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-rajlo-red">
                  {formatJMD(journeyQuote.totalFareJmd)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Distance
                </p>
                <p className="mt-0.5 text-base font-extrabold">
                  {journeyQuote.totalDistanceKm.toFixed(1)} km
                </p>
              </div>
            </div>
            <ul className="space-y-1.5 px-5 py-4">
              {journeyQuote.legs.map((l, i) => (
                <li
                  key={`fare-leg-${i}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rajlo-black text-[10px] font-extrabold text-white">
                      {i + 1}
                    </span>
                    <span className="truncate text-muted">
                      {l.origin} → {l.destination}
                    </span>
                  </div>
                  <span className="shrink-0 font-semibold text-foreground">
                    {formatJMD(l.fareJmd)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line/60 bg-white px-5 py-2.5 text-[11px] leading-relaxed text-muted">
              Total locked at booking — each leg debits separately when the
              driver scans your QR. {journeyQuote.legCount > 1
                ? "Scan to transfer at each numbered stop."
                : ""}
            </p>
          </div>
        </FadeUp>
      )}

      {/* ─── Concession (half-fare) toggle ─────────────────────────
         Self-declared per the TA tariff. Only relevant when the
         rider is booking a route-taxi trip (Private rides aren't
         tariff-covered). Drivers do the eligibility check visually
         at pickup — uniform for students, ID for seniors, etc. */}
      {mode === "route_taxi" && (selectedMatch || journeyQuote) && (
        <FadeUp delay={0.28}>
          <button
            type="button"
            onClick={() => setConcession((c) => !c)}
            aria-pressed={concession}
            className={`mt-3 flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
              concession
                ? "border-emerald-500/40 bg-emerald-50 shadow-sm"
                : "border-line bg-surface hover:border-emerald-500/30"
            }`}
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                concession
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <Icon name="users" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold tracking-tight text-foreground">
                I qualify for half-fare
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                Students in uniform, children, seniors, and physically
                disabled riders pay half the TA fare. Your driver may verify
                eligibility at pickup.
              </span>
            </span>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                concession ? "bg-emerald-600" : "bg-line"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-all ${
                  concession ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </FadeUp>
      )}

      </>)}
      {/* ═════════════════ END STEP 3 ═════════════════ */}
    </>
  );

  // Action-bar amount + label adapts to the selected mode. Route Taxi
  // shows the regulated TA fare (the one the rider committed to in
  // the picker); Private Ride shows the live estimate from the
  // existing fare engine.
  // Route-taxi base fares before concession adjustment. When the rider
  // self-declares concession we halve the displayed value (matches
  // the server-side rounding rule: Math.round(baseFare / 2)). Private
  // rides aren't tariff-covered, so concession doesn't apply.
  const routeTaxiBaseFareJmd =
    mode === "route_taxi" && selectedMatch
      ? selectedMatch.fareJmd
      : mode === "route_taxi" && journeyQuote
        ? journeyQuote.totalFareJmd
        : null;
  const barFareJmd =
    routeTaxiBaseFareJmd !== null
      ? concession
        ? Math.round(routeTaxiBaseFareJmd / 2)
        : routeTaxiBaseFareJmd
      : fare.fareJMD;
  const concessionSuffix = concession ? " · half-fare" : "";
  const barLabel =
    mode === "route_taxi" && selectedMatch
      ? `Route taxi fare${concessionSuffix}`
      : mode === "route_taxi" && journeyQuote
        ? `Route taxi · ${journeyQuote.legCount} legs${concessionSuffix}`
        : fareCalculating
          ? "Calculating fare…"
          : fare.fareJMD > 0
            ? "Trip total"
            : "Estimate appears here";
  const ctaLabel =
    mode === "route_taxi" && selectedMatch
      ? "Hail next car"
      : mode === "route_taxi" && journeyQuote
        ? "Start journey"
        : "Request ride";

  // Step-aware bar copy + CTA:
  //   step 1 "locations"   → "Next" → goes to "choose-ride"
  //                          (disabled until pickup+dropoff set)
  //   step 2 "choose-ride" → "Next" → goes to "summary"
  //                          (disabled until a ride mode is selectable)
  //   step 3 "summary"     → "Request ride" / "Start journey" → submits
  const stepBarLabel = (() => {
    if (step === "locations") return "Where are you going?";
    if (step === "choose-ride")
      return mode === "route_taxi"
        ? journeyQuote
          ? `Route taxi · ${journeyQuote.legCount} leg${journeyQuote.legCount === 1 ? "" : "s"}`
          : selectedMatch
            ? "Route taxi"
            : "Pick your ride"
        : "Private ride";
    return barLabel; // summary uses the original fare/mode-aware label
  })();
  const stepBarPrice = (() => {
    if (step === "locations") return "—";
    if (step === "choose-ride") {
      if (mode === "route_taxi") {
        if (selectedMatch) return formatJMD(selectedMatch.fareJmd);
        if (journeyQuote) return formatJMD(journeyQuote.totalFareJmd);
      }
      if (mode === "private" && !fareCalculating && fare.fareJMD > 0)
        return formatJMD(fare.fareJMD);
      if (mode === "private" && fareCalculating) return "…";
      return "—";
    }
    // summary
    return mode !== "route_taxi" && fareCalculating
      ? "…"
      : barFareJmd > 0
        ? formatJMD(barFareJmd)
        : "—";
  })();
  const stepCtaLabel = (() => {
    if (step === "summary") return ctaLabel;
    return "Next";
  })();
  const stepCtaDisabled = (() => {
    if (step === "locations") return !pickup || !dropoff;
    if (step === "choose-ride") {
      // Need a real fare for whichever mode is selected.
      if (mode === "private") return fareCalculating || fare.fareJMD <= 0;
      if (mode === "route_taxi")
        return !(
          selectedMatch || (journeyQuote && journeyQuote.hailable)
        );
      return true;
    }
    return !canSubmit;
  })();
  const stepCtaClick = () => {
    if (step === "locations") {
      setStep("choose-ride");
      return;
    }
    if (step === "choose-ride") {
      setStep("summary");
      return;
    }
    void handleSubmit();
  };

  const barContent = (
    <>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {stepBarLabel}
        </p>
        <p className="text-lg font-extrabold tracking-tight">{stepBarPrice}</p>
      </div>
      <button
        type="button"
        onClick={stepCtaClick}
        disabled={stepCtaDisabled || submitting}
        className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-xl hover:shadow-rajlo-red/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:-translate-y-0 disabled:hover:bg-rajlo-red"
      >
        {submitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
            {mode === "route_taxi" ? "Hailing…" : "Requesting…"}
          </>
        ) : (
          <>
            {stepCtaLabel}
            <Icon
              name="arrow-right"
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            />
          </>
        )}
      </button>
    </>
  );

  return (
    <>
      {/* ═════════════ MOBILE LAYOUT ═════════════
         Uber-style bottom sheet: map fills the viewport stage, the
         booking card slides up from the bottom with its own scroll
         + sticky action bar. The map keeps the brand-red BOOKING
         pill anchored to the top-left so context is never hidden.
         Renders only when viewport is mobile so the desktop tree
         doesn't also mount in parallel — that avoided the duplicate
         MapView / form / PlacesAutocomplete instances that the
         CSS-only switch was leaving behind. */}
      {!(viewportReady && !isMobile) && (
      <div>
        <RiderBottomSheet
          enabled={viewportReady && isMobile}
          collapseSignal={collapseSheetSignal}
          map={
            <MapView
              pickup={pickup}
              stops={filledStops}
              dropoff={dropoff}
              nearbyDrivers={fleetDrivers}
              pickupEtaMinutes={pickupEtaMinutes}
              dropoffEtaMinutes={dropoff ? fare.etaMinutes : null}
              boarding={journeyMapOverlays.boarding}
              alighting={journeyMapOverlays.alighting}
              corridorLines={journeyMapOverlays.corridorLines}
              floatingControlsBottomPx={floatingControlsOffset}
              // No fitBounds inset — the RiderBottomSheet's map
              // container is positioned with a `top: -snaps.collapsed`
              // offset so the map's geometric center already coincides
              // with the visible map area's center. Adding bottom
              // padding here would double-compensate and push the
              // route's fitBounds center off the visible area entirely.
              mapBottomInsetPx={0}
              suppressStaticRoute={
                mode === "route_taxi" &&
                !!journeyMapOverlays.corridorLines &&
                journeyMapOverlays.corridorLines.length > 0
              }
              className="h-full w-full"
            />
          }
          mapBadge={
            <>
              <span className="rounded-full bg-rajlo-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-rajlo-red/30">
                Booking
              </span>
              <span className="rounded-full bg-surface/95 text-black px-3 py-1.5 text-[11px] font-bold shadow-md backdrop-blur">
                {allPoints.length === 0
                  ? "Where are we going?"
                  : allPoints.length < 2
                    ? "Add a destination"
                    : `${stops.length + 2} stops planned`}
              </span>
            </>
          }
          // Action bar lives INSIDE the sheet as a sticky flex child
          // (last item). This eliminates the visible gap that
          // appeared when the bar was a separate fixed element
          // overlapping the sheet — content + bar are now direct
          // flex siblings, touching with zero space between them.
          // Sheet's bottom edge is always at viewport bottom, so
          // the bar stays at viewport bottom too.
          actionBar={
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
              {barContent}
            </div>
          }
        >
          <div className="mx-auto max-w-2xl">{formSections}</div>
        </RiderBottomSheet>
      </div>
      )}

      {/* ═════════════ DESKTOP LAYOUT ═════════════
         Negative margins cancel PortalLayout's px-4 + md:py-6 wrapper padding
         so the page occupies the full main column (100vh) edge-to-edge.
         Combined with md:h-screen, the page fits exactly inside main → no
         chance of overflow → main never shows a scrollbar on this page.
         Renders only when viewport is desktop. */}
      {viewportReady && !isMobile && (
      <div className="-mx-4 -my-6 flex h-screen gap-5">
        {/* Map card on the left — 50% of the row */}
        <div className="relative min-w-0 flex-1 basis-0 overflow-hidden rounded-3xl shadow-xl shadow-rajlo-black/10">
          <MapView
            pickup={pickup}
            stops={filledStops}
            dropoff={dropoff}
            nearbyDrivers={fleetDrivers}
            pickupEtaMinutes={pickupEtaMinutes}
            dropoffEtaMinutes={dropoff ? fare.etaMinutes : null}
            boarding={journeyMapOverlays.boarding}
            alighting={journeyMapOverlays.alighting}
            corridorLines={journeyMapOverlays.corridorLines}
            // Only suppress the standard pickup→dropoff polyline when
            // amber corridor lines are about to render in its place
            // (multi-leg journey). For a direct corridor match there
            // are no corridor lines, so we want the static polyline
            // to draw — otherwise the map would show nothing at all
            // between A and B.
            suppressStaticRoute={
              mode === "route_taxi" &&
              !!journeyMapOverlays.corridorLines &&
              journeyMapOverlays.corridorLines.length > 0
            }
            className="h-full w-full"
          />
          {breadcrumb}
        </div>

        {/* Form card on the right — 50% of the row */}
        <div className="flex min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-xl shadow-rajlo-red/[0.04]">
          {/* Scrollable form area.
              `min-h-0` is the canonical fix for a flex child that should
              scroll: without it, flex children default to min-height: auto
              and refuse to shrink below their content's intrinsic height,
              which prevents `overflow-y-auto` from doing anything.
              `overflow-x-hidden` guards against any rogue child trying to
              push the column wider than 50%. */}
          <div
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            <div className="px-6 pb-6 pt-7">{formSections}</div>
          </div>

          {/* Inline action bar at bottom of form card.
              Width = form card width = 420px, never spans the viewport,
              never covers map content. */}
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
            {barContent}
          </div>
        </div>
      </div>
      )}

      {/* Insufficient-funds modal — fires when the booking API returns
         402. CTA inside the modal navigates to /rider/wallet?deposit=open
         so the rider lands directly on the deposit composer. Rendered
         at the page root so the modal sits above both mobile + desktop
         layouts. */}
      <InsufficientFundsDialog
        open={insufficientFunds != null}
        fareJmd={insufficientFunds?.fareJmd ?? 0}
        balanceJmd={insufficientFunds?.balanceJmd ?? 0}
        onClose={() => setInsufficientFunds(null)}
      />

      {/* Anonymous-visitor login prompt. Renders only when we've
         confirmed the visitor isn't signed in. The page stays
         interactive underneath (map, pickup/dropoff inputs, fare
         preview) — the prompt is just a sticky bottom card with a
         "Sign in to book" CTA that round-trips the current URL
         through the auth flow so the rider lands right back here
         after sign-in with the same trip preloaded. */}
      {isAnonymous === true && (
        <AnonymousBookingPrompt
          fareLabel={
            pickup && dropoff && Number.isFinite(fare.fareJMD)
              ? formatJMD(fare.fareJMD)
              : null
          }
        />
      )}

      {/* Map-pin location picker — fullscreen overlay. Mounted
         conditionally so its Google Map only instantiates when the
         rider actually opens the picker. Confirm sets the target
         endpoint as if the rider had picked it from autocomplete. */}
      {pinPickerTarget && (
        <MapPinPicker
          target={pinPickerTarget}
          initialCoord={
            pinPickerTarget === "pickup"
              ? pickup
                ? { lat: pickup.lat, lng: pickup.lng }
                : null
              : dropoff
                ? { lat: dropoff.lat, lng: dropoff.lng }
                : pickup
                  ? { lat: pickup.lat, lng: pickup.lng }
                  : null
          }
          onConfirm={(place) => {
            if (pinPickerTarget === "pickup") {
              setPickup(place);
            } else {
              setDropoff(place);
            }
            setPinPickerTarget(null);
          }}
          onCancel={() => setPinPickerTarget(null)}
        />
      )}
    </>
  );
}

/* ─────────── Waypoint slot ─────────── */

function WaypointSlot({
  kind,
  label,
  place,
  onSelect,
  onClear,
  onRemove,
  onMoveUp,
  onMoveDown,
  inputId,
}: {
  kind: "pickup" | "stop" | "dropoff";
  label: string;
  place: Place | null;
  onSelect: (p: Place) => void;
  onClear?: () => void;
  onRemove?: () => void;
  /** Reorder controls — undefined when this stop can't move further
   *  in that direction (top stop has no onMoveUp, last stop has no
   *  onMoveDown). Only ever passed for kind="stop". */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** DOM id forwarded to the autocomplete input so external code can
   *  focus it (e.g., after pickup is selected we focus the dropoff). */
  inputId?: string;
}) {
  const tone =
    kind === "pickup"
      ? "bg-emerald-500"
      : kind === "dropoff"
      ? "bg-rajlo-red"
      : "bg-rajlo-black";

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const useCurrentLocation = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      if (!("geolocation" in navigator)) {
        throw new Error("Your browser doesn't support location.");
      }
      // 1. Ask the browser for the user's coordinates.
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10_000,
            maximumAge: 60_000,
          });
        },
      );
      const { latitude, longitude } = position.coords;

      // 2. Reverse-geocode via Google to get a real address + place_id.
      // Use the awaited return value of loadGoogleMaps rather than
      // `window.google` directly — the loader's return type is fully
      // typed (`typeof google`), whereas `window.google` depends on
      // ambient @types/google.maps being globally augmented, which
      // some editor/TS-server configs don't pick up.
      const g = await loadGoogleMaps();
      const geocoder = new g.maps.Geocoder();
      const { results } = await geocoder.geocode({
        location: { lat: latitude, lng: longitude },
      });
      if (!results.length) throw new Error("Couldn't find your address.");
      const top = results[0];

      // For the `name` field we deliberately PREFER a neighbourhood
      // / sublocality token (e.g. "Half Way Tree", "Cross Roads",
      // "Spanish Town") over the literal street address. Reason: the
      // route-taxi matcher tokenises the rider's name and looks for
      // overlap with TA route corridor names — "12 Hope Road" → tokens
      // [hope, road] won't ever match a corridor called
      // "Half Way Tree → Cross Roads". Pulling the neighbourhood
      // surfaces the right tokens AND reads more naturally for the
      // rider ("Half Way Tree" beats "12 Hope Road, Kingston").
      // The `?? []` fallback drops TypeScript's inferred element type,
      // so we re-annotate with a structural shape that matches what
      // Google's geocoder returns. We avoid `google.maps.GeocoderAddressComponent`
      // here because the `google` namespace isn't always resolvable
      // in client-component files depending on tsconfig — the inline
      // shape compiles everywhere.
      type AddrComponent = { types: string[]; long_name: string };
      const components: AddrComponent[] =
        (top.address_components as AddrComponent[] | undefined) ?? [];
      const pick = (type: string) =>
        components.find((c) => c.types.includes(type))?.long_name;
      const corridorName =
        pick("neighborhood") ??
        pick("sublocality_level_1") ??
        pick("sublocality") ??
        pick("locality") ??
        pick("administrative_area_level_2") ??
        top.formatted_address.split(",")[0] ??
        "Current location";

      onSelect({
        placeId: top.place_id ?? "",
        name: corridorName,
        address: top.formatted_address,
        lat: latitude,
        lng: longitude,
        parish: detectParish(top.address_components),
      });
    } catch (err) {
      // Two possible error shapes here:
      //   1. GeolocationPositionError — `.code` is a *number* (1=denied,
      //      2=unavailable, 3=timeout). `instanceof` is unreliable across
      //      browsers, so we sniff by the numeric code instead.
      //   2. Google Geocoder error — `.code` is a *string* like
      //      "REQUEST_DENIED", "ZERO_RESULTS", "OVER_QUERY_LIMIT".
      let msg: string;
      const codeAndMessage =
        err && typeof err === "object"
          ? (err as { code?: unknown; message?: unknown })
          : {};
      const numericCode =
        typeof codeAndMessage.code === "number" ? codeAndMessage.code : null;
      const stringCode =
        typeof codeAndMessage.code === "string" ? codeAndMessage.code : null;

      if (numericCode === 1) {
        // iOS users: the recovery path is in iOS Settings, not Safari.
        // Detect (lazy require to keep the existing import block tidy)
        // and surface the literal menu route.
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const onIOS =
          /iPad|iPhone|iPod/.test(ua) ||
          (ua.includes("Macintosh") &&
            "maxTouchPoints" in navigator &&
            (navigator as Navigator & { maxTouchPoints?: number })
              .maxTouchPoints !== undefined &&
            ((navigator as Navigator & { maxTouchPoints?: number })
              .maxTouchPoints ?? 0) > 1);
        msg = onIOS
          ? "Location is blocked. Open Settings → Privacy & Security → Location Services → Safari Websites → While Using the App, then refresh and try again."
          : "Location access is blocked. Click the lock icon next to the URL → Site settings → Location → Allow, then try again.";
      } else if (numericCode === 2) {
        msg = "Couldn't determine your location. Try again.";
      } else if (numericCode === 3) {
        msg = "Location request timed out. Try again.";
      } else if (stringCode === "ZERO_RESULTS") {
        msg = "No address found for your location.";
      } else if (stringCode === "REQUEST_DENIED") {
        msg = "Geocoding API isn't enabled or is misconfigured.";
      } else if (stringCode === "OVER_QUERY_LIMIT") {
        msg = "Hit Google's request limit — try again in a moment.";
      } else if (err instanceof Error) {
        msg = err.message;
      } else if (typeof codeAndMessage.message === "string") {
        msg = codeAndMessage.message;
      } else {
        msg = "Couldn't fetch your location.";
      }
      setLocateError(msg);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="flex items-stretch gap-2.5">
      <div className="flex flex-col items-center pt-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-extrabold text-white shadow-md ${tone}`}
        >
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <PlacesAutocomplete
          placeholder={
            kind === "pickup"
              ? "Pickup location"
              : kind === "stop"
              ? "Stop along the way"
              : "Where to?"
          }
          value={place}
          onSelect={onSelect}
          onClear={onClear}
          icon={
            kind === "pickup"
              ? "navigation"
              : kind === "stop"
              ? "map-pin"
              : "flag"
          }
          inputId={inputId}
          // Surface "Use my current location" at the top of the mobile
          // search overlay (pickup only) so it stays reachable while the
          // rider is searching — it's the single most common pickup
          // action and would otherwise be hidden behind the overlay.
          overlayTop={
            kind === "pickup" ? (
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-soft disabled:cursor-wait disabled:opacity-70"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
                  {locating ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon name="navigation" className="h-4 w-4" />
                  )}
                </span>
                <span className="text-sm font-bold text-rajlo-red">
                  {locating ? "Finding you…" : "Use my current location"}
                </span>
              </button>
            ) : undefined
          }
        />

        {/* Use my current location — pickup field only, hidden once a
            place has been picked. */}
        {kind === "pickup" && !place && (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="group mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-[11px] font-bold text-rajlo-red transition-colors hover:bg-rajlo-red hover:text-white disabled:cursor-wait disabled:opacity-70"
          >
            {locating ? (
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            ) : (
              <Icon name="navigation" className="h-3 w-3" />
            )}
            {locating ? "Finding you…" : "Use my current location"}
          </button>
        )}
        {locateError && (
          <p className="mt-1 ml-1 text-[11px] font-medium text-rajlo-red">
            {locateError}
          </p>
        )}

        {place?.parish && (
          <p className="mt-1 ml-1 truncate text-[11px] text-muted">
            <Icon
              name="map-pin"
              className="mr-1 inline-block h-3 w-3 align-text-bottom text-muted"
            />
            {place.address || place.parish}
          </p>
        )}
      </div>
      {kind === "stop" && (onMoveUp || onMoveDown || onRemove) && (
        // Reorder + remove controls. The up/down buttons swap this
        // stop with its neighbour so a rider can change "B → C → D"
        // into "B → D → C" with one tap. Each button is disabled (not
        // hidden) when at a boundary so the column width stays
        // constant — rows don't reflow when you tap the last move.
        <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label="Move stop earlier"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-rajlo-red disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <Icon name="chevron-up" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label="Move stop later"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-rajlo-red disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <Icon name="chevron-down" className="h-4 w-4" />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove stop"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-rajlo-red"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
