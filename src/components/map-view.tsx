"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { JAMAICA_CENTER, type Place } from "@/lib/jamaica";
import { formatEta } from "@/lib/format-eta";

/**
 * Branded Google Map showing pickup → stops → dropoff with red markers and a
 * polyline that follows actual roads via the Directions API. Auto-fits to
 * the route whenever the points change. Falls back to a straight-line
 * preview if Directions fails (e.g. impossible route, API hiccup).
 */

const MAP_STYLE: google.maps.MapTypeStyle[] = [
  // Soft, low-contrast base so the route + markers pop. Branded subtly.
  { elementType: "geometry", stylers: [{ color: "#f3f1ed" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6068" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d8d4cc" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dde8d8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fbe9e9" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#f10100" }, { weight: 0.4 }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe6ec" }] },
];

export type LiveDot = { lat: number; lng: number };

/** A nearby online driver shown as a car icon on the booking-screen map. */
export type FleetDot = {
  driverId: string;
  lat: number;
  lng: number;
  /** Optional heading in degrees — rotates the car icon when present. */
  heading?: number | null;
};

/**
 * "Live route" mode — when set, the polyline goes from the driver's
 * current GPS position to the named target instead of the static
 * pickup → stops → dropoff path. Used during an active ride: while
 * heading to the rider, target is "pickup"; once the ride starts,
 * target flips to "dropoff".
 */
export type LiveRoute = { target: "pickup" | "dropoff" };

/** Re-route only when the driver has moved this many metres from the
 *  last route's origin. Without this, every 5s GPS heartbeat would fire
 *  a Directions API call — expensive and visually noisy (the polyline
 *  would flicker as it redraws). */
const LIVE_ROUTE_REFRESH_THRESHOLD_M = 120;

/** Initial compass bearing from p1 to p2 (0–360°, 0=north, clockwise). */
function computeBearing(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(p1.lat);
  const φ2 = toRad(p2.lat);
  const Δλ = toRad(p2.lng - p1.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance between two lat/lng pairs (haversine, metres). */
function approxDistanceMeters(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(p1.lat);
  const φ2 = toRad(p2.lat);
  const Δφ = toRad(p2.lat - p1.lat);
  const Δλ = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Floating info bubble that sits ABOVE a pickup/dropoff pin showing
// the ETA. Rendered as a Google Maps Marker with an SVG-data-URL icon
// so it stays anchored to the lat/lng and reprojects correctly on pan
// or zoom. The SVG is an extra ~14px taller than the visual bubble so
// the anchor (bottom-centre) puts the triangle tip a clean 4px above
// the pin's top edge regardless of pin size.
function buildBubbleIcon(
  text: string,
  accent: "red" | "black",
): google.maps.Icon {
  const padding = 12;
  // Rough width estimate: 7px/char is generous for system-ui bold 12px.
  // Bake the longest expected label in once and clamp to a minimum so
  // tiny labels ("3 min") still look like balanced pills.
  const bubbleW = Math.max(58, text.length * 7 + padding * 2);
  const bubbleH = 28;
  const tipH = 6;
  const gap = 14; // empty space below the tip so it floats above the pin
  const totalH = bubbleH + tipH + gap;
  const borderColor = accent === "red" ? "#f10100" : "#111906";
  const tipX = bubbleW / 2;
  const tipY = bubbleH + tipH;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bubbleW}" height="${totalH}" viewBox="0 0 ${bubbleW} ${totalH}">` +
    // soft drop shadow
    `<rect x="3" y="4" width="${bubbleW - 6}" height="${bubbleH}" rx="${bubbleH / 2}" fill="#000" opacity="0.18"/>` +
    // body pill
    `<rect x="1.5" y="1.5" width="${bubbleW - 3}" height="${bubbleH}" rx="${bubbleH / 2}" fill="#ffffff" stroke="${borderColor}" stroke-width="1.5"/>` +
    // triangle pointer (white fill drawn over the body's bottom border)
    `<path d="M${tipX - 6} ${bubbleH + 1} L${tipX} ${tipY} L${tipX + 6} ${bubbleH + 1} Z" fill="#ffffff"/>` +
    // triangle border (just the two slanted sides — the top side is
    // hidden behind the body so we don't redraw it)
    `<path d="M${tipX - 6} ${bubbleH + 1} L${tipX} ${tipY} L${tipX + 6} ${bubbleH + 1}" stroke="${borderColor}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>` +
    // label text
    `<text x="${bubbleW / 2}" y="${bubbleH / 2 + 4.5}" font-family="-apple-system, system-ui, Segoe UI, sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#111906">${text}</text>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(bubbleW, totalH),
    // Anchor at bottom-centre so the SVG floats above the marker
    // position. The `gap` baked into totalH gives the tip 4px of
    // breathing room from the pin's top edge.
    anchor: new google.maps.Point(bubbleW / 2, totalH),
  };
}

// Route polyline gradient: bright Rajlo red at the pickup (A) deepening
// to a dark crimson at the dropoff (B), so the eye reads "this is
// where you're going" along the line itself. The dropoff pin is
// painted in the END colour so the final destination matches the
// shade the gradient settles into.
const ROUTE_COLOR_START = "#f10100"; // Rajlo brand red — at pickup (A)
const ROUTE_COLOR_END = "#6a0000"; // Deep crimson — at dropoff (B)
// Parsed channels (avoids slicing the hex strings on every interpolation
// call inside the per-segment loop).
const ROUTE_START_R = 0xf1;
const ROUTE_START_G = 0x01;
const ROUTE_START_B = 0x00;
const ROUTE_END_R = 0x6a;
const ROUTE_END_G = 0x00;
const ROUTE_END_B = 0x00;

/**
 * Module-scoped cache of road-following corridor polylines, keyed by
 * "fromLat,fromLng->toLat,toLng". Populated by the route-taxi
 * overlay effect via DirectionsService and reused for every
 * subsequent quote that traverses the same corridor — keeps the
 * Directions API quota bounded even when riders churn through many
 * Negril ↔ Sav-la-Mar etc. trips.
 */
const corridorPolylineCache = new Map<
  string,
  google.maps.LatLngLiteral[]
>();

function corridorCacheKey(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
): string {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(
    5,
  )},${to.lng.toFixed(5)}`;
}

function interpolateRouteColor(t: number): string {
  const tc = Math.max(0, Math.min(1, t));
  const r = Math.round(ROUTE_START_R + (ROUTE_END_R - ROUTE_START_R) * tc);
  const g = Math.round(ROUTE_START_G + (ROUTE_END_G - ROUTE_START_G) * tc);
  const b = Math.round(ROUTE_START_B + (ROUTE_END_B - ROUTE_START_B) * tc);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Render a single conceptual polyline as N short polylines, each with
 * an interpolated colour. Google Maps' native Polyline takes one
 * `strokeColor`, so a gradient line is faked by stitching small
 * uniformly-coloured pieces together.
 *
 * 18 segments is the sweet spot — any more and the perf gain of
 * batching is wiped out by extra Maps overlay objects; any fewer and
 * the bands become visible at typical city zoom.
 */
function drawGradientPolyline(
  map: google.maps.Map,
  path: Array<google.maps.LatLng | { lat: number; lng: number }>,
  strokeWeight: number,
): google.maps.Polyline[] {
  const polylines: google.maps.Polyline[] = [];
  if (path.length < 2) return polylines;
  const N = Math.min(18, path.length - 1);
  for (let i = 0; i < N; i++) {
    const startIdx = Math.floor((i * (path.length - 1)) / N);
    // +1 to the end index so segment i's last point is the same as
    // segment i+1's first point — keeps the line visually continuous
    // instead of breaking into 18 disconnected sticks.
    const endIdx = Math.min(
      path.length,
      Math.floor(((i + 1) * (path.length - 1)) / N) + 1,
    );
    const segmentPath = path.slice(startIdx, endIdx);
    if (segmentPath.length < 2) continue;
    const t = N === 1 ? 1 : i / (N - 1);
    polylines.push(
      new google.maps.Polyline({
        map,
        path: segmentPath,
        strokeColor: interpolateRouteColor(t),
        strokeWeight,
        strokeOpacity: 0.92,
      }),
    );
  }
  return polylines;
}

/**
 * The FULL-resolution driving geometry for a route.
 *
 * `route.overview_path` is Google's *simplified* overview line — it
 * drops vertices, so it visibly cuts corners and looks straight when
 * you zoom in. Each `DirectionsStep` instead carries a detailed
 * `path`; stitching every step's path together gives the geometry
 * that actually bends with every curve in the road.
 */
function fullRoutePath(
  route: google.maps.DirectionsRoute,
): Array<google.maps.LatLng | { lat: number; lng: number }> {
  const path: google.maps.LatLng[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      for (const pt of step.path ?? []) path.push(pt);
    }
  }
  // Fall back to the overview if the steps somehow carry no detail.
  return path.length > 1 ? path : route.overview_path;
}

// Sleek top-down car icon — Bolt-style minimalist. A smooth rounded-pill
// body in Rajlo red with subtle horizontal gradient (left/right edges
// shaded slightly darker than the centre for a "polished metal"
// roundedness), two clean tinted-glass trapezoids (windshield + rear),
// two tiny side-mirror dots, a single brake-light strip across the
// rear, a faint headlight strip across the front, and a very soft
// ground shadow. No outline, no 3/4 slab, no visible wheels — every
// piece earns its place. The result reads as a sleek modern hatchback
// at thumb-size and stays readable at any heading because the design
// is rotationally symmetric front-to-back-axis.
//
// Rotation is baked into the SVG (`<g transform="rotate(...)">`) because
// Google Maps' URL-based icon doesn't support runtime rotation. We bucket
// to 10° steps so we cache ≤36 SVGs no matter how many drivers move.
function carIconSvg(rotationDeg: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70"><defs><linearGradient id="b" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#a80000"/><stop offset="20%" stop-color="#dc0a0a"/><stop offset="50%" stop-color="#ff2828"/><stop offset="80%" stop-color="#dc0a0a"/><stop offset="100%" stop-color="#a80000"/></linearGradient><linearGradient id="w" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#3a4554"/><stop offset="100%" stop-color="#161b22"/></linearGradient><radialGradient id="s" cx="50%" cy="55%" r="50%"><stop offset="0%" stop-color="#000" stop-opacity="0.18"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs><g transform="rotate(${rotationDeg} 35 35)"><ellipse cx="35" cy="38" rx="16" ry="26" fill="url(#s)"/><rect x="22" y="10" width="26" height="50" rx="13" fill="url(#b)"/><ellipse cx="35" cy="35" rx="9" ry="20" fill="#ff5050" opacity="0.16"/><path d="M24 19 Q35 17 46 19 L44 28 Q35 26 26 28 Z" fill="url(#w)"/><path d="M26 30 L28 30 L27 26 L26.5 26 Z" fill="#ffffff" opacity="0.28"/><path d="M26 42 Q35 40 44 42 L46 51 Q35 49 24 51 Z" fill="url(#w)"/><ellipse cx="20" cy="22" rx="1.6" ry="1.1" fill="#1a1a1a"/><ellipse cx="50" cy="22" rx="1.6" ry="1.1" fill="#1a1a1a"/><rect x="25" y="11" width="6" height="1.6" rx="0.8" fill="#fff5c0"/><rect x="39" y="11" width="6" height="1.6" rx="0.8" fill="#fff5c0"/><rect x="26" y="55" width="18" height="2" rx="1" fill="#ff2828"/><rect x="26" y="55" width="18" height="0.7" rx="0.3" fill="#ffffff" opacity="0.35"/></g></svg>`;
}

export function MapView({
  pickup,
  stops,
  dropoff,
  driverPosition,
  riderPosition,
  nearbyDrivers,
  liveRoute,
  pickupEtaMinutes = null,
  dropoffEtaMinutes = null,
  searching = false,
  searchingUntil = null,
  lockable = true,
  viewer = "rider",
  boarding = null,
  alighting = null,
  corridorLines = null,
  suppressStaticRoute = false,
  className = "h-72 w-full",
}: {
  pickup: Place | null;
  stops: Place[];
  dropoff: Place | null;
  /** Live driver location (broadcast via Supabase Realtime). */
  driverPosition?: LiveDot | null;
  /** Live rider location (broadcast via Supabase Realtime). */
  riderPosition?: LiveDot | null;
  /** Online drivers on the booking-screen map (Phase 2A.4). */
  nearbyDrivers?: FleetDot[];
  /** Renders a "X min" bubble above the pickup pin — typically the
   *  estimated arrival time of the nearest online driver. Null hides
   *  the bubble. */
  pickupEtaMinutes?: number | null;
  /** Renders a "X min · Drop off" bubble above the dropoff pin —
   *  typically the full trip ETA from the fare quote. Null hides
   *  the bubble. */
  dropoffEtaMinutes?: number | null;
  /** When set, the polyline goes driver→pickup or driver→dropoff
   *  depending on `target`, and the driver marker is the car icon. */
  liveRoute?: LiveRoute | null;
  /** Renders a radar-pulse overlay over the map. Used by the
   *  rider's live-trip view while the ride is `requested` and the
   *  matcher is still scanning for a driver. */
  searching?: boolean;
  /** When `searching` is on, optional ISO timestamp for the
   *  request's expiry. The radar overlay renders a countdown ring
   *  + "X:XX left" label, so the rider knows how long they have
   *  before the request auto-cancels. */
  searchingUntil?: string | null;
  /** When true (default), the map is "locked" on mount — gestures
   *  pass through to the page so a finger-swipe past the map scrolls
   *  the document instead of accidentally panning. The user must tap
   *  the map once to enable interaction. After ~3 seconds of map
   *  inactivity it re-locks so a later scroll-past doesn't pan again.
   *  Set false on screens where the map IS the interaction (rare —
   *  most Rajlo maps are informational). */
  lockable?: boolean;
  /** Who's looking at the map. When `"driver"` we suppress:
   *    - The blue rider puck (the driver doesn't need to see their
   *      own car represented twice, and the rider's separate puck
   *      isn't relevant on the driver's console)
   *    - The "Driver / You" legend strip in the bottom-left
   *  Defaults to `"rider"` for backwards compatibility with every
   *  existing rider call-site. */
  viewer?: "driver" | "rider";
  /** Where the rider physically boards the route taxi (mid-corridor
   *  projection from the pathfinder). When non-null, an orange "B"
   *  pin is dropped on the map at this point. */
  boarding?: {
    coords: { lat: number; lng: number };
    /** Walking distance from the rider's typed pickup to the
     *  boarding point. Riders are gated to ≤ MAX_HAILABLE_WALK_KM
     *  (~1 km) so this is informational only — the map no longer
     *  draws a walking line, which was visual clutter at this scale. */
    walkKm?: number;
  } | null;
  /** Where the rider alights from the last leg. Symmetric to
   *  `boarding` — teal "A" pin at the alighting projection point. */
  alighting?: {
    coords: { lat: number; lng: number };
    walkKm?: number;
  } | null;
  /** Solid red polylines representing the route taxi's corridor(s).
   *  One entry per leg — each segment runs from the corridor's
   *  origin endpoint to its destination endpoint (straight-line
   *  approximation for now; future iterations can substitute the
   *  Google Directions polyline for accuracy where roads bend). */
  corridorLines?: Array<{
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  }> | null;
  /** When true, the private-ride visualisation is suppressed:
   *    - the red gradient polyline is not drawn,
   *    - the lettered pickup/dropoff markers (A/B/C…) are not drawn,
   *    - bounds-fit is delegated entirely to the route-taxi overlay
   *      effect (so the corridor amber line + B/A pins decide the
   *      viewport).
   *  Set this when the page is showing the rider's Route Taxi quote.
   *  Without it, the red road-following polyline overlays the amber
   *  corridor line and makes the map a confusing soup. */
  suppressStaticRoute?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  // ETA bubble markers (pickup "3 min", dropoff "12 min · Drop off").
  // Tracked in their own ref so they can refresh on every nearest-driver
  // poll without forcing the route/Directions effect to re-run.
  const pickupBubbleRef = useRef<google.maps.Marker | null>(null);
  const dropoffBubbleRef = useRef<google.maps.Marker | null>(null);
  // Last bubble text we rendered, per pin. Lets us call setIcon ONLY
  // when the displayed value actually changed — every setIcon call
  // re-decodes the SVG data URL, so we skip when we can.
  const pickupBubbleTextRef = useRef<string | null>(null);
  const dropoffBubbleTextRef = useRef<string | null>(null);
  // Static polyline (pickup → stops → dropoff). Hidden when `liveRoute`
  // is engaged — the live route has its own polyline.
  // Multiple polylines now: the route is rendered as ~18 short
  // segments each with a slightly darker shade of red so the visible
  // line gradients from brand red at pickup (A) to deep crimson at
  // dropoff (B). Same logic for `livePolylineRef`.
  const polylineRef = useRef<google.maps.Polyline[]>([]);
  // Signature of the last route we drew, so we can skip the tear-down
  // + Directions re-fetch when a polling parent re-renders with the
  // same pickup / stops / dropoff content but new array/object refs.
  // Without this guard the polyline visibly blinked every 8s on any
  // live-polling surface (admin live-trips, alert detail, etc.).
  const lastRouteSignatureRef = useRef<string>("");
  // Live route polyline (driver → target). Tracked separately so the
  // static-route effect doesn't accidentally clear it on every status flip.
  const livePolylineRef = useRef<google.maps.Polyline[]>([]);
  // Route taxi boarding / alighting overlays — added by the
  // corridor-aware pathfinder. The B / A pins land at the rider's
  // mid-corridor projection points; the corridor polylines visualise
  // which roads the taxi runs on; the walking polylines (dashed
  // grey) connect rider's typed pickup → boarding and alighting →
  // typed dropoff so the rider sees the full sequence on the map.
  const boardingMarkerRef = useRef<google.maps.Marker | null>(null);
  const alightingMarkerRef = useRef<google.maps.Marker | null>(null);
  const corridorPolylineRef = useRef<google.maps.Polyline[]>([]);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  // Live-position markers are tracked separately so they don't get wiped
  // when the route refreshes.
  const driverDotRef = useRef<google.maps.Marker | null>(null);
  const riderDotRef = useRef<google.maps.Marker | null>(null);
  // Soft accuracy halo drawn under the rider dot — gives the puck the
  // Google-Maps look the rider asked for instead of a bare circle.
  const riderHaloRef = useRef<google.maps.Circle | null>(null);
  // Bucket of the currently-rendered heading so we only swap the SVG
  // when the bucket actually moves (cuts setIcon thrash from every
  // sensor reading down to "user has rotated ≥10°").
  const riderHeadingBucketRef = useRef<number>(-1);
  // Driver heading state — derived from successive driverPosition values.
  // Held in refs so the marker effect can update icon rotation without
  // re-running the whole effect just because the heading number changed.
  const prevDriverPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const driverHeadingRef = useRef<number>(0);
  const driverIconBucketRef = useRef<number>(-1);
  // Live-route bookkeeping — we only refetch the Directions polyline
  // when the driver has drifted significantly OR the target has flipped.
  // Without this, the 5s GPS heartbeat would fire a Directions call
  // every tick, which is wasteful and makes the polyline flicker.
  const liveRouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const liveRouteTargetRef = useRef<"pickup" | "dropoff" | null>(null);
  // Fleet markers — keyed by driverId so we move/dispose them in place
  // instead of recreating every render. Smoother and avoids the
  // marker-creation flash when positions update. We also remember each
  // marker's current rotation bucket so we only call setIcon when the
  // heading actually changes — setIcon swaps the data URL and forces an
  // image re-decode, so we want to skip it whenever possible.
  const fleetMarkersRef = useRef<
    Map<string, { marker: google.maps.Marker; iconBucket: number }>
  >(new Map());
  // Surfaced if loadGoogleMaps rejects — gives the user something visible
  // instead of an opaque blank rectangle (the most common cause is API key
  // referrer restrictions not allowing the host the browser is on).
  const [loadError, setLoadError] = useState<string | null>(null);
  // Flips true once `mapRef.current` is constructed. The marker/route
  // effect lists this in its deps so it re-runs after the async Maps
  // SDK load completes — without this, on pages where the props never
  // change again (e.g. /rider/history/[id]), the first effect run
  // would beat the SDK load and return early, and the markers + route
  // would never get drawn (only the bare map tiles would render).
  const [mapReady, setMapReady] = useState(false);
  // Click-to-activate lock. True (locked) by default — overlay swallows
  // touches/wheel events so finger-swipes past the map don't pan it on
  // mobile, and mouse-wheel doesn't accidentally zoom on desktop. Tap
  // the overlay to unlock. Auto re-locks after `RELOCK_AFTER_MS` of
  // map inactivity so a later scroll-past behaves the same way.
  const [locked, setLocked] = useState(lockable);
  const relockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pseudo-fullscreen — `position: fixed` over the viewport rather
  // than the browser Fullscreen API. The native API doesn't work on
  // iOS Safari for non-<video> elements, and the fixed-position
  // approach lets us render our own close button + keeps the same
  // CSS theming as the inline map.
  const [fullscreen, setFullscreen] = useState(false);
  // Locate-me button state. `locating` flips on while we're waiting on
  // the device GPS so we can swap the icon for a spinner — getting
  // an A-GPS fix on a cold start can take 1-3s and silent button
  // taps feel broken.
  const [locating, setLocating] = useState(false);
  // Follow-the-car mode. When ON, the map auto-pans on every new
  // driver-position broadcast so the car stays centered as it
  // moves — the standard navigation-app feel. Turns OFF the moment
  // the user manually drags the map (so they can explore without
  // it snapping back), and back ON when they tap the locate-me
  // button. Default ON because most page-loads land on a moving
  // trip where the centered behaviour is wanted.
  const followModeRef = useRef(true);
  // Internal "self GPS" state — populated when the user taps the
  // locate-me button on a page that doesn't otherwise feed riderPosition
  // (e.g. the rider booking screen). The puck renders from
  // `riderPosition ?? selfPosition`, so streamed positions always win
  // but a one-tap locate still produces a visible blue dot.
  const [selfPosition, setSelfPosition] = useState<LiveDot | null>(null);
  // Active watchPosition id while continuous tracking is on. Set the
  // moment locate-me succeeds; cleared on unmount.
  const selfWatchIdRef = useRef<number | null>(null);
  // Tracks whether the locate-me tap has already done its one-shot
  // pan + zoom for this watch session. Without this, the watchPosition
  // callback's stale closure kept seeing `locating === true` on every
  // subsequent fix and re-panned/re-zoomed the map on every GPS
  // heartbeat — what the driver saw as "rolling and rolling and rolling".
  const selfFirstPanDoneRef = useRef(false);

  const handleLocate = () => {
    const map = mapRef.current;
    if (!map) return;

    // Re-arm follow-mode — the user explicitly asked to be centered,
    // so the next position update should keep them centered too.
    followModeRef.current = true;

    // Prefer the live-broadcast position (already on the map, no
    // permission round-trip, no GPS wait) before asking the device.
    // The component is used by both driver and rider surfaces so we
    // accept either side's streamed location as "me" and only fall
    // back to navigator.geolocation if neither is available.
    //
    // ALSO check selfPosition — if the user has already tapped locate
    // once on this page and we've been watching their GPS since, we
    // already have a fresh fix sitting in state. Use it for the
    // pan and skip the second permission round-trip.
    const streamed = driverPosition ?? riderPosition ?? selfPosition;
    if (streamed) {
      map.panTo({ lat: streamed.lat, lng: streamed.lng });
      map.setZoom(Math.max(map.getZoom() ?? 9, 16));
      // Unlock interactions so the next pinch/drag doesn't have to
      // dismiss the lock overlay first.
      setLocked(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    // Re-arm the "do the one-shot pan on the next fix" gate for this
    // tap. The watchPosition callback below reads this ref (NOT React
    // state, because the callback's closure outlives state updates)
    // and only performs the pan-once on the very next fix it sees.
    selfFirstPanDoneRef.current = false;
    // Start a continuous watch (not a one-shot fix) so the puck moves
    // as the user moves — Google-Maps-style "follow me" once locate
    // is engaged. Pan happens on the FIRST fix; subsequent fixes just
    // update selfPosition + the puck re-renders. If a watch is already
    // running we don't double-start; we just re-arm the pan ref so the
    // next fix recenters.
    const onFix = (pos: GeolocationPosition) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      setSelfPosition(next);
      const m = mapRef.current;
      if (m && !selfFirstPanDoneRef.current) {
        selfFirstPanDoneRef.current = true;
        m.panTo(next);
        m.setZoom(Math.max(m.getZoom() ?? 9, 16));
        setLocked(false);
        setLocating(false);
      }
    };
    const onErr = () => {
      setLocating(false);
      // Don't kill the watch on a single error — transient timeouts
      // happen indoors. The next event might land just fine.
    };
    if (selfWatchIdRef.current == null) {
      selfWatchIdRef.current = navigator.geolocation.watchPosition(
        onFix,
        onErr,
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
      );
    }
    // If a watch is already running, the `selfFirstPanDoneRef = false`
    // we set above means the next fix the watch already produces will
    // re-pan. No need to fire a separate getCurrentPosition.
  };

  // Stop the self-GPS watch on unmount so we're not holding the
  // location sensor open across page navigations.
  useEffect(() => {
    return () => {
      if (
        selfWatchIdRef.current != null &&
        typeof navigator !== "undefined" &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(selfWatchIdRef.current);
        selfWatchIdRef.current = null;
      }
    };
  }, []);

  // Init map + DirectionsService once. We retry once on a small delay if
  // the container isn't sized yet — that happens on iOS Safari when the
  // map is rendered inside a sliding/transitioning ancestor.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;

        // If the container has 0 width on mount (some flex/animation
        // ancestors collapse momentarily), wait one frame then retry.
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          retryTimer = setTimeout(init, 80);
          return;
        }

        mapRef.current = new g.maps.Map(el, {
          center: JAMAICA_CENTER,
          zoom: 9,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: MAP_STYLE,
        });
        directionsServiceRef.current = new g.maps.DirectionsService();
        // Any user-driven drag disables follow-the-car mode — the
        // driver/rider is explicitly looking at a different area, so
        // we don't want the next position broadcast to yank them
        // back. Re-arm follow when they tap the locate-me button.
        // We check ev.domEvent so programmatic panTo() calls don't
        // count as user drags (those have no DOM event).
        mapRef.current.addListener("dragstart", (ev: { domEvent?: Event }) => {
          if (ev?.domEvent) followModeRef.current = false;
        });
        // Wake up any effects waiting for the map to exist (markers,
        // polyline, fleet dots, live-route).
        setMapReady(true);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        // eslint-disable-next-line no-console
        console.error("[MapView] Google Maps failed to load:", msg);
        setLoadError(msg);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Re-render markers + (optionally) static route + bounds whenever the
  // waypoints change. When `liveRoute` is engaged, we still draw the
  // pickup/stops/dropoff markers, but skip the static polyline + bounds
  // — the live-route effect below owns those.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (typeof window === "undefined" || !window.google) return;

    // Build content-only signature so we can early-out when a polling
    // parent re-rendered with new prop refs but the actual route is
    // unchanged. Coords rounded to 6dp (≈11cm precision — well below
    // any meaningful route change).
    const fmt = (p: Place) =>
      `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const signature = [
      pickup ? `p:${fmt(pickup)}` : "p:",
      stops.map((s, i) => `s${i}:${fmt(s)}`).join("|"),
      dropoff ? `d:${fmt(dropoff)}` : "d:",
      liveRoute ? "live" : "static",
      suppressStaticRoute ? "supp" : "show",
    ].join("|");
    if (
      signature === lastRouteSignatureRef.current &&
      // Only short-circuit if we've actually drawn the previous run's
      // overlays — otherwise the very first render after mapReady
      // would skip drawing because the signature was already set.
      (polylineRef.current.length > 0 ||
        liveRoute ||
        markersRef.current.length > 0)
    ) {
      return;
    }
    lastRouteSignatureRef.current = signature;

    // Wipe previous overlays.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylineRef.current.forEach((p) => p.setMap(null));
    polylineRef.current = [];

    // Route-taxi mode owns the visuals. Skip the lettered ABCD
    // markers and the red road-following polyline entirely — they
    // would overlay the amber corridor line and the orange/teal
    // boarding/alighting pins, turning the map into a confusing
    // soup. The route-taxi overlay effect handles markers + bounds.
    if (suppressStaticRoute) {
      return;
    }

    const points: { place: Place; label: string }[] = [];
    if (pickup) points.push({ place: pickup, label: "A" });
    stops.forEach((s, i) =>
      points.push({ place: s, label: String.fromCharCode(66 + i) }),
    );
    if (dropoff)
      points.push({
        place: dropoff,
        label: String.fromCharCode(65 + 1 + stops.length),
      });

    if (points.length === 0) {
      map.setCenter(JAMAICA_CENTER);
      map.setZoom(9);
      return;
    }

    // Drop the markers immediately — they don't depend on the route call.
    // While `liveRoute` is active we drop the pickup pin too while
    // in_progress (the rider has already been picked up; that pin would
    // be stale clutter). The dropoff stays visible as the destination.
    points.forEach(({ place, label }, i) => {
      const isPickup = i === 0;
      const isDropoff = i === points.length - 1 && points.length > 1;
      // Hide the pickup pin once the trip is in progress.
      if (liveRoute?.target === "dropoff" && isPickup) return;
      const marker = new google.maps.Marker({
        map,
        position: { lat: place.lat, lng: place.lng },
        label: {
          text: label,
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "12px",
        },
        // Pickup (A) uses the gradient START colour, dropoff (B) uses
        // the END colour — so the endpoints match the shades the
        // gradient polyline transitions between. Intermediate stops
        // stay Rajlo-black for clear visual separation.
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: isDropoff
            ? ROUTE_COLOR_END
            : isPickup
              ? ROUTE_COLOR_START
              : "#111906",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      markersRef.current.push(marker);
    });

    if (points.length === 1) {
      map.setCenter({ lat: points[0].place.lat, lng: points[0].place.lng });
      map.setZoom(14);
      return;
    }

    // When liveRoute is engaged, the live-route effect draws + fits its
    // own polyline. We're done after dropping the markers.
    if (liveRoute) return;

    // Two or more points → ask Google for a road-following route.
    // Token marker we use to ignore stale responses if the points change
    // again before the API call resolves.
    let cancelled = false;

    const drawStraightLineFallback = () => {
      if (cancelled) return;
      polylineRef.current = drawGradientPolyline(
        map,
        points.map((p) => ({ lat: p.place.lat, lng: p.place.lng })),
        4,
      );
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) =>
        bounds.extend({ lat: p.place.lat, lng: p.place.lng }),
      );
      map.fitBounds(bounds, { top: 56, right: 56, bottom: 56, left: 56 });
    };

    const service = directionsServiceRef.current;
    if (!service) {
      // Should not happen — DirectionsService is initialised with the map.
      drawStraightLineFallback();
      return;
    }

    const origin = points[0].place;
    const destination = points[points.length - 1].place;
    const waypoints = points.slice(1, -1).map((p) => ({
      location: new google.maps.LatLng(p.place.lat, p.place.lng),
      stopover: true,
    }));

    service
      .route({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        // Don't reorder — the rider's stop sequence is intentional (e.g.
        // pickup BBQ before dropping the friend at home).
        optimizeWaypoints: false,
      })
      .then((response) => {
        if (cancelled) return;
        const route = response.routes[0];
        if (!route) {
          drawStraightLineFallback();
          return;
        }
        // Full-resolution road geometry (not the simplified
        // overview_path) so the line bends with every curve. Rendered
        // as a gradient strip (brand red → deep crimson) so the rider
        // can read direction from the colour alone.
        polylineRef.current = drawGradientPolyline(
          map,
          fullRoutePath(route),
          5,
        );
        // Use the route's own bounds — tighter than fitting to stops alone.
        if (route.bounds) {
          map.fitBounds(route.bounds, {
            top: 56,
            right: 56,
            bottom: 56,
            left: 56,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Most common: ZERO_RESULTS for an over-water/un-routable pair, or
        // API not enabled. Surface a straight line so the user still sees
        // *something* connecting their points.
        // eslint-disable-next-line no-console
        console.warn("[MapView] Directions request failed:", err);
        drawStraightLineFallback();
      });

    return () => {
      cancelled = true;
    };
  }, [pickup, stops, dropoff, liveRoute, mapReady, suppressStaticRoute]);

  // Floating ETA bubbles above the pickup + dropoff pins. Lives in its
  // own effect so a nearest-driver-ETA tick can refresh the bubble
  // without forcing a Directions API re-fetch on the route effect.
  // The bubble is a separate Marker so it reprojects with the map and
  // stays anchored to the pin's lat/lng under pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || !window.google) return;

    // Pickup bubble — hidden once the trip is in progress (the rider
    // has already been picked up so an "X min away" pickup hint is
    // stale clutter at that point).
    const pickupHidden = liveRoute?.target === "dropoff";
    const pickupText =
      pickup && pickupEtaMinutes != null && !pickupHidden
        ? formatEta(pickupEtaMinutes)
        : null;
    if (pickupText && pickup) {
      if (!pickupBubbleRef.current) {
        pickupBubbleRef.current = new google.maps.Marker({
          map,
          position: { lat: pickup.lat, lng: pickup.lng },
          icon: buildBubbleIcon(pickupText, "red"),
          zIndex: 50,
          clickable: false,
        });
        pickupBubbleTextRef.current = pickupText;
      } else {
        pickupBubbleRef.current.setPosition({
          lat: pickup.lat,
          lng: pickup.lng,
        });
        if (pickupBubbleTextRef.current !== pickupText) {
          pickupBubbleRef.current.setIcon(buildBubbleIcon(pickupText, "red"));
          pickupBubbleTextRef.current = pickupText;
        }
      }
    } else {
      pickupBubbleRef.current?.setMap(null);
      pickupBubbleRef.current = null;
      pickupBubbleTextRef.current = null;
    }

    // Dropoff bubble — always renders when we have a dropoff + ETA.
    const dropoffText =
      dropoff && dropoffEtaMinutes != null
        ? `${formatEta(dropoffEtaMinutes)} · Drop off`
        : null;
    if (dropoffText && dropoff) {
      if (!dropoffBubbleRef.current) {
        dropoffBubbleRef.current = new google.maps.Marker({
          map,
          position: { lat: dropoff.lat, lng: dropoff.lng },
          icon: buildBubbleIcon(dropoffText, "red"),
          zIndex: 50,
          clickable: false,
        });
        dropoffBubbleTextRef.current = dropoffText;
      } else {
        dropoffBubbleRef.current.setPosition({
          lat: dropoff.lat,
          lng: dropoff.lng,
        });
        if (dropoffBubbleTextRef.current !== dropoffText) {
          dropoffBubbleRef.current.setIcon(
            buildBubbleIcon(dropoffText, "red"),
          );
          dropoffBubbleTextRef.current = dropoffText;
        }
      }
    } else {
      dropoffBubbleRef.current?.setMap(null);
      dropoffBubbleRef.current = null;
      dropoffBubbleTextRef.current = null;
    }
  }, [pickup, dropoff, pickupEtaMinutes, dropoffEtaMinutes, liveRoute, mapReady]);

  // Live-route polyline: driver → pickup (or driver → dropoff). Refetches
  // the Directions polyline only when the driver has moved significantly
  // OR the target has flipped — moving the marker every 5s is fine, but
  // refetching the route every 5s would burn API budget and look jittery.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || !window.google) return;

    // Tear down when liveRoute is disengaged or there's no driver pos.
    if (!liveRoute || !driverPosition) {
      livePolylineRef.current.forEach((p) => p.setMap(null));
      livePolylineRef.current = [];
      liveRouteOriginRef.current = null;
      liveRouteTargetRef.current = null;
      return;
    }

    const target = liveRoute.target === "pickup" ? pickup : dropoff;
    if (!target) return;

    const driverLatLng = {
      lat: driverPosition.lat,
      lng: driverPosition.lng,
    };
    const targetChanged = liveRouteTargetRef.current !== liveRoute.target;
    const movedFar =
      !liveRouteOriginRef.current ||
      approxDistanceMeters(liveRouteOriginRef.current, driverLatLng) >
        LIVE_ROUTE_REFRESH_THRESHOLD_M;

    if (!targetChanged && !movedFar && livePolylineRef.current.length > 0) {
      // Driver moved but only slightly — leave the existing polyline in
      // place. The car marker still updates via the driverPosition effect.
      return;
    }

    liveRouteOriginRef.current = driverLatLng;
    liveRouteTargetRef.current = liveRoute.target;

    const service = directionsServiceRef.current;
    if (!service) return;
    let cancelled = false;

    service
      .route({
        origin: driverLatLng,
        destination: { lat: target.lat, lng: target.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      })
      .then((response) => {
        if (cancelled) return;
        const route = response.routes[0];
        if (!route) return;
        // Replace previous live polyline segments with the new gradient
        // strip. driver→target reads brand red at the car, deepening
        // to the pickup/dropoff pin's colour at the far end.
        livePolylineRef.current.forEach((p) => p.setMap(null));
        livePolylineRef.current = drawGradientPolyline(
          map,
          fullRoutePath(route),
          5,
        );
        // Fit the camera to driver+target the first time we draw the
        // route OR when the target changes. Subsequent refetches keep
        // the user's existing pan/zoom — they may have zoomed in
        // intentionally.
        if (targetChanged) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(driverLatLng);
          bounds.extend({ lat: target.lat, lng: target.lng });
          map.fitBounds(bounds, { top: 80, right: 60, bottom: 80, left: 60 });
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[MapView] Live Directions request failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [liveRoute, driverPosition, pickup, dropoff, mapReady]);

  // Live driver position — rendered as the same car icon used for the
  // fleet view. Marker is reused across updates so the move feels smooth.
  // Heading is computed from successive positions (the browser's
  // `coords.heading` is null on most desktops and unreliable on
  // stationary mobile, so we derive it ourselves). When the driver
  // hasn't really moved (under 10m of jitter) we hold the previous
  // heading so a parked car keeps facing the way it last drove.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || !window.google) return;
    if (!driverPosition) {
      driverDotRef.current?.setMap(null);
      driverDotRef.current = null;
      prevDriverPosRef.current = null;
      driverIconBucketRef.current = -1;
      return;
    }
    const pos = { lat: driverPosition.lat, lng: driverPosition.lng };

    // Compute / refresh the heading.
    const prev = prevDriverPosRef.current;
    if (prev) {
      const moved = approxDistanceMeters(prev, pos);
      if (moved >= 10) {
        driverHeadingRef.current = computeBearing(prev, pos);
        prevDriverPosRef.current = pos;
      }
      // If we moved less than 10m, leave both prev pos and heading alone
      // — small GPS drift shouldn't repoint the car.
    } else {
      prevDriverPosRef.current = pos;
    }

    const heading = driverHeadingRef.current;
    const bucket =
      typeof heading === "number"
        ? (((Math.round(heading / 10) * 10) % 360) + 360) % 360
        : 0;

    if (!driverDotRef.current) {
      driverDotRef.current = new google.maps.Marker({
        map,
        position: pos,
        zIndex: 999,
        icon: buildCarIcon(heading),
        title: "Driver",
      });
      driverIconBucketRef.current = bucket;
    } else {
      driverDotRef.current.setPosition(pos);
      // Only re-set the icon when the rotation bucket actually changed —
      // setIcon swaps the data URL and forces an image re-decode.
      if (driverIconBucketRef.current !== bucket) {
        driverDotRef.current.setIcon(buildCarIcon(heading));
        driverIconBucketRef.current = bucket;
      }
    }

    // Follow-the-car: pan the map to keep the driver marker centered
    // as the car moves, the way every native navigation app behaves.
    // We don't touch zoom — the user's current zoom level is theirs to
    // control. Skipped only when the user has manually dragged (the
    // `dragstart` listener flips followModeRef.current=false) or while
    // the searching radar overlay owns the map. Crucially we DON'T
    // gate on `locked` — the lock overlay blocks user gestures (so a
    // finger-swipe doesn't accidentally pan the map past the page),
    // but our own programmatic panTo is exactly the thing the lock
    // was supposed to leave alone. Earlier code gated on it and froze
    // the map under the "Tap to interact" pill.
    if (followModeRef.current && !searching) {
      map.panTo(pos);
    }
  }, [driverPosition, searching]);

  // Fleet markers (Phase 2A.4 — nearby online drivers on booking screen).
  // We diff against the previous set: existing driverIds get setPosition,
  // new ones get a fresh Marker, and gone ones get removed from the map.
  // The marker is a coloured car SVG; rotation follows browser heading
  // when available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || !window.google) return;

    const incoming = nearbyDrivers ?? [];
    const incomingIds = new Set(incoming.map((d) => d.driverId));

    // Drop markers for drivers no longer in the fleet snapshot.
    // Defensive against HMR: when the shape of `fleetMarkersRef`'s
    // entries changes (e.g. we wrapped raw Markers in `{marker, ...}`
    // for the rotation cache), the ref can survive the hot reload with
    // entries in the OLD shape. Optional-chain so we don't crash, and
    // fall through to delete stale entries either way.
    for (const [id, entry] of fleetMarkersRef.current) {
      if (!incomingIds.has(id)) {
        entry?.marker?.setMap(null);
        fleetMarkersRef.current.delete(id);
      }
    }

    const headingToBucket = (h: number | null | undefined) =>
      typeof h === "number"
        ? (((Math.round(h / 10) * 10) % 360) + 360) % 360
        : 0;

    // Add or move markers for currently-online drivers.
    incoming.forEach((d) => {
      const existing = fleetMarkersRef.current.get(d.driverId);
      const position = { lat: d.lat, lng: d.lng };
      const desiredBucket = headingToBucket(d.heading);

      if (existing && existing.marker) {
        existing.marker.setPosition(position);
        // Only re-set the icon when the rotation bucket actually
        // changed — setIcon forces a data-URL decode, which is wasted
        // work when the heading hasn't moved.
        if (existing.iconBucket !== desiredBucket) {
          existing.marker.setIcon(buildCarIcon(d.heading));
          existing.iconBucket = desiredBucket;
        }
      } else {
        const marker = new google.maps.Marker({
          map,
          position,
          icon: buildCarIcon(d.heading),
          title: "Driver online",
          // Below the active ride driver dot but above the route polyline.
          zIndex: 500,
          // Keep them out of the way of the rider clicking on the map.
          clickable: false,
        });
        fleetMarkersRef.current.set(d.driverId, {
          marker,
          iconBucket: desiredBucket,
        });
      }
    });
  }, [nearbyDrivers]);

  // Compass heading from DeviceOrientationEvent — drives the cone of
  // sight on the rider puck. Two filters keep the cone from glitching:
  //   1. Only ABSOLUTE readings (deviceorientationabsolute on Android,
  //      webkitCompassHeading on iOS). Relative-heading events are
  //      ignored because their alpha is zeroed to whatever orientation
  //      the page loaded with — useless as a compass.
  //   2. Low-pass EMA (0.3 factor, shortest-arc lerp so 359→1 doesn't
  //      spin the long way around) + 5° change threshold before
  //      committing to state.
  const [riderHeading, setRiderHeading] = useState<number | null>(null);
  const smoothedHeadingRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = (e: DeviceOrientationEvent) => {
      const w = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        absolute?: boolean;
      };
      let raw: number | null = null;
      if (typeof w.webkitCompassHeading === "number") {
        raw = w.webkitCompassHeading;
      } else if (e.type === "deviceorientationabsolute" || w.absolute) {
        if (typeof e.alpha === "number") {
          raw = (360 - e.alpha) % 360;
        }
      }
      if (raw == null) return;
      const prev = smoothedHeadingRef.current;
      let smoothed: number;
      if (prev == null) {
        smoothed = raw;
      } else {
        let delta = raw - prev;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        smoothed = (prev + delta * 0.3 + 360) % 360;
      }
      smoothedHeadingRef.current = smoothed;
      setRiderHeading((current) => {
        if (current == null) return smoothed;
        let diff = Math.abs(smoothed - current);
        if (diff > 180) diff = 360 - diff;
        return diff >= 5 ? smoothed : current;
      });
    };
    window.addEventListener(
      "deviceorientationabsolute",
      handle as EventListener,
    );
    window.addEventListener("deviceorientation", handle as EventListener);
    return () => {
      window.removeEventListener(
        "deviceorientationabsolute",
        handle as EventListener,
      );
      window.removeEventListener(
        "deviceorientation",
        handle as EventListener,
      );
    };
  }, []);

  // Live rider position — Google-Maps-style "you are here" puck:
  // soft blue accuracy halo + white-ringed blue dot + a radial-gradient
  // cone fanning out in the direction the device is facing. Streamed
  // riderPosition wins when present; falls back to selfPosition
  // (one-tap locate-me on a booking screen where nothing is streaming
  // yet). Hidden during `in_progress` because the rider is physically
  // INSIDE the moving car at that point — the car icon (driverPosition)
  // already represents them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || !window.google) return;
    const ridingInCar = liveRoute?.target === "dropoff";
    // Suppress the rider puck entirely when the map is shown to a
    // driver — they asked for the blue dot/halo/cone removed from
    // their console. Streamed riderPosition (Realtime) otherwise
    // wins; selfPosition is the one-tap locate-me fallback when no
    // realtime stream exists yet (rider booking screen).
    const source =
      viewer === "driver" ? null : riderPosition ?? selfPosition;
    if (!source || ridingInCar) {
      riderDotRef.current?.setMap(null);
      riderDotRef.current = null;
      riderHaloRef.current?.setMap(null);
      riderHaloRef.current = null;
      return;
    }
    const pos = { lat: source.lat, lng: source.lng };

    // Soft accuracy halo (drawn first so it sits under the dot).
    if (!riderHaloRef.current) {
      riderHaloRef.current = new google.maps.Circle({
        map,
        center: pos,
        radius: 35,
        fillColor: "#1d4ed8",
        fillOpacity: 0.12,
        strokeWeight: 0,
        clickable: false,
        zIndex: 990,
      });
    } else {
      riderHaloRef.current.setCenter(pos);
    }

    // Dot + cone — bucketed 10° icon cache.
    const bucket =
      riderHeading == null
        ? -1
        : (((Math.round(riderHeading / 10) * 10) % 360) + 360) % 360;
    if (!riderDotRef.current) {
      riderDotRef.current = new google.maps.Marker({
        map,
        position: pos,
        zIndex: 998,
        icon: buildRiderIcon(bucket),
        title: "You",
      });
      riderHeadingBucketRef.current = bucket;
    } else {
      riderDotRef.current.setPosition(pos);
      if (riderHeadingBucketRef.current !== bucket) {
        riderDotRef.current.setIcon(buildRiderIcon(bucket));
        riderHeadingBucketRef.current = bucket;
      }
    }

    // NOTE: we deliberately do NOT auto-pan to the rider puck. The
    // rider standing still (or walking around the booking screen)
    // shouldn't drag the map with them — that hijacks their view of
    // the pickup/dropoff/nearby drivers they're trying to look at.
    // Auto-follow is reserved for the CAR icon (driverPosition effect
    // above) since "the car is moving on the road" is the only state
    // where centering the map on a marker is what the user wants.
    // The rider can still tap the locate-me button to recenter.
  }, [riderPosition, selfPosition, riderHeading, liveRoute, searching, viewer]);

  // ─────────────────────── Route-taxi overlays ───────────────────────
  // Boarding / alighting pins + corridor polyline + dashed walking
  // lines. Driven by the corridor-aware pathfinder on the rider's
  // request page. Rendered on top of the static-route polyline so a
  // rider browsing a route taxi quote sees the full sequence at a
  // glance: typed pickup → walk → boarding pin → corridor → alight
  // pin → walk → typed dropoff.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || !window.google) return;

    // Tear down whatever was rendered last time. Cheap — at most one
    // marker per kind + a small polyline array.
    boardingMarkerRef.current?.setMap(null);
    boardingMarkerRef.current = null;
    alightingMarkerRef.current?.setMap(null);
    alightingMarkerRef.current = null;
    corridorPolylineRef.current.forEach((p) => p.setMap(null));
    corridorPolylineRef.current = [];

    if (!boarding && !alighting && (!corridorLines || corridorLines.length === 0)) {
      return;
    }

    // 1. Corridor lines — solid amber polylines distinct from the
    //    main red route polyline. We pick amber so the rider's eye
    //    reads it as "the taxi's road" not "your destination". One
    //    polyline per leg.
    //
    //    Each segment draws an immediate straight-line fallback so
    //    the corridor appears instantly, then upgrades to the actual
    //    road-following polyline once DirectionsService responds.
    //    The road polyline is cached module-scoped so subsequent
    //    quotes through the same corridor hit zero Directions calls.
    if (corridorLines && corridorLines.length > 0) {
      const ds = directionsServiceRef.current;
      for (const seg of corridorLines) {
        const key = corridorCacheKey(seg.from, seg.to);
        const cached = corridorPolylineCache.get(key);
        const initialPath: google.maps.LatLngLiteral[] = cached ?? [
          { lat: seg.from.lat, lng: seg.from.lng },
          { lat: seg.to.lat, lng: seg.to.lng },
        ];
        const line = new google.maps.Polyline({
          map,
          path: initialPath,
          strokeColor: "#f59e0b", // amber-500 — distinct from route red
          strokeOpacity: 0.85,
          strokeWeight: 5,
          zIndex: 50,
        });
        corridorPolylineRef.current.push(line);

        // Cache miss → ask Directions for the actual road polyline.
        // We capture the polyline ref in the closure so we can swap
        // its path when the response arrives. Skip if the polyline
        // was torn down by a prop change in the meantime (getMap()
        // returns null after setMap(null)).
        if (!cached && ds) {
          const polyline = line;
          ds.route(
            {
              origin: seg.from,
              destination: seg.to,
              travelMode: google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              if (
                status !== google.maps.DirectionsStatus.OK ||
                !result?.routes?.[0]
              ) {
                // Straight line stays — better than nothing if
                // Directions is rate-limited or the corridor doesn't
                // resolve to a road route.
                return;
              }
              // Stitch every step's full path instead of using
              // `overview_path`. The overview is Google's simplified
              // geometry — it drops vertices, so long corridors
              // visibly "cut corners" and read as straight diagonals
              // that don't match the visible road. Step paths bend
              // with every curve. Same approach as the private-ride
              // polyline via fullRoutePath().
              const route = result.routes[0];
              const points: { lat: number; lng: number }[] = [];
              for (const leg of route.legs ?? []) {
                for (const step of leg.steps ?? []) {
                  for (const pt of step.path ?? []) {
                    points.push({ lat: pt.lat(), lng: pt.lng() });
                  }
                }
              }
              const finalPoints =
                points.length > 1
                  ? points
                  : route.overview_path.map((p) => ({
                      lat: p.lat(),
                      lng: p.lng(),
                    }));
              corridorPolylineCache.set(key, finalPoints);
              if (polyline.getMap()) {
                polyline.setPath(finalPoints);
              }
            },
          );
        }
      }
    }

    // (Walking polylines removed — riders are now gated to ≤ 1 km
    //  walk via MAX_HAILABLE_WALK_KM, so the boarding pin sits
    //  essentially at the rider's pickup. A dashed line connecting
    //  two near-overlapping pins added clutter and confused users.)

    // 4. Boarding pin — orange disc with "B" label. Sits at the
    //    rider's projected board point on the corridor.
    if (boarding) {
      boardingMarkerRef.current = new google.maps.Marker({
        map,
        position: { lat: boarding.coords.lat, lng: boarding.coords.lng },
        label: {
          text: "B",
          color: "#ffffff",
          fontWeight: "800",
          fontSize: "12px",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: "#f97316", // orange-500
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "Board the route taxi here",
        zIndex: 70,
      });
    }

    // 5. Alighting pin — teal disc with "A" label. Distinct hue
    //    from the boarding orange so the rider can tell at a glance
    //    which pin is which.
    if (alighting) {
      alightingMarkerRef.current = new google.maps.Marker({
        map,
        position: {
          lat: alighting.coords.lat,
          lng: alighting.coords.lng,
        },
        label: {
          text: "A",
          color: "#ffffff",
          fontWeight: "800",
          fontSize: "12px",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: "#0d9488", // teal-600
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "Alight from the route taxi here",
        zIndex: 70,
      });
    }

    // 6. Re-fit bounds to include every overlay we just dropped.
    //    The static-route effect ran first and fit to pickup → stops
    //    → dropoff; without this re-fit the corridor + boarding pins
    //    could land off-screen (especially for long inter-parish
    //    corridors that extend well past the rider's typed A→B
    //    bounds).
    const bounds = new google.maps.LatLngBounds();
    let extended = false;
    if (pickup) {
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
      extended = true;
    }
    if (dropoff) {
      bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
      extended = true;
    }
    if (boarding) {
      bounds.extend({
        lat: boarding.coords.lat,
        lng: boarding.coords.lng,
      });
      extended = true;
    }
    if (alighting) {
      bounds.extend({
        lat: alighting.coords.lat,
        lng: alighting.coords.lng,
      });
      extended = true;
    }
    if (corridorLines) {
      for (const seg of corridorLines) {
        bounds.extend(seg.from);
        bounds.extend(seg.to);
        extended = true;
      }
    }
    if (extended) {
      map.fitBounds(bounds, { top: 64, right: 56, bottom: 64, left: 56 });
    }
  }, [
    boarding,
    alighting,
    corridorLines,
    pickup,
    dropoff,
  ]);

  // Fullscreen side-effects — Esc to exit, body-scroll lock, and a
  // Google Maps resize trigger so tiles + bounds re-fit correctly
  // after the container's dimensions jump. Without the resize trigger,
  // Maps occasionally shows grey strips along the new edges.
  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);

    // Two RAFs gives Safari time to lay out the fixed wrapper before
    // we ask Maps to recompute. Single RAF is sometimes too early.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map || typeof window === "undefined" || !window.google) return;
        google.maps.event.trigger(map, "resize");
      });
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      // Trigger another resize when exiting so the inline-map tiles
      // settle back into the smaller container cleanly.
      const map = mapRef.current;
      if (map && typeof window !== "undefined" && window.google) {
        requestAnimationFrame(() => {
          google.maps.event.trigger(map, "resize");
        });
      }
    };
  }, [fullscreen]);

  // Auto re-lock after a window of map inactivity. Listens to gestures
  // INSIDE the map container so that watching/panning/zooming pushes
  // the relock further out — once the user is genuinely done, the
  // map relocks and the next scroll-past doesn't accidentally pan it.
  // Disabled when not lockable or already locked.
  useEffect(() => {
    if (!lockable || locked) return;
    const el = containerRef.current;
    if (!el) return;

    const RELOCK_AFTER_MS = 3500;
    const arm = () => {
      if (relockTimerRef.current) clearTimeout(relockTimerRef.current);
      relockTimerRef.current = setTimeout(() => {
        setLocked(true);
      }, RELOCK_AFTER_MS);
    };

    arm();
    el.addEventListener("touchstart", arm, { passive: true });
    el.addEventListener("touchmove", arm, { passive: true });
    el.addEventListener("mousedown", arm);
    el.addEventListener("mousemove", arm);
    el.addEventListener("wheel", arm, { passive: true });
    return () => {
      if (relockTimerRef.current) {
        clearTimeout(relockTimerRef.current);
        relockTimerRef.current = null;
      }
      el.removeEventListener("touchstart", arm);
      el.removeEventListener("touchmove", arm);
      el.removeEventListener("mousedown", arm);
      el.removeEventListener("mousemove", arm);
      el.removeEventListener("wheel", arm);
    };
  }, [locked, lockable]);

  return (
    // `min-h-[16rem]` is a belt-and-suspenders height floor in case a flex
    // ancestor on mobile collapses our height-class — Google Maps refuses
    // to render in a 0-height div, which would just leave a blank rectangle.
    // When `fullscreen` is on we swap the layout-flow class (className)
    // for a fixed-viewport overlay; the inner Google Maps `<div>` and
    // every overlay child stay the same.
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[60] overflow-hidden bg-rajlo-black"
          : `relative min-h-[16rem] overflow-hidden bg-surface-soft ${className}`
      }
    >
      {/* Inner div fills the wrapper. Switched off `absolute inset-0` to
          plain `h-full w-full` because mobile Safari occasionally fails to
          size absolute-positioned children inside overflow-hidden ancestors,
          leaving the Google Maps container at 0×0. */}
      <div ref={containerRef} className="h-full w-full" />
      {loadError && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-soft px-4">
          <div className="max-w-xs rounded-2xl bg-white px-4 py-3 text-center text-xs font-medium text-muted shadow-md">
            <p className="font-bold text-rajlo-red">Map failed to load</p>
            <p className="mt-1 break-words">{loadError}</p>
            <p className="mt-2 text-[10px]">
              Check Google Cloud Console → API key → Application restrictions
              include the host you&apos;re viewing from.
            </p>
          </div>
        </div>
      )}

      {/* Searching overlay — radar pulse + countdown, shown while
         the matcher is scanning for a driver. Three concentric
         rings with staggered animation delays produce a continuous
         radar-sweep feel. The `<SearchingOverlay />` component
         drives the countdown ticker so the time-remaining stays
         live without forcing a full MapView re-render every second. */}
      {searching && !loadError && (
        <SearchingOverlay searchingUntil={searchingUntil} />
      )}
      {/* Lock overlay — sits above the map while `locked` is true and
         catches all gestures so finger-swipes pan the page (not the
         map) and mouse wheel scrolls the page (not the map). The
         "Tap to interact" pill makes the affordance discoverable.
         Skipped when search overlay is active (the matcher's radar
         already prevents interaction during ride request) or while
         fullscreen (the user explicitly opened the map for a closer
         look — locking it would defeat the point). */}
      {lockable && locked && !loadError && !searching && !fullscreen && (
        <button
          type="button"
          onClick={() => setLocked(false)}
          className="group absolute inset-0 z-20 flex cursor-pointer items-end justify-center bg-transparent"
          aria-label="Tap to interact with the map"
        >
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-rajlo-black/80 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-md backdrop-blur transition-opacity group-hover:bg-rajlo-black/90 group-active:bg-rajlo-black">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
            >
              <path d="M9 11.24V7a3 3 0 0 1 6 0v4.24" />
              <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
            </svg>
            Tap to interact
          </span>
        </button>
      )}

      {/* Fullscreen control. Top-right "expand" button when inline,
         top-left "Close" pill when expanded. The expand button is
         hidden during the matcher search radar (no point opening
         fullscreen when there's no route to look at yet). */}
      {!loadError && !searching && !fullscreen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFullscreen(true);
            // Unlock so the user can pan/zoom immediately on enter.
            setLocked(false);
          }}
          aria-label="Open map in fullscreen"
          className="absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-rajlo-black shadow-md backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white active:translate-y-0"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        </button>
      )}
      {fullscreen && (
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          aria-label="Exit fullscreen"
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-rajlo-black shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
          Cancel
        </button>
      )}

      {/* Locate-me button. Mirrors Google Maps' standard control —
         tap to recenter the map on the current device location and
         zoom in. Hidden during the matcher search overlay (the radar
         already locks the map) and while loading. */}
      {!loadError && !searching && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleLocate();
          }}
          disabled={locating}
          aria-label="Center map on my location"
          className="absolute bottom-3 right-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-rajlo-red text-white shadow-lg shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-xl hover:shadow-rajlo-red/50 active:translate-y-0 disabled:opacity-70"
        >
          {locating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="9" />
              <path d="M12 2v3" />
              <path d="M12 19v3" />
              <path d="M2 12h3" />
              <path d="M19 12h3" />
            </svg>
          )}
        </button>
      )}

      {viewer !== "driver" &&
        (driverPosition ||
          riderPosition ||
          (nearbyDrivers && nearbyDrivers.length > 0)) && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-[11px] font-bold shadow-md backdrop-blur">
          {driverPosition && (
            <div className="flex items-center gap-2">
              <span className="grid h-3.5 w-3.5 place-items-center">
                <span className="h-3 w-2 rounded-sm bg-rajlo-red" />
              </span>
              Driver
            </div>
          )}
          {riderPosition && (
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-700 ring-1 ring-blue-700/50" />
              You
            </div>
          )}
          {!driverPosition &&
            nearbyDrivers &&
            nearbyDrivers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-rajlo-red" />
                {nearbyDrivers.length} driver
                {nearbyDrivers.length === 1 ? "" : "s"} online nearby
              </div>
            )}
        </div>
      )}
    </div>
  );
}

/**
 * Build a Google Maps URL-based icon for a fleet car marker, rotated to
 * face the given heading. We cache by 10° buckets so we don't burn CPU
 * re-encoding the SVG every heartbeat — at most 36 distinct icon objects
 * exist across the whole app session no matter how many drivers there
 * are. Heading null = car points up (no orientation known yet).
 */
/**
 * Build the rider "you are here" puck — white-ringed blue dot with an
 * optional soft glow fanning out in the direction the device is
 * facing. Bucket parameter:
 *   -1   → no heading available, render the puck without the glow
 *   0..350 (multiple of 10) → rotate the glow to that compass bearing
 *
 * Glow is a 90°-wide wedge with a 40-unit radius (canvas 96×96, dot
 * at (48, 60)) — longer than the previous 24-radius version so the
 * direction reads from further out on the map. Radial gradient fades
 * from low-opacity blue at the dot centre to fully transparent at
 * the wedge's outer edge, so the cone is soft and rounded — no sharp
 * polygon tip. Cached so we never re-encode the same SVG twice.
 */
const riderIconCache = new Map<number, google.maps.Icon>();
function buildRiderIcon(bucket: number): google.maps.Icon {
  const cached = riderIconCache.get(bucket);
  if (cached) return cached;
  const showGlow = bucket >= 0;
  // Wedge endpoints derived from r=40 at ±45° off the upward axis:
  // ( 48 ± 40·sin(45°), 60 − 40·cos(45°) ) = (19.72, 31.72) /
  // (76.28, 31.72). Path: centre → left edge → arc to right → close.
  const glow = showGlow
    ? `<defs>` +
      `<radialGradient id="rg" cx="48" cy="60" r="40" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.45"/>` +
      `<stop offset="55%" stop-color="#1d4ed8" stop-opacity="0.18"/>` +
      `<stop offset="100%" stop-color="#1d4ed8" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<g transform="rotate(${bucket} 48 60)">` +
      `<path d="M 48 60 L 19.72 31.72 A 40 40 0 0 1 76.28 31.72 Z" fill="url(#rg)"/>` +
      `</g>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">` +
    `${glow}` +
    `<circle cx="48" cy="60" r="10" fill="#1d4ed8" stroke="#ffffff" stroke-width="3"/>` +
    `</svg>`;
  const icon: google.maps.Icon = {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(96, 96),
    anchor: new google.maps.Point(48, 60),
  };
  riderIconCache.set(bucket, icon);
  return icon;
}

const carIconCache = new Map<number, google.maps.Icon>();
function buildCarIcon(heading: number | null | undefined): google.maps.Icon {
  // Bucket to 10° increments and normalise into [0, 360).
  const bucket =
    typeof heading === "number"
      ? ((Math.round(heading / 10) * 10) % 360 + 360) % 360
      : 0;
  const cached = carIconCache.get(bucket);
  if (cached) return cached;
  const svg = carIconSvg(bucket);
  const icon: google.maps.Icon = {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    // 40×40 square — matches the 70×70 padded viewBox so the car keeps
    // its previous on-screen size while every rotation angle stays
    // fully visible (the previous 28×42 with a 40×60 viewBox cropped
    // the car at diagonal headings). Anchor at the centre so the
    // rotation pivot sits exactly on the driver's GPS coordinate.
    scaledSize: new google.maps.Size(40, 40),
    anchor: new google.maps.Point(20, 20),
  };
  carIconCache.set(bucket, icon);
  return icon;
}

/**
 * Searching-for-drivers overlay. Three radar rings + a countdown
 * timer + a progress arc that drains as the request approaches its
 * timeout. Lifted out of MapView so its 1Hz ticker doesn't
 * re-render the heavy parent on every tick.
 *
 * `searchingUntil` is the ISO timestamp when the request expires.
 * If null, we just show the radar without a timer (the ride is
 * still being matched but no hard deadline was provided).
 */
function SearchingOverlay({
  searchingUntil,
}: {
  searchingUntil: string | null;
}) {
  // `tick` just increments every second to force a re-render. We
  // derive `secondsLeft` from `searchingUntil` + Date.now() in the
  // render body — that way the effect doesn't have to call
  // setState synchronously at mount, which would cascade-render.
  // Once the timer hits zero we stop the interval to avoid burning
  // CPU on a static "0:00".
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!searchingUntil) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const remaining = secondsUntil(searchingUntil);
      if (remaining !== null && remaining <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [searchingUntil]);

  const secondsLeft = secondsUntil(searchingUntil);

  // Progress arc — total window assumed to be 5 minutes (300s); if
  // the ISO comes from a different timeout the arc still drains
  // proportionally. We compute the original window from the
  // remaining-vs-elapsed split server-side, but client-side just
  // hard-default to 300s. Drift is cosmetic only.
  const totalWindow = 300;
  const remainingPct =
    secondsLeft === null
      ? null
      : Math.max(0, Math.min(1, secondsLeft / totalWindow));

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      {/* Tinted veil — subtle red wash signals "system is actively
         working" without obscuring the route. */}
      <div className="absolute inset-0 bg-rajlo-red/[0.04]" />
      <div className="relative grid place-items-center">
        <div className="relative h-44 w-44 md:h-56 md:w-56">
          {/* Three pulsing rings, staggered. */}
          <span
            aria-hidden
            className="radar-pulse absolute inset-0 rounded-full border-2 border-rajlo-red"
          />
          <span
            aria-hidden
            className="radar-pulse absolute inset-0 rounded-full border-2 border-rajlo-red"
            style={{ animationDelay: "0.8s" }}
          />
          <span
            aria-hidden
            className="radar-pulse absolute inset-0 rounded-full border-2 border-rajlo-red"
            style={{ animationDelay: "1.6s" }}
          />

          {/* Countdown ring + numeric label. SVG circle with
             stroke-dashoffset that drains as the timer counts down.
             The static back-ring gives the missing-progress a
             visible track. */}
          {remainingPct !== null && (
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className="absolute inset-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 -rotate-90 md:h-32 md:w-32"
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="rgba(241,1,0,0.15)"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="#f10100"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 46}
                strokeDashoffset={2 * Math.PI * 46 * (1 - remainingPct)}
                style={{
                  transition: "stroke-dashoffset 1s linear",
                }}
              />
            </svg>
          )}

          {/* Centre block — solid red puck with the time-remaining
             text on top. Falls back to a small pulsing dot when no
             timer is provided. */}
          <span className="absolute inset-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-lg ring-4 ring-rajlo-red/20 md:h-24 md:w-24">
            {secondsLeft !== null ? (
              <span className="text-center">
                <span className="block font-mono text-2xl font-extrabold tracking-tight text-rajlo-red md:text-3xl">
                  {formatMmSs(Math.max(0, secondsLeft))}
                </span>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">
                  {secondsLeft > 0 ? "remaining" : "expired"}
                </span>
              </span>
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-rajlo-red text-white shadow-md shadow-rajlo-red/40">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
            )}
          </span>
        </div>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg shadow-rajlo-red/40">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Searching for drivers
        </div>
      </div>
    </div>
  );
}

/** Seconds between now and an ISO timestamp. Null/invalid → null. */
function secondsUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 1000);
}

/** "M:SS" string for a non-negative seconds count. */
function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
