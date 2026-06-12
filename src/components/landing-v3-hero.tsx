"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, useReducedMotion, AnimatePresence } from "motion/react";
import { Icon } from "./icons";
import {
  reveal,
  revealTransition,
  staggerParent,
  hoverLift,
  hoverLiftTransition,
  tapDown,
} from "@/lib/animations";
import { calculateRouteFare, getRouteTaxiTariff } from "@/lib/fare-engine";
import { formatJMD, JAMAICA_BOUNDS, detectParish, type Place } from "@/lib/jamaica";
import { loadGoogleMaps } from "@/lib/google-maps";
import { PHOTOS, BRAND_FALLBACK_BG } from "./landing-assets";
import type { LandingCtaTargets } from "@/lib/landing-cta-targets";

/**
 * Landing v3 — Hero (Booking-widget over photo).
 *
 * Pattern reference: qatarairways.com homepage — a scenic full-bleed
 * photo carries the headline up top, a white booking container
 * overlaps the bottom edge of the photo with the actual trip-entry
 * form. Tapping submit on the form takes the visitor directly into
 * the rider request flow with the destination pre-filled; an
 * unauthenticated visitor gets routed through `/auth/rider/login`
 * with the trip params preserved via `?next=…` so they land in the
 * booking flow with the destination still filled in after sign-in.
 *
 * Place resolution:
 *   - FROM is always Google Places autocomplete (biased to Jamaica),
 *     with a red pin shortcut on the far right that drops "Current
 *     location" into the field for the geolocation API to resolve
 *     server-side when the trip is created.
 *   - TO uses Google Places autocomplete in Private-ride mode, and
 *     the curated Popular-Routes corridor list in Route-taxi mode
 *     (since route taxi only operates along specific corridors —
 *     the TA-licensed corridor list is the canonical search space
 *     for that mode, not arbitrary destinations).
 *
 * When the visitor picks a Google place the full Place data
 * (placeId, name, address, lat, lng) rides in the URL so the rider
 * request page lands fully resolved without re-geocoding.
 */

/** Popular Jamaican corridors. Real distances drawn from the TA
 *  schedule; fares are computed live so a tariff-phase rollover
 *  refreshes the popover automatically. Used as the TO suggestion
 *  set when the active mode is Route taxi. */
type Mode = "route_taxi" | "private";
type PopularRoute = {
  from: string;
  to: string;
  distanceKm: number;
};

/** Headline pairs that rotate in lockstep with the photo carousel.
 *  Top line gets type-written character-by-character; the red pill
 *  word swaps with a slide-up/slide-in transition. Keep the pill
 *  words to roughly the same character count so the pill width
 *  stays comfortable across rotations. */
const HEADLINES: ReadonlyArray<{ top: string; pill: string }> = [
  { top: "Move across Jamaica,", pill: "your way." },
  { top: "Pay from your wallet,", pill: "no cash." },
  { top: "Drivers vetted by", pill: "the law." },
  { top: "Two ways to ride,", pill: "one app." },
];

const POPULAR_ROUTES: PopularRoute[] = [
  { from: "Half-Way Tree", to: "Papine", distanceKm: 8.6 },
  { from: "Spanish Town", to: "Downtown Kingston", distanceKm: 22 },
  { from: "Mandeville", to: "Christiana", distanceKm: 21 },
  { from: "Ocho Rios", to: "St. Ann's Bay", distanceKm: 12.5 },
  { from: "Half-Way Tree", to: "Cross Roads", distanceKm: 2.4 },
  { from: "Constant Spring", to: "Half-Way Tree", distanceKm: 4.8 },
];

/** Pulls Google's PlacePrediction structured text into main / sub
 *  display lines. The new Places API returns these on the prediction
 *  payload even though the bundled @types/google.maps doesn't model
 *  it — same shape the existing PlacesAutocomplete uses. */
