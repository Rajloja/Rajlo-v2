/**
 * SHARED matcher gate logic — mirrored from
 * src/app/api/rider/route-taxi/match/route.ts (the geocoded branch).
 *
 * This file exists so the audit script + fixture regression test
 * both use one definition of "does a corridor match a trip?",
 * instead of three drift-prone copies. The production TypeScript in
 * match/route.ts is intentionally kept as its own copy — the
 * fixture test independently re-implementing the rule then asserting
 * correctness against the DB is a FEATURE: any drift between
 * production and this mirror will surface as failing fixture cases.
 *
 * When you change any threshold here, change it in match/route.ts
 * AT THE SAME TIME, and re-run scripts/test-matcher-fixture.mjs.
 */

/* ─── Calibration constants ─── */

/** Max perpendicular distance from rider pickup/dropoff to the
 *  corridor line. 2.0 km ≈ 24 min walk. */
export const CORRIDOR_RADIUS_KM = 2.0;

/** Distance-vs-corridor sanity gate. Trip can't be meaningfully
 *  longer than the corridor itself: tripKm > routeKm * 1.3 + 2. */
export const TRIP_DISTANCE_SLACK = 1.3;
export const TRIP_DISTANCE_PAD_KM = 2.0;

/** Absolute floor on on-corridor distance. Riding under 500 m of
 *  the corridor isn't worth hailing for. */
export const MIN_USEFUL_CORRIDOR_KM = 0.5;

/** Fraction of the rider's straight-line trip that the corridor must
 *  cover. 0.4 = 40%. Below this, the corridor isn't really serving
 *  the trip — most of the journey would be off-corridor walking. */
export const MIN_USEFUL_CORRIDOR_FRACTION = 0.4;

/** Total walking budget (perpendicular distance at pickup +
 *  perpendicular distance at dropoff) as a multiple of trip distance.
 *  0.6 = combined walk may be at most 60% of straight-line trip
 *  distance. Tighter than the obvious "walk ≤ trip" because the
 *  asymmetric cost model (false positive = lost trust forever;
 *  false negative = recoverable, rider books private ride) tells us
 *  to bias hard toward rejection. Calibrated against the fixture in
 *  scripts/_matcher-fixture.mjs — every entry must stay green if
 *  you change this. */
export const MAX_WALK_VS_TRIP_RATIO = 0.6;

/* ─── Geometry ─── */

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Project p onto segment a→b. Returns perpendicular distance (km)
 *  and t ∈ [0,1] (clamped). Local equirectangular approximation. */
export function projectToSegment(p, a, b) {
  const KM_PER_DEG_LAT = 111;
  const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lng - a.lng) * kmPerDegLng;
  const by = (b.lat - a.lat) * KM_PER_DEG_LAT;
  const px = (p.lng - a.lng) * kmPerDegLng;
  const py = (p.lat - a.lat) * KM_PER_DEG_LAT;
  const segLen2 = bx * bx + by * by;
  let t = segLen2 > 0 ? (px * bx + py * by) / segLen2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { distKm: Math.hypot(px - t * bx, py - t * by), t };
}

/**
 * Project a point onto a POLYLINE (an ordered array of {lat, lng}
 * points tracing a real road). Returns:
 *   distKm: perpendicular distance to the nearest segment of the
 *     polyline.
 *   t: ∈ [0,1] — fraction along the polyline's total arc length
 *     where the projection lands. 0 = at polyline[0], 1 = at the
 *     last vertex.
 *
 * This is the correct primitive for "is the rider close to this
 * corridor?" — straight-line projection between corridor endpoints
 * lies about distance whenever the road curves. A point 200 m off
 * Spanish Town Road might be 1.5 km from the straight line between
 * Arnett Gardens and Cross Roads, and a point on the straight line
 * might be 1 km off the actual road.
 *
 * Algorithm: project onto every segment, keep the projection with
 * the smallest perpendicular distance, then convert the
 * within-segment t to a polyline-wide t using cumulative arc length.
 *
 * Falls back to segment projection between polyline[0] and the last
 * vertex when the polyline has fewer than 2 segments (3 points).
 */
