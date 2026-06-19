"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { Icon } from "@/components/icons";
import { detectParish, type Place } from "@/lib/jamaica";

/**
 * Fullscreen "Set on map" location picker. Mirrors Uber's drag-the-
 * map-under-a-fixed-pin pattern:
 *
 *   - The pin is fixed at the screen centre (just visual chrome,
 *     not a real google.maps.Marker — that way it stays anchored
 *     while the rider drags the map underneath).
 *   - When the map idles, we reverse-geocode the centre coords to
 *     produce a human-readable address that drives the bottom card.
 *   - Confirm hands the resolved Place back to the caller; Cancel
 *     dismisses without changes.
 *
 * Designed to be wrapped in its own portal / dialog by the caller.
 * Itself it's a single fullscreen flex container — drop it inside
 * a fixed positioned wrapper or render it directly as a page.
 */
export function MapPinPicker({
  target,
  initialCoord,
  onConfirm,
  onCancel,
}: {
  /** Whether the rider is picking their pickup or their dropoff —
   *  drives the heading copy + button label. */
  target: "pickup" | "dropoff";
  /** Where to centre the map when the picker opens. Defaults to
   *  Kingston city centre if not provided. */
  initialCoord?: { lat: number; lng: number } | null;
  onConfirm: (place: Place) => void;
  onCancel: () => void;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !mapEl.current) return;
        const start = initialCoord ?? { lat: 18.0179, lng: -76.8099 };
        mapRef.current = new g.maps.Map(mapEl.current, {
          center: start,
          zoom: 16,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          maxZoom: 19,
        });
        geocoderRef.current = new g.maps.Geocoder();

        // Whenever the map settles (drag end / zoom end), reverse-
        // geocode the centre coords. Debounced 200 ms so a flick that
        // settles into a single resting position only fires one
        // geocode call (not one per intermediate idle event).
        const onIdle = () => {
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            void reverseGeocodeCenter();
          }, 200);
        };
        mapRef.current.addListener("idle", onIdle);
        // Kick off the first lookup immediately so the bottom card
        // isn't empty on open.
        void reverseGeocodeCenter();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Map failed to load");
      }
    })();
    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse-geocode the current map centre into a Place object.
  // Falls back to a coord-only label when the geocoder has no
  // suggestion (rural Jamaica, gridless areas).
  const reverseGeocodeCenter = async () => {
    const map = mapRef.current;
    const geocoder = geocoderRef.current;
    if (!map || !geocoder) return;
    const c = map.getCenter();
    if (!c) return;
    const lat = c.lat();
    const lng = c.lng();
    setResolving(true);
    try {
      const res = await geocoder.geocode({ location: { lat, lng } });
      const best = res.results?.[0];
      if (best) {
        const components = best.address_components ?? [];
        const place: Place = {
          placeId: best.place_id ?? "",
          name: shortenName(best.formatted_address ?? "Selected location"),
          address: best.formatted_address ?? "",
          lat,
          lng,
          parish: detectParish(components),
        };
        setResolved(place);
      } else {
        setResolved({
          placeId: "",
          name: `Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          lat,
          lng,
          parish: null,
        });
      }
    } catch {
      setResolved({
        placeId: "",
        name: `Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
        parish: null,
      });
    } finally {
      setResolving(false);
    }
  };

  const headingLabel =
    target === "pickup" ? "Choose your pickup spot" : "Choose your drop-off spot";
  const confirmLabel = target === "pickup" ? "Confirm pickup" : "Confirm drop-off";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Map fills everything above the bottom card. */}
      <div className="relative flex-1">
        <div ref={mapEl} className="absolute inset-0 h-full w-full" />

        {/* Back button — top-left. */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white text-rajlo-black shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <Icon name="chevron-left" className="h-5 w-5" />
        </button>

        {/* Fixed centre pin — CSS-positioned, doesn't move with the
         map. The little stem at the bottom anchors visually to the
         coords the geocode will resolve. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
        >
          <svg
            width="32"
            height="42"
            viewBox="0 0 32 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M16 0C7.2 0 0 7.2 0 16c0 12 16 26 16 26s16-14 16-26c0-8.8-7.2-16-16-16z"
              fill="#111906"
            />
            <circle cx="16" cy="16" r="6" fill="#ffffff" />
          </svg>
          {/* Shadow under the pin so it still reads as floating
           when the map is light. */}
          <div className="mx-auto h-1 w-3 rounded-full bg-rajlo-black/40 blur-sm" />
        </div>

        {error && (
          <div className="absolute inset-x-4 top-20 rounded-2xl bg-rajlo-red px-4 py-3 text-sm font-semibold text-white shadow-lg">
            {error}
          </div>
        )}
      </div>

      {/* Bottom card — current address + Confirm + Cancel. */}
      <div
        className="shrink-0 border-t border-line bg-surface px-4 pt-4"
        style={{
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        <p className="text-base font-extrabold tracking-tight">{headingLabel}</p>
        <p className="mt-2 min-h-[1.5rem] truncate text-sm text-muted">
          {resolving ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
              Finding nearest address…
            </span>
          ) : resolved ? (
            <span className="font-semibold text-foreground">{resolved.name}</span>
          ) : (
            "Drag the map to position the pin"
          )}
        </p>
        <button
          type="button"
          onClick={() => resolved && onConfirm(resolved)}
          disabled={!resolved || resolving}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-black px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirmLabel}
          <Icon name="arrow-right" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 inline-flex w-full items-center justify-center rounded-full px-6 py-2.5 text-sm font-bold text-muted transition-colors hover:text-rajlo-red"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Take the first comma-separated chunk of a formatted address as a
 *  short display name. "23 Tokunboh St, Lagos Island, Nigeria" →
 *  "23 Tokunboh St". Keeps the bottom-card label punchy. */
function shortenName(formatted: string): string {
  const first = formatted.split(",")[0]?.trim();
  if (!first) return "Selected location";
  return first.length <= 60 ? first : `${first.slice(0, 57)}…`;
}