type StructuredFormatLike = {
  mainText?: { toString(): string };
  secondaryText?: { toString(): string };
};
type PredictionWithStructured = google.maps.places.PlacePrediction & {
  structuredFormat?: StructuredFormatLike;
};

function splitPrediction(p: PredictionWithStructured): {
  main: string;
  sub: string;
} {
  const main = p.structuredFormat?.mainText?.toString() ?? p.text?.toString() ?? "";
  const sub = p.structuredFormat?.secondaryText?.toString() ?? "";
  return { main, sub };
}

export function LandingV3Hero({ cta }: { cta: LandingCtaTargets }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const fromInputId = useId();
  const toInputId = useId();
  const fromInputRef = useRef<HTMLInputElement | null>(null);
  const toInputRef = useRef<HTMLInputElement | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<Mode>("private");

  // Plain-text values bound to each input (what the user sees typed).
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");

  // How many passengers — only relevant for Private ride (route taxi
  // is shared seating, the corridor's standard van capacity applies).
  // Matches the 1–4 range the rider request page accepts.
  const [seats, setSeats] = useState(1);

  // Resolved Place when the user picks from the Google suggestions.
  // Carries the lat/lng/placeId/address into the submit URL so the
  // rider request page doesn't have to re-geocode the text. Cleared
  // back to null the moment the user edits the input text again.
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);

  // One popover per input. Mutually exclusive — opening one closes
  // the other so they never overlap on tight viewports.
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  // Google Places state. Loaded lazily on mount; suggestion arrays
  // are populated by the debounced fetchers.
  const placesLibRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const fromDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const [fromSuggestions, setFromSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [toSuggestions, setToSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [placesError, setPlacesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled) return;
        placesLibRef.current = window.google.maps
          .places as unknown as google.maps.PlacesLibrary;
        sessionTokenRef.current =
          new window.google.maps.places.AutocompleteSessionToken();
      })
      .catch((err: Error) => {
        if (!cancelled) setPlacesError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Photo carousel — cycles through PHOTOS.hero (4 images) so the
  // hero feels alive without being noisy. Paused entirely when the
  // visitor prefers reduced motion.
  const [activePhoto, setActivePhoto] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setActivePhoto((i) => (i + 1) % PHOTOS.hero.length);
    }, 10000);
    return () => window.clearInterval(id);
  }, [reduce]);

  // Typing animation for the headline top line. Two-phase cycle:
  //
  //   1. Delete the current text character-by-character (25ms/char,
  //      faster than typing — matches the backspace cadence the eye
  //      expects from a real typewriter).
  //   2. Swap the red pill to the new index (via headlineIdx, which
  //      keys the AnimatePresence — pill slides out + new slides in).
  //   3. Brief pause so the pill swap reads as its own beat.
  //   4. Type the new line forward (45ms/char).
  //
  // Reduced motion skips all of this — full text drops in and the
  // pill index syncs immediately.
  const [typed, setTyped] = useState(() =>
    reduce ? HEADLINES[0].top : "",
  );
  const [headlineIdx, setHeadlineIdx] = useState(0);
  useEffect(() => {
    const target = HEADLINES[activePhoto].top;
    if (reduce) {
      setTyped(target);
      setHeadlineIdx(activePhoto);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    (async () => {
      // Phase 1 — delete whatever is currently on screen.
      let cur = typed;
      while (cur.length > 0) {
        await wait(25);
        if (cancelled) return;
        cur = cur.slice(0, -1);
        setTyped(cur);
      }
      // Phase 2 — pill swap fires now (key change → AnimatePresence).
      setHeadlineIdx(activePhoto);
      // Phase 3 — beat for the pill animation.
      await wait(220);
      if (cancelled) return;
      // Phase 4 — type the new line forward.
      let i = 0;
      while (i < target.length) {
        await wait(45);
        if (cancelled) return;
        i += 1;
        setTyped(target.slice(0, i));
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhoto, reduce]);

  const tariff = getRouteTaxiTariff();

  // Popular-routes list, query-filtered. Drives the TO popover
  // whenever the active mode is Route taxi.
  const filteredRoutes = (() => {
    const q = toValue.trim().toLowerCase();
    if (!q) return POPULAR_ROUTES;
    return POPULAR_ROUTES.filter(
      (r) =>
        r.to.toLowerCase().includes(q) || r.from.toLowerCase().includes(q),
    );
  })();

  /**
   * Debounced Google Places fetch shared by both inputs. The "kind"
   * arg decides which suggestion array gets populated and which
   * popover gets opened. Bails out on <2 chars (Google rejects very
   * short queries anyway).
   */
  const fetchSuggestions = async (
    input: string,
    kind: "from" | "to",
  ): Promise<void> => {
    if (!placesLibRef.current) return;
    if (input.trim().length < 2) {
      if (kind === "from") setFromSuggestions([]);
      else setToSuggestions([]);
      return;
    }
    const seq = ++requestSeqRef.current;
    try {
      const { suggestions } =
        await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          {
            input,
            sessionToken: sessionTokenRef.current ?? undefined,
            includedRegionCodes: ["jm"],
            locationBias: {
              north: JAMAICA_BOUNDS.north,
              south: JAMAICA_BOUNDS.south,
              east: JAMAICA_BOUNDS.east,
              west: JAMAICA_BOUNDS.west,
            },
          },
        );
      if (seq !== requestSeqRef.current) return;
      const filtered = suggestions.filter((s) => s.placePrediction);
      if (kind === "from") {
        setFromSuggestions(filtered);
        setFromOpen(true);
        setToOpen(false);
      } else {
        setToSuggestions(filtered);
        setToOpen(true);
        setFromOpen(false);
      }
      setPlacesError(null);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setPlacesError(err instanceof Error ? err.message : "Search failed");
    }
  };

  /**
   * Hydrate a picked AutocompleteSuggestion into a full Place via
   * `place.fetchFields`, stash it in the right state slot, and
   * refresh the session token so the next typed query opens a new
   * billable autocomplete session.
   */
  const pickSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion,
    kind: "from" | "to",
  ): Promise<void> => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: [
          "id",
          "displayName",
          "formattedAddress",
          "location",
          "addressComponents",
        ],
      });
      sessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();

      const components = (place.addressComponents ?? []).map(
        (c): google.maps.GeocoderAddressComponent => ({
          long_name: c.longText ?? "",
          short_name: c.shortText ?? "",
          types: c.types ?? [],
        }),
      );
      const resolved: Place = {
        placeId: place.id ?? "",
        name:
          place.displayName ??
          suggestion.placePrediction.text?.toString() ??
          "Selected place",
        address: place.formattedAddress ?? "",
        lat: place.location?.lat() ?? 0,
        lng: place.location?.lng() ?? 0,
        parish: detectParish(components),
      };
      if (kind === "from") {
        setFromPlace(resolved);
        setFromValue(resolved.name);
        setFromOpen(false);
        setFromSuggestions([]);
      } else {
        setToPlace(resolved);
        setToValue(resolved.name);
        setToOpen(false);
        setToSuggestions([]);
      }
    } catch (err) {
      setPlacesError(err instanceof Error ? err.message : "Couldn't load that place");
    }
  };

  // Click-outside closes whichever popover is open. Single listener
  // gated on either popover being active.
  useEffect(() => {
    if (!fromOpen && !toOpen) return;
    const onDown = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setFromOpen(false);
        setToOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [fromOpen, toOpen]);

  /**
   * Build the final destination URL from the widget state and the
   * visitor's auth status, then navigate. Carries the full resolved
   * Place fields (lat/lng/placeId/address) when the user picked from
   * Google suggestions so the request page doesn't re-geocode.
   */
  const submit = (override?: { route: PopularRoute }) => {
    const tripParams = new URLSearchParams({ mode });

    // Carry the picked passenger count only when it's the relevant
    // dimension — route taxi is shared seating, so seats isn't a
    // rider-controlled value there.
    if (mode === "private" && seats > 1) {
      tripParams.set("seats", String(seats));
    }

    // Destination — either an override from a popular-route click,
    // a resolved Google Place, or the raw typed text.
    if (override) {
      tripParams.set("to_name", override.route.to);
      tripParams.set("to_address", `${override.route.to}, Jamaica`);
    } else if (toPlace) {
      tripParams.set("to_name", toPlace.name);
      tripParams.set("to_address", toPlace.address);
      tripParams.set("to_lat", String(toPlace.lat));
      tripParams.set("to_lng", String(toPlace.lng));
      if (toPlace.placeId) tripParams.set("to_place", toPlace.placeId);
    } else {
      const toName = toValue.trim();
      if (!toName) {
        toInputRef.current?.focus();
        setToOpen(true);
        return;
      }
      tripParams.set("to_name", toName);
      tripParams.set("to_address", `${toName}, Jamaica`);
    }

    // Pickup — the resolved Google Place wins; otherwise carry the
    // typed text (unless it's the "Current location" sentinel, in
    // which case the rider portal resolves real coords via the
    // Geolocation API and we send nothing).
    if (fromPlace) {
      tripParams.set("from_name", fromPlace.name);
      tripParams.set("from_address", fromPlace.address);
      tripParams.set("from_lat", String(fromPlace.lat));
      tripParams.set("from_lng", String(fromPlace.lng));
      if (fromPlace.placeId) tripParams.set("from_place", fromPlace.placeId);
    } else if (fromValue && fromValue.toLowerCase() !== "current location") {
      tripParams.set("from_name", fromValue);
      tripParams.set("from_address", `${fromValue}, Jamaica`);
    }

    const tripPath = `/rider/request?${tripParams.toString()}`;
    if (cta.riderIsDashboard) {
      router.push(tripPath);
      return;
    }
    router.push(`/auth/rider/login?next=${encodeURIComponent(tripPath)}`);
  };

  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  // Whether the TO field is currently in Google-suggestions mode
  // (Private ride) or popular-corridors mode (Route taxi).
  const toUsesGoogle = mode === "private";

  return (
    <section className="relative isolate overflow-hidden bg-background text-foreground">
      {/* PHOTO BLOCK — full-bleed scenic Jamaica imagery that
         cycles through PHOTOS.hero. Each photo is mounted as its
         own absolutely-positioned layer; only the active one is
         opacity-1, the rest fade out. */}
      <div className="relative min-h-[460px] md:min-h-[500px] lg:min-h-[540px]">
        <div
          className="absolute inset-0"
          style={{ background: BRAND_FALLBACK_BG }}
        >
          {PHOTOS.hero.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt={i === 0 ? "A street scene from across Jamaica" : ""}
              fill
              priority={i === 0}
              sizes="100vw"
              className={`object-cover object-center transition-opacity duration-[1400ms] ease-in-out ${
                i === activePhoto ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-rajlo-black/80"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 12% -6%, rgba(241,1,0,0.32) 0%, rgba(241,1,0,0) 50%)",
          }}
        />

        <div className="relative mx-auto flex h-full max-w-7xl flex-col px-6 pb-10 pt-24 text-white md:pb-10 md:pt-28 lg:px-12 lg:pb-12 lg:pt-32">
          <m.div
            initial="initial"
            animate="animate"
            variants={staggerParent}
            className="max-w-3xl"
          >
            {/* Eyebrow pill hidden but its vertical footprint is
               preserved (`invisible` paints nothing, still occupies
               layout) so the headline drop stays consistent. Swap
               back to a visible pill by removing the `invisible`
               class on the inner div. */}
            <m.div variants={reveal} transition={revealTransition} aria-hidden>
              <div className="invisible inline-flex items-center gap-2 rounded-full border border-rajlo-red/50 bg-rajlo-red/15 px-4 py-1.5 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-rajlo-red" />
                <span className="font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-white md:text-[11px]">
                  Made for Jamaica
                </span>
              </div>
            </m.div>

            <m.h1
              variants={reveal}
              transition={revealTransition}
              className="mt-5 text-[clamp(2.25rem,3.5vw+1rem,4rem)] font-extrabold leading-[1.15] tracking-[-0.03em] [text-wrap:balance]"
            >
              {/* Top line — typed character-by-character with a
                 blinking caret. The min-h on the wrapper holds the
                 row at full height before any chars land so the H1
                 doesn't reflow as typing progresses. */}
              <span className="inline-block min-h-[1.15em]">
                {typed}
                {!reduce && (
                  <span
                    aria-hidden
                    className="ml-1 inline-block h-[0.85em] w-[0.06em] translate-y-[0.1em] animate-pulse bg-white align-middle"
                  />
                )}
              </span>
              <br />
              {/* Red pill — slides up out and the next variant slides
                 in. AnimatePresence mode="wait" so the outgoing pill
                 finishes its exit before the new one mounts; keeps
                 the line from doubling height mid-transition. */}
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={headlineIdx}
                  initial={
                    reduce ? false : { y: "0.5em", opacity: 0 }
                  }
                  animate={
                    reduce ? undefined : { y: 0, opacity: 1 }
                  }
                  exit={
                    reduce ? undefined : { y: "-0.5em", opacity: 0 }
                  }
                  transition={{ type: "spring", duration: 0.45, bounce: 0 }}
                  className="mt-1 inline-block rounded-2xl bg-rajlo-red px-3 py-0.5 text-white md:rounded-3xl md:px-4"
                >
                  {HEADLINES[headlineIdx].pill}
                </m.span>
              </AnimatePresence>
            </m.h1>

            <m.p
              variants={reveal}
              transition={revealTransition}
              className="mt-4 max-w-xl text-sm leading-relaxed text-white/85 [text-wrap:pretty] md:text-base"
            >
              Verified TA-licensed drivers, two ride modes, one cashless
              wallet. Tell us where you&apos;re going.
            </m.p>

            {!reduce && (
              <m.div
                variants={reveal}
                transition={revealTransition}
                className="mt-5 flex items-center gap-2"
                aria-label="Hero photo carousel"
              >
                {PHOTOS.hero.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    aria-label={`Show photo ${i + 1} of ${PHOTOS.hero.length}`}
                    aria-current={i === activePhoto}
                    className={`h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${
                      i === activePhoto
                        ? "w-8 bg-rajlo-red"
                        : "w-1.5 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ))}
              </m.div>
            )}
          </m.div>
        </div>
      </div>

      {/* BOOKING CONTAINER — overlaps the bottom of the photo. */}
      <div className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:-mt-16 sm:px-6 md:-mt-12 lg:-mt-16 lg:px-8">
        <m.div
          ref={widgetRef}
          initial={
            reduce ? false : { opacity: 0, y: 32, filter: "blur(8px)" }
          }
          animate={
            reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
          }
          transition={{ type: "spring", duration: 0.7, bounce: 0, delay: 0.15 }}
          className="overflow-visible rounded-3xl border border-line bg-surface p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] md:p-5 lg:p-6"
        >
          {/* MODE TABS */}
          <div
            role="tablist"
            aria-label="Choose a ride mode"
            className="inline-flex rounded-full border border-line bg-surface-soft p-1 text-xs font-extrabold uppercase tracking-[0.18em] md:text-[13px]"
          >
            {(
              [
                { id: "private", label: "Private ride" },
                { id: "route_taxi", label: "Route taxi" },
              ] as const
            ).map((tab) => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => {
                    setMode(tab.id);
                    // Clear any picked TO place when switching modes
                    // so the popover behavior matches the new mode.
                    setToPlace(null);
                    setToSuggestions([]);
                    setToOpen(false);
                  }}
                  className={`relative rounded-full px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red md:px-5 ${
                    active
                      ? "bg-rajlo-red text-white shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* TRIP FIELDS */}
          <form
            onSubmit={onSubmitForm}
            className="mt-4 grid gap-2.5 md:grid-cols-2 md:gap-3 lg:grid-cols-[1fr_1.4fr_auto]"
          >
            {/* ─── FROM ─── */}
            <label
              htmlFor={fromInputId}
              className="group relative flex flex-col gap-0.5 rounded-2xl border border-line bg-background px-4 py-2.5 transition-colors focus-within:border-rajlo-red md:py-2.5"
            >
              <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                From
              </span>
              <div className="flex items-center gap-2">
                <input
                  id={fromInputId}
                  ref={fromInputRef}
                  type="text"
                  value={fromValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFromValue(v);
                    setFromPlace(null);
                    if (fromDebounceRef.current)
                      clearTimeout(fromDebounceRef.current);
                    fromDebounceRef.current = setTimeout(
                      () => fetchSuggestions(v, "from"),
                      180,
                    );
                  }}
                  onFocus={() => {
                    if (fromSuggestions.length > 0) {
                      setFromOpen(true);
                      setToOpen(false);
                    }
                  }}
                  placeholder="Where are you?"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground placeholder:text-muted placeholder:font-medium focus:outline-none md:text-base"
                  aria-label="Pickup location"
                />
                {fromValue ? (
                  // Clear button — replaces the current-location pin
                  // once the field has any content. Tap to wipe the
                  // value, any resolved Place, and reset suggestions.
                  <button
                    type="button"
                    onClick={() => {
                      setFromValue("");
                      setFromPlace(null);
                      setFromSuggestions([]);
                      setFromOpen(false);
                      fromInputRef.current?.focus();
                    }}
                    aria-label="Clear pickup"
                    title="Clear"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-rajlo-red hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFromValue("Current location");
                      setFromPlace(null);
                      setFromSuggestions([]);
                      setFromOpen(false);
                    }}
                    aria-label="Use my current location"
                    title="Use my current location"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rajlo-red/10 text-rajlo-red transition-colors hover:bg-rajlo-red hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red"
                  >
                    <Icon name="map-pin" className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* FROM popover — Google Places suggestions. */}
              <AnimatePresence>
                {fromOpen && fromSuggestions.length > 0 && (
                  <m.div
                    initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
                    transition={revealTransition}
                    className="absolute left-0 right-0 top-full z-50 mt-4 max-h-72 origin-top overflow-y-auto rounded-2xl border border-line bg-white shadow-[0_32px_72px_-8px_rgba(0,0,0,0.55),_0_12px_24px_-4px_rgba(0,0,0,0.25)] dark:bg-surface"
                  >
                    <p className="px-5 pb-2 pt-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                      Pickup suggestions
                    </p>
                    <ul className="pb-2">
                      {fromSuggestions.map((s, i) => {
                        const pp =
                          s.placePrediction as PredictionWithStructured | null;
                        if (!pp) return null;
                        const { main, sub } = splitPrediction(pp);
                        return (
                          <li key={pp.placeId ?? `${main}-${i}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickSuggestion(s, "from")}
                              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none"
                            >
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rajlo-red/10 text-rajlo-red">
                                <Icon name="map-pin" className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-foreground">
                                  {main}
                                </span>
                                {sub && (
                                  <span className="block truncate text-xs text-muted">
                                    {sub}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </m.div>
                )}
              </AnimatePresence>
            </label>

            {/* ─── TO ─── */}
            <label
              htmlFor={toInputId}
              className="group relative flex flex-col gap-0.5 rounded-2xl border border-line bg-background px-4 py-2.5 transition-colors focus-within:border-rajlo-red md:py-2.5"
            >
              <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                To
              </span>
              <div className="flex items-center gap-2">
                <Icon
                  name="search"
                  className="h-4 w-4 shrink-0 text-rajlo-red"
                />
                <input
                  id={toInputId}
                  ref={toInputRef}
                  type="text"
                  value={toValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setToValue(v);
                    setToPlace(null);
                    if (toUsesGoogle) {
                      if (toDebounceRef.current)
                        clearTimeout(toDebounceRef.current);
                      toDebounceRef.current = setTimeout(
                        () => fetchSuggestions(v, "to"),
                        180,
                      );
                    } else {
                      setToOpen(true);
                      setFromOpen(false);
                    }
                  }}
                  onFocus={() => {
                    if (toUsesGoogle) {
                      if (toSuggestions.length > 0) {
                        setToOpen(true);
                        setFromOpen(false);
                      }
                    } else {
                      setToOpen(true);
                      setFromOpen(false);
                    }
                  }}
                  placeholder={
                    toUsesGoogle
                      ? "Address, landmark, or business…"
                      : "Papine, Cross Roads, Spanish Town…"
                  }
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground placeholder:text-muted focus:outline-none md:text-base"
                  aria-label="Destination"
                />
                {toValue && (
                  // Clear button mirrors the FROM clear — wipes the
                  // text, the resolved Place, and the open popover.
                  <button
                    type="button"
                    onClick={() => {
                      setToValue("");
                      setToPlace(null);
                      setToSuggestions([]);
                      setToOpen(false);
                      toInputRef.current?.focus();
                    }}
                    aria-label="Clear destination"
                    title="Clear"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-rajlo-red hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* TO popover — Google suggestions in Private mode,
                 Popular routes in Route-taxi mode. */}
              <AnimatePresence>
                {toOpen && toUsesGoogle && toSuggestions.length > 0 && (
                  <m.div
                    initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
                    transition={revealTransition}
                    className="absolute left-0 right-0 top-full z-50 mt-4 max-h-72 origin-top overflow-y-auto rounded-2xl border border-line bg-white shadow-[0_32px_72px_-8px_rgba(0,0,0,0.55),_0_12px_24px_-4px_rgba(0,0,0,0.25)] dark:bg-surface"
                  >
                    <p className="px-5 pb-2 pt-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                      Destination suggestions
                    </p>
                    <ul className="pb-2">
                      {toSuggestions.map((s, i) => {
                        const pp =
                          s.placePrediction as PredictionWithStructured | null;
                        if (!pp) return null;
                        const { main, sub } = splitPrediction(pp);
                        return (
                          <li key={pp.placeId ?? `${main}-${i}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickSuggestion(s, "to")}
                              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none"
                            >
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rajlo-red/10 text-rajlo-red">
                                <Icon name="map-pin" className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-foreground">
                                  {main}
                                </span>
                                {sub && (
                                  <span className="block truncate text-xs text-muted">
                                    {sub}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </m.div>
                )}
                {toOpen && !toUsesGoogle && filteredRoutes.length > 0 && (
                  <m.div
                    initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
                    transition={revealTransition}
                    className="absolute left-0 right-0 top-full z-50 mt-4 origin-top overflow-hidden rounded-2xl border border-line bg-white shadow-[0_32px_72px_-8px_rgba(0,0,0,0.55),_0_12px_24px_-4px_rgba(0,0,0,0.25)] dark:bg-surface"
                  >
                    <p className="px-5 pb-2 pt-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                      Popular route-taxi corridors · fares from the TA schedule
                    </p>
                    <ul className="pb-2">
                      {filteredRoutes.map((route) => {
                        const fare = calculateRouteFare(route.distanceKm);
                        return (
                          <li key={`${route.from}->${route.to}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setToValue(route.to);
                                setToOpen(false);
                                toInputRef.current?.focus();
                              }}
                              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none"
                            >
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rajlo-red/10 text-rajlo-red">
                                <Icon name="map-pin" className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                                {route.from}
                                <span className="mx-2 text-rajlo-red">→</span>
                                {route.to}
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-sm font-extrabold tabular-nums text-foreground">
                                  ~{formatJMD(fare)}
                                </span>
                                <span className="block text-[10px] uppercase tracking-wider text-muted">
                                  {route.distanceKm} km
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </m.div>
                )}
              </AnimatePresence>
            </label>

            <m.div
              whileHover={hoverLift}
              whileTap={tapDown}
              transition={hoverLiftTransition}
              className="md:col-span-2 lg:col-span-1"
            >
              <button
                type="submit"
                className="group inline-flex h-full min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-rajlo-red px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/30 transition-colors hover:bg-primary-hover hover:shadow-rajlo-red/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rajlo-red lg:px-6"
              >
                {mode === "route_taxi" ? "Hail a ride" : "Find a ride"}
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </button>
            </m.div>
          </form>

          {placesError && (
            <p className="mt-3 text-xs font-medium text-rajlo-red">
              {placesError}
            </p>
          )}

          {/* SEATS PICKER — appears in Private ride mode once the
             rider has filled the destination. Route taxi hides it
             entirely (corridor van capacity is the operative number,
             not a rider choice). Same 1–4 range the rider request
             page exposes. */}
          <AnimatePresence>
            {mode === "private" && (toValue.trim().length > 0 || toPlace) && (
              <m.div
                initial={
                  reduce ? false : { opacity: 0, height: 0, marginTop: 0 }
                }
                animate={
                  reduce
                    ? undefined
                    : { opacity: 1, height: "auto", marginTop: 16 }
                }
                exit={
                  reduce
                    ? undefined
                    : { opacity: 0, height: 0, marginTop: 0 }
                }
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-muted">
                    Passengers
                  </span>
                  <div className="inline-flex rounded-full border border-line bg-surface-soft p-1">
                    {[1, 2, 3, 4].map((n) => {
                      const active = seats === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setSeats(n)}
                          aria-label={`${n} passenger${n === 1 ? "" : "s"}`}
                          aria-pressed={active}
                          className={`inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-full px-3 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rajlo-red ${
                            active
                              ? "bg-rajlo-red text-white shadow-sm"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs text-muted">
                    {seats === 1
                      ? "Just you"
                      : `${seats} passengers including you`}
                  </span>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Secondary actions row */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-muted md:text-sm">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="wallet" className="h-3.5 w-3.5 text-rajlo-red" />
                Cashless wallet
              </span>
              <span aria-hidden className="text-line">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  name="shield-check"
                  className="h-3.5 w-3.5 text-rajlo-red"
                />
                TA-verified drivers
              </span>
            </span>
            <Link
              href={cta.driverHref}
              className="inline-flex items-center gap-1 rounded-sm font-bold text-foreground transition-colors hover:text-rajlo-red focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rajlo-red"
            >
              {cta.driverIsDashboard ? "Driver dashboard" : "Drive with Rajlo"}
              <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </m.div>
      </div>

      {/* LIVE TARIFF STRIP */}
      <div className="relative mt-24 border-t border-line bg-surface-soft md:mt-32">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-muted md:tracking-[0.3em] lg:justify-between lg:px-12">
          <span className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full bg-emerald-500 ${reduce ? "" : "animate-pulse"}`}
            />
            <span className="text-foreground">{tariff.label}</span>
            <span className="text-line">·</span>
            <span className="tabular-nums">
              Base ${tariff.baseRateJmd.toFixed(2)} · ${tariff.perKmRateJmd.toFixed(2)}/km
            </span>
          </span>
          <span className="hidden items-center gap-6 md:flex">
            <span className="flex items-center gap-2">
              <Icon name="map-pin" className="h-3.5 w-3.5 text-rajlo-red" />
              Island-wide
            </span>
            <span className="flex items-center gap-2">
              <Icon name="shield-check" className="h-3.5 w-3.5 text-rajlo-red" />
              Background-checked
            </span>
            <span className="flex items-center gap-2">
              <Icon name="wallet" className="h-3.5 w-3.5 text-rajlo-red" />
              Wallet-only
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