export function projectToPolyline(p, polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    return null;
  }
  if (polyline.length === 2) {
    return projectToSegment(p, polyline[0], polyline[1]);
  }

  // Precompute segment lengths so we can convert (segment index +
  // within-segment t) to polyline-wide t in one pass.
  const segLenKm = [];
  let totalKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const KM_PER_DEG_LAT = 111;
    const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * kmPerDegLng;
    const by = (b.lat - a.lat) * KM_PER_DEG_LAT;
    const len = Math.hypot(bx, by);
    segLenKm.push(len);
    totalKm += len;
  }
  if (totalKm === 0) {
    return { distKm: 0, t: 0 };
  }

  let bestDistKm = Infinity;
  let bestT = 0;

  let cumKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const proj = projectToSegment(p, a, b);
    if (proj.distKm < bestDistKm) {
      bestDistKm = proj.distKm;
      bestT = (cumKm + proj.t * segLenKm[i]) / totalKm;
    }
    cumKm += segLenKm[i];
  }
  return { distKm: bestDistKm, t: bestT };
}

/** Total polyline arc length in km. Cached calls are cheap relative
 *  to per-evaluation cost; we recompute since the matcher runs
 *  rarely enough that adding a cache layer is premature. */
export function polylineLengthKm(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const KM_PER_DEG_LAT = 111;
    const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * kmPerDegLng;
    const by = (b.lat - a.lat) * KM_PER_DEG_LAT;
    total += Math.hypot(bx, by);
  }
  return total;
}

/* ─── Gate evaluation ─── */

/**
 * Run all production matcher gates (geocoded branch only) on one
 * (route, pickup, dropoff) tuple.
 *
 * Returns:
 *   {
 *     verdict: "accept" | "reject",
 *     reason: <which gate killed it, or "passes-all">,
 *     score: number | null,       // production scoring (null when rejected)
 *     diag: { perpP, perpD, tP, tD, onCorridorKm, walkKm, ... },
 *   }
 *
 * Returns null when the route can't be evaluated (missing coords).
 * That isn't a rejection — it means this branch doesn't apply.
 */
export function evaluateMatch(route, pickup, dropoff) {
  if (
    route.origin_lat == null ||
    route.origin_lng == null ||
    route.destination_lat == null ||
    route.destination_lng == null
  ) {
    return null;
  }
  const routeKm = Number(route.distance_km);
  if (!Number.isFinite(routeKm) || routeKm <= 0) return null;

  const tripKm = haversineKm(pickup, dropoff);

  // Gate 0: trip-distance sanity.
  if (tripKm > routeKm * TRIP_DISTANCE_SLACK + TRIP_DISTANCE_PAD_KM) {
    return {
      verdict: "reject",
      reason: "distance-gate",
      score: null,
      diag: { tripKm, routeKm },
    };
  }

  // Project against the corridor's REAL road geometry (path_polyline)
  // when available. Falls back to the straight-line segment between
  // endpoints only when the polyline isn't there — which shouldn't
  // happen for any active geocoded route per the schema invariant.
  let segP, segD;
  const polyline = route.path_polyline;
  if (Array.isArray(polyline) && polyline.length >= 2) {
    segP = projectToPolyline(pickup, polyline);
    segD = projectToPolyline(dropoff, polyline);
  } else {
    const origin = { lat: Number(route.origin_lat), lng: Number(route.origin_lng) };
    const dest = {
      lat: Number(route.destination_lat),
      lng: Number(route.destination_lng),
    };
    segP = projectToSegment(pickup, origin, dest);
    segD = projectToSegment(dropoff, origin, dest);
  }
  const totalWalkKm = segP.distKm + segD.distKm;
  const onCorridorKm = Math.abs(segP.t - segD.t) * routeKm;

  const diag = {
    tripKm,
    routeKm,
    perpP: segP.distKm,
    perpD: segD.distKm,
    tP: segP.t,
    tD: segD.t,
    onCorridorKm,
    totalWalkKm,
  };

  // Gate 1: perpendicular distance.
  if (segP.distKm > CORRIDOR_RADIUS_KM || segD.distKm > CORRIDOR_RADIUS_KM) {
    return { verdict: "reject", reason: "perp-radius", score: null, diag };
  }

  // Gate 2: on-corridor utilization (absolute + fraction).
  const minUseful = Math.max(
    MIN_USEFUL_CORRIDOR_KM,
    tripKm * MIN_USEFUL_CORRIDOR_FRACTION,
  );
  diag.minUseful = minUseful;
  if (onCorridorKm < minUseful) {
    return { verdict: "reject", reason: "utilization", score: null, diag };
  }

  // Gate 3: walk budget.
  if (totalWalkKm > tripKm * MAX_WALK_VS_TRIP_RATIO) {
    return { verdict: "reject", reason: "walk-budget", score: null, diag };
  }

  // All gates passed. Production scoring: 3.0 base + closeness ∈
  // [0,1] + name-match bonus. The name bonus boosts corridors whose
  // named endpoints match the rider's labelled pickup/dropoff, so
  // when Google Places returns slightly-off coords the matcher still
  // ranks the obvious by-name match above coincidental geographic
  // matches. See match/route.ts for the full reasoning.
  const closeness =
    1 - (segP.distKm + segD.distKm) / (2 * CORRIDOR_RADIUS_KM);
  const direction = segP.t <= segD.t ? "forward" : "reverse";

  let nameBonus = 0;
  if (route.origin_name && route.destination_name) {
    const corridorPickupName =
      direction === "forward" ? route.origin_name : route.destination_name;
    const corridorDropoffName =
      direction === "forward" ? route.destination_name : route.origin_name;
    // Stop-aware token overlap mirroring tokenize() in production.
    nameBonus =
      tokenOverlap(corridorPickupName, pickup.name) +
      tokenOverlap(corridorDropoffName, dropoff.name);
  }

  const score = 3 + closeness + nameBonus;
  return { verdict: "accept", reason: "passes-all", score, direction, diag };
}

const TOKENIZE_STOPWORDS = new Set([
  "jamaica", "the", "and", "a", "an", "of", "to", "in", "at", "on", "by",
  "road", "rd", "avenue", "ave", "street", "st", "drive", "dr", "lane", "ln",
  "highway", "hwy", "parish", "boulevard", "blvd", "way", "place", "pl",
  "court", "ct", "square", "sq",
]);

function tokenizeForBonus(s) {
  if (typeof s !== "string") return new Set();
  const out = new Set();
  const lowered = s.toLowerCase().replace(/[.,/'’()\-–—_"`]/g, " ");
  for (const w of lowered.split(/\s+/)) {
    const t = w.trim();
    if (t.length < 3) continue;
    if (TOKENIZE_STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

function tokenOverlap(routeName, riderName) {
  if (!riderName) return 0;
  const routeT = tokenizeForBonus(routeName);
  const riderT = tokenizeForBonus(riderName);
  if (routeT.size === 0 || riderT.size === 0) return 0;
  let hits = 0;
  for (const t of routeT) if (riderT.has(t)) hits++;
  return hits / routeT.size;
}

/**
 * Run evaluateMatch against every active geocoded route. Returns
 * the top-N accepted matches sorted by score (mirroring the
 * production top-3 cap). Useful for fixture assertions.
 */
export function runMatcher(routes, pickup, dropoff, topN = 3) {
  const accepted = [];
  for (const r of routes) {
    const result = evaluateMatch(r, pickup, dropoff);
    if (result?.verdict === "accept") {
      accepted.push({
        route: r,
        score: result.score,
        direction: result.direction,
        diag: result.diag,
      });
    }
  }
  accepted.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.route.distance_km) - Number(b.route.distance_km),
  );
  return accepted.slice(0, topN);
}
