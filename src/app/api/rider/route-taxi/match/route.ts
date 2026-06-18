import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { haversineKm } from "@/lib/jamaica";

/**
 * POST /api/rider/route-taxi/match
 *
 * THIS IS A TRUST-CRITICAL SURFACE. A rider books "A → B" and gets
 * shown a corridor that doesn't actually serve that trip → trust gone,
 * permanently, in a brand-new market. The cost model is asymmetric:
 *
 *   - False positive (corridor shown that doesn't serve the trip) =
 *     catastrophic. Rider tries it, finds the taxi doesn't go where
 *     they need, never trusts route-taxi mode again.
 *   - False negative (failing to surface a valid corridor) =
 *     recoverable. Rider books a private ride or hails the road
 *     directly (the Jamaican default behaviour).
 *
 * Every gate below is calibrated to bias hard toward rejection.
 * "No route taxi covers this trip yet" is a fine UX answer; a wrong
 * corridor is not.
 *
 * REGRESSION GUARDS — two-tier:
 *
 *   `npm run test:matcher` (scripts/test-matcher-fixture.mjs) — a
 *     hand-verified set of ~20 real Jamaica trips with their CORRECT
 *     answer. Locks down specific bugs that have been reported.
 *     Every matcher change must keep this green.
 *
 *   `npm run fuzz:matcher` (scripts/fuzz-matcher.mjs) — samples
 *     thousands of random (pickup, dropoff) pairs across populated
 *     Jamaica and asserts UNIVERSAL INVARIANTS on whatever corridors
 *     come back (walk budget, perpendicular distance, on-corridor
 *     utilization, direction alignment). Catches whole classes of
 *     bug without needing to enumerate every Jamaican town. Run
 *     this after any geocoder backfill or matcher gate tweak.
 *
 * ─── MATCHING CONTRACT ───────────────────────────────────────────
 *
 * Given a rider's pickup + dropoff (with names, parishes, and ideally
 * coordinates from Google Places), surface up to 3 TA-licensed
 * corridors that serve the trip, ranked by score (best first).
 *
 * A corridor IS A VALID MATCH when, in priority order:
 *
 *   1. Distance sanity. tripKm ≤ routeKm × 1.3 + 2.0. (A 5 km trip
 *      can't fit on a 1 km corridor; a 240 km trip can't fit on a
 *      15 km corridor.)
 *
 *   2. GEOMETRIC BRANCH — applies when both the rider sent coords
 *      AND the corridor has geocoded endpoints. This is the path
 *      99% of real bookings take. Projections use the corridor's
 *      REAL ROAD GEOMETRY (path_polyline) — NOT the straight line
 *      between endpoints. A straight-line midpoint can be 1 km off
 *      the actual taxi road, which lies about every gate below.
 *      Conditions, ALL required:
 *
 *      a. Both pickup and dropoff project to within
 *         CORRIDOR_RADIUS_KM (2.0 km) perpendicular distance from
 *         the corridor's actual road.
 *      b. The rider actually rides the corridor for at least
 *         MIN_USEFUL_CORRIDOR_KM (0.5 km) — projecting both
 *         endpoints to the same t-value means zero on-corridor
 *         travel, which means the corridor isn't doing anything.
 *      c. On-corridor travel covers ≥ MIN_USEFUL_CORRIDOR_FRACTION
 *         (40%) of the straight-line trip distance.
 *      d. Combined walk-to-corridor distance (perpendicular at
 *         pickup + perpendicular at dropoff) ≤
 *         MAX_WALK_VS_TRIP_RATIO × tripKm. (60% — riders won't
 *         walk most of their trip distance just to use a taxi.)
 *
 *   3. NAME-TOKEN BRANCH — fallback when (2) doesn't apply (route
 *      missing coords, OR rider didn't send coords). Token overlap
 *      between corridor names and rider place names + addresses, in
 *      both forward and reverse direction. Parish hard-filter: a
 *      corridor whose parish doesn't share a token with the rider's
 *      parish is rejected outright. (No more "Hopewell in Hanover"
 *      matching a "Hopewell in St. James" trip.)
 *
 *   4. RANKING. Geometric matches sit above name-only (base score
 *      3.0 + closeness vs name-only's overlap score). The closer
 *      both endpoints sit to the corridor line, the higher the
 *      score. Top 3 returned.
 *
 *   5. EMPTY RESULT IS A VALID ANSWER. When no corridor passes the
 *      gates, return `matches: []`. The rider UI then surfaces
 *      "Private Ride only — no route taxi covers this trip yet".
 *      Never fake a corridor to fill the response.
 *
 * Body:
 *   { pickup: { name, address?, parish?, lat?, lng? },
 *     dropoff: { name, address?, parish?, lat?, lng? } }
 *
 * Response:
 *   { matches: Array<{ route, direction, fareJmd, confidence }> }
 */

type RiderPlace = {
  name?: unknown;
  address?: unknown;
  parish?: unknown;
  lat?: unknown;
  lng?: unknown;
};

type MatchBody = { pickup?: RiderPlace; dropoff?: RiderPlace };

type RouteRow = {
  id: string;
  origin_name: string;
  destination_name: string;
  origin_parish: string | null;
  destination_parish: string | null;
  distance_km: number;
  ta_fare_jmd: number;
  slug: string;
  /** Endpoint coordinates — null until `scripts/geocode-routes.mjs`
   *  has run. When present the matcher uses exact proximity. */
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  /** The corridor's REAL road geometry, lazy-filled by the journey
   *  quote on first use (Google Directions polyline). Critical for
   *  matching accuracy: straight-line projection between endpoints
   *  lies about distance whenever the road curves. */
  path_polyline: Array<{ lat: number; lng: number }> | null;
};

/** How far (km) a rider's pickup/dropoff may sit from the corridor
 *  line and still count as "on the corridor". Keep this in lockstep
 *  with MAX_HAILABLE_WALK_KM in the pathfinder so the two surfaces
 *  (direct match + multi-leg journey) accept/reject the same riders.
 *  2.0 km ≈ 24 min walk; longer walks get visible UI warnings rather
 *  than being silently locked out. */
const CORRIDOR_RADIUS_KM = 2.0;

/** Geometric-branch gates. See the MATCHING CONTRACT block at the
 *  top of this file for what each gate means and why.
 *
 *  Every value here is anchored by scripts/_matcher-fixture.mjs —
 *  if you change one, re-run scripts/test-matcher-fixture.mjs and
 *  expect at least one fixture entry to be wrong if your change
 *  isn't intentional. */
const MIN_USEFUL_CORRIDOR_KM = 0.5;
const MIN_USEFUL_CORRIDOR_FRACTION = 0.4;
const MAX_WALK_VS_TRIP_RATIO = 0.6;

const STOPWORDS = new Set([
  "jamaica",
  "the",
  "and",
  "a",
  "an",
  "of",
  "to",
  "in",
  "at",
  "on",
  "by",
  "road",
  "rd",
  "avenue",
  "ave",
  "street",
  "st",
  "drive",
  "dr",
  "lane",
  "ln",
  "highway",
  "hwy",
  "parish",
  "boulevard",
  "blvd",
  "way",
  "place",
  "pl",
  "court",
  "ct",
  "square",
  "sq",
]);

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as MatchBody;
  const pickupName = asString(body.pickup?.name);
  const dropoffName = asString(body.dropoff?.name);
  if (!pickupName || !dropoffName) {
    return NextResponse.json(
      { error: "pickup and dropoff names are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const pickupTokens = tokenize(
    `${pickupName} ${asString(body.pickup?.address) ?? ""}`,
  );
  const dropoffTokens = tokenize(
    `${dropoffName} ${asString(body.dropoff?.address) ?? ""}`,
  );
  const pickupParish = normaliseParish(asString(body.pickup?.parish));
  const dropoffParish = normaliseParish(asString(body.dropoff?.parish));

  if (pickupTokens.size === 0 || dropoffTokens.size === 0) {
    return NextResponse.json({ matches: [] });
  }

  // Straight-line trip distance for the geographic sanity gate. Null
  // when the client didn't send coordinates — the gate is then skipped
  // and we fall back to name-only matching.
  const pickupCoord = asCoord(body.pickup);
  const dropoffCoord = asCoord(body.dropoff);
  const tripKm =
    pickupCoord && dropoffCoord
      ? haversineKm(pickupCoord, dropoffCoord)
      : null;

  // We could narrow by parish at the SQL layer but our parish column on
  // routes uses the TA's combined string ("Kingston and St. Andrew")
  // while Google returns just "Kingston" — easier to do parish
  // matching in JS where we can do partial overlap.
  const { data: routes, error } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, distance_km, ta_fare_jmd, slug, origin_lat, origin_lng, destination_lat, destination_lng, path_polyline",
    )
    .eq("active", true)
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Candidate = {
    route: RouteRow;
    direction: "forward" | "reverse";
    score: number;
    confidence: "high" | "medium" | "low";
  };

  const candidates: Candidate[] = [];

  let gatedOut = 0;
  let parishGated = 0;
  let geoGated = 0;
  let utilizationGated = 0;
  for (const r of (routes ?? []) as RouteRow[]) {
    // Geographic sanity gate. A route taxi rider boards a segment of
    // the corridor, so the trip can't be meaningfully longer than the
    // corridor itself. 1.3× absorbs straight-line-vs-road slack and
    // +2 km helps very short corridors. Skipped when no coords.
    const routeKm = Number(r.distance_km);
    if (tripKm !== null && tripKm > routeKm * 1.3 + 2) {
      gatedOut++;
      continue;
    }

    // ── Geographic projection — preferred when the route is geocoded ──
    // A route with real endpoint coordinates is matched purely on
    // geography. We project the rider's pickup AND dropoff onto the
    // corridor's ACTUAL ROAD GEOMETRY (path_polyline) when available,
    // not the straight line between endpoints — a corridor following
    // curving Jamaican roads can have a straight-line midpoint that's
    // 1 km off the real road, which lies about distance.
    //
    // Falls back to straight-line projection when path_polyline is
    // missing (shouldn't happen for active geocoded routes — the
    // journey-quote lazy-fills it on first use, and survey-polyline-
    // coverage.mjs confirmed 100% coverage at deploy time).
    if (
      pickupCoord &&
      dropoffCoord &&
      r.origin_lat != null &&
      r.origin_lng != null &&
      r.destination_lat != null &&
      r.destination_lng != null
    ) {
      const polyline = r.path_polyline;
      let segP: { distKm: number; t: number };
      let segD: { distKm: number; t: number };
      if (Array.isArray(polyline) && polyline.length >= 2) {
        segP = projectToPolyline(pickupCoord, polyline);
        segD = projectToPolyline(dropoffCoord, polyline);
      } else {
        const origin = { lat: Number(r.origin_lat), lng: Number(r.origin_lng) };
        const dest = {
          lat: Number(r.destination_lat),
          lng: Number(r.destination_lng),
        };
        segP = projectToSegment(pickupCoord, origin, dest);
        segD = projectToSegment(dropoffCoord, origin, dest);
      }
      if (
        segP.distKm > CORRIDOR_RADIUS_KM ||
        segD.distKm > CORRIDOR_RADIUS_KM
      ) {
        geoGated++;
        continue; // off-corridor — geography says no, whatever the names
      }
      // Utilization gate: the rider must actually travel ALONG the
      // corridor, not just sit near one of its endpoints. tripKm is
      // available here because the geocoded branch requires both
      // pickupCoord and dropoffCoord, which is the same condition
      // tripKm was computed under.
      const onCorridorKm = Math.abs(segP.t - segD.t) * routeKm;
      const minUseful = Math.max(
        MIN_USEFUL_CORRIDOR_KM,
        // tripKm is guaranteed non-null inside this branch — both
        // coords were checked above before reaching this point.
        (tripKm ?? 0) * MIN_USEFUL_CORRIDOR_FRACTION,
      );
      if (onCorridorKm < minUseful) {
        utilizationGated++;
        continue;
      }
      // Walk-budget gate: total walking to/from the corridor must
      // not exceed the trip distance. A rider walking 3.6 km combined
      // to take a 1.7 km trip isn't being served by this corridor,
      // even if utilization technically passes.
      const totalWalkKm = segP.distKm + segD.distKm;
      if (totalWalkKm > (tripKm ?? 0) * MAX_WALK_VS_TRIP_RATIO) {
        utilizationGated++;
        continue;
      }
      // Closer to the corridor → higher score. Geocoded matches sit
      // above any name-only score (base 3.0) so they always rank first.
      const closeness =
        1 - (segP.distKm + segD.distKm) / (2 * CORRIDOR_RADIUS_KM);

      // NAME-MATCH BONUS — bias scoring toward the corridor whose
      // named endpoints match the rider's labelled pickup/dropoff.
      //
      // Why this matters: Google Places autocomplete sometimes
      // returns coords that don't match the place's "real" centre.
      // Example seen in production: rider books "Half Way Tree →
      // Maxfield Avenue" but Google's "Half Way Tree" coord lands
      // 2 km east of the clock tower (in Liguanea). From there
      // the matcher finds that Arnett Gardens → Cross Roads passes
      // the gates with a slightly lower walk distance than HWT →
      // Maxfield Avenue. Both are technically valid geographic
      // matches, but the rider's intent is unambiguous — they
      // labelled it HWT → Maxfield and there is a corridor with
      // that exact name. Boost it to the top.
      //
      // The bonus is small enough that it never RESCUES a corridor
      // that already failed the geographic gates — it only re-ranks
      // among corridors that already passed.
      const fOriginTokens = tokenize(r.origin_name);
      const fDestTokens = tokenize(r.destination_name);
      const isForward = segP.t <= segD.t;
      const corridorPickupTokens = isForward ? fOriginTokens : fDestTokens;
      const corridorDropoffTokens = isForward ? fDestTokens : fOriginTokens;
      const nameMatchPickup = overlapScore(corridorPickupTokens, pickupTokens);
      const nameMatchDropoff = overlapScore(corridorDropoffTokens, dropoffTokens);
      const nameBonus = nameMatchPickup + nameMatchDropoff;

      candidates.push({
        route: r,
        direction: isForward ? "forward" : "reverse",
        score: 3 + closeness + nameBonus,
        confidence: "high",
      });
      continue; // coordinates decided it — skip the name heuristics
    }

    const originTokens = tokenize(r.origin_name);
    const destTokens = tokenize(r.destination_name);

    // Forward: route origin ↔ rider pickup, route dest ↔ rider dropoff
    const fOriginScore = overlapScore(originTokens, pickupTokens);
    const fDestScore = overlapScore(destTokens, dropoffTokens);
    if (fOriginScore > 0 && fDestScore > 0) {
      // Parish hard-filter: a corridor whose parish doesn't line up
      // with the rider's trip is rejected outright — name-token
      // overlap alone ("Hopewell" exists in two parishes) is not
      // enough. Skipped per-end when the rider's parish is unknown.
      if (
        parishCompatible(r.origin_parish, pickupParish) &&
        parishCompatible(r.destination_parish, dropoffParish)
      ) {
        const total = fOriginScore + fDestScore + 0.5;
        candidates.push({
          route: r,
          direction: "forward",
          score: total,
          confidence: bucket(total),
        });
      } else {
        parishGated++;
      }
    }

    // Reverse: route origin ↔ rider dropoff, route dest ↔ rider pickup
    const rOriginScore = overlapScore(originTokens, dropoffTokens);
    const rDestScore = overlapScore(destTokens, pickupTokens);
    if (rOriginScore > 0 && rDestScore > 0) {
      if (
        parishCompatible(r.origin_parish, dropoffParish) &&
        parishCompatible(r.destination_parish, pickupParish)
      ) {
        const total = rOriginScore + rDestScore + 0.5;
        candidates.push({
          route: r,
          direction: "reverse",
          score: total,
          confidence: bucket(total),
        });
      } else {
        parishGated++;
      }
    }
  }

  // De-dupe — a route appearing in both directions keeps the higher
  // scoring one. Then sort by score desc, take top 3.
  const bestPerRoute = new Map<string, Candidate>();
  for (const c of candidates) {
    const cur = bestPerRoute.get(c.route.id);
    if (!cur || c.score > cur.score) bestPerRoute.set(c.route.id, c);
  }
  const top = Array.from(bestPerRoute.values())
    .sort((a, b) => b.score - a.score || a.route.distance_km - b.route.distance_km)
    .slice(0, 3);

  // Diagnostic log — counts only. We deliberately do NOT log the
  // rider's pickup/dropoff strings here: those are the rider's own
  // trip patterns and would accumulate in retained server logs as
  // a rolling map of where each user travels. Counts are enough to
  // debug "matcher returned nothing for an obvious corridor" reports.
  console.log(
    `[route-match] pickupTokens=${pickupTokens.size} dropoffTokens=${dropoffTokens.size} ` +
      `routesScanned=${routes?.length ?? 0} distanceGated=${gatedOut} ` +
      `parishGated=${parishGated} geoGated=${geoGated} ` +
      `utilizationGated=${utilizationGated} ` +
      `tripKm=${tripKm !== null ? tripKm.toFixed(1) : "n/a"} ` +
      `candidates=${candidates.length} returned=${top.length}` +
      (top.length > 0 ? ` topScore=${top[0].score.toFixed(2)}` : ""),
  );

  return NextResponse.json({
    matches: top.map((c) => ({
      route: {
        id: c.route.id,
        origin: c.route.origin_name,
        destination: c.route.destination_name,
        parish: c.route.origin_parish,
        distanceKm: Number(c.route.distance_km),
        taFareJmd: c.route.ta_fare_jmd,
        slug: c.route.slug,
      },
      direction: c.direction,
      fareJmd: c.route.ta_fare_jmd,
      confidence: c.confidence,
    })),
  });
}

/* ─── Helpers ─── */

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Pull a usable {lat,lng} from a rider place, or null. Rejects the
 *  stuck-on-zero (0,0) fix that means "no GPS yet". */
function asCoord(
  p: RiderPlace | undefined,
): { lat: number; lng: number } | null {
  if (!p) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Project a point onto the segment a→b. Returns the perpendicular
 * distance in km and `t` ∈ [0,1] — how far along the segment the
 * projection lands (0 = at a, 1 = at b). A local equirectangular
 * approximation, accurate at Jamaican-corridor scale.
 */
function projectToSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): { distKm: number; t: number } {
  const KM_PER_DEG_LAT = 111;
  const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lng - a.lng) * kmPerDegLng;
  const by = (b.lat - a.lat) * KM_PER_DEG_LAT;
  const px = (p.lng - a.lng) * kmPerDegLng;
  const py = (p.lat - a.lat) * KM_PER_DEG_LAT;
  const segLen2 = bx * bx + by * by;
  let t = segLen2 > 0 ? (px * bx + py * by) / segLen2 : 0;
  t = Math.max(0, Math.min(1, t));
  return {
    distKm: Math.hypot(px - t * bx, py - t * by),
    t,
  };
}

/**
 * Project a point onto a POLYLINE (ordered list of {lat,lng} points
 * tracing the corridor's real road). Returns the perpendicular
 * distance to the nearest segment plus `t` ∈ [0,1] — the fraction
 * along the polyline's total arc length where the projection lands.
 *
 * Critical for matcher correctness: a straight line between corridor
 * endpoints lies about distance whenever the road curves. A rider
 * 200 m off Spanish Town Road can be 1.5 km from the straight line
 * between Arnett Gardens and Cross Roads. The polyline gives the
 * truth.
 *
 * Algorithm: project onto every segment, pick the segment with the
 * smallest perpendicular distance, convert within-segment t to a
 * polyline-wide t using cumulative arc length.
 */
function projectToPolyline(
  p: { lat: number; lng: number },
  polyline: Array<{ lat: number; lng: number }>,
): { distKm: number; t: number } {
  if (polyline.length === 2) {
    return projectToSegment(p, polyline[0], polyline[1]);
  }
  const KM_PER_DEG_LAT = 111;
  const segLenKm: number[] = [];
  let totalKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * kmPerDegLng;
    const by = (b.lat - a.lat) * KM_PER_DEG_LAT;
    const len = Math.hypot(bx, by);
    segLenKm.push(len);
    totalKm += len;
  }
  if (totalKm === 0) return { distKm: 0, t: 0 };

  let bestDistKm = Infinity;
  let bestT = 0;
  let cumKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectToSegment(p, polyline[i], polyline[i + 1]);
    if (proj.distKm < bestDistKm) {
      bestDistKm = proj.distKm;
      bestT = (cumKm + proj.t * segLenKm[i]) / totalKm;
    }
    cumKm += segLenKm[i];
  }
  return { distKm: bestDistKm, t: bestT };
}

/**
 * Lowercase, normalise punctuation (hyphens, dashes, slashes, periods,
 * apostrophes, parens — all become whitespace), split on whitespace,
 * drop stopwords + short words.
 *
 * Aggressive normalisation matters here because Google sometimes
 * returns "Half-Way Tree" with hyphens or "St. Andrew's" with a smart
 * quote, while the TA seed has "Half Way Tree" / "St. Andrew" — we
 * need both to tokenize the same way.
 */
function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  const lowered = s
    .toLowerCase()
    .replace(/[.,/'’()\-–—_"`]/g, " ");
  for (const word of lowered.split(/\s+/)) {
    const w = word.trim();
    if (w.length < 3) continue;
    if (STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

/**
 * Score how well two token sets overlap. We weight by the SHORTER
 * set (the route name) so a rider whose dropoff address is long
 * doesn't mechanically beat shorter matches.
 */
function overlapScore(routeTokens: Set<string>, riderTokens: Set<string>): number {
  if (routeTokens.size === 0 || riderTokens.size === 0) return 0;
  let hits = 0;
  for (const t of routeTokens) if (riderTokens.has(t)) hits++;
  return hits / routeTokens.size;
}

function bucket(score: number): "high" | "medium" | "low" {
  if (score >= 1.6) return "high";
  if (score >= 1.0) return "medium";
  return "low";
}

/** Words that carry no parish identity — dropped before comparison so
 *  "Saint James" / "St. James" / "St James Parish" all reduce to the
 *  single distinctive token {james}. */
const PARISH_STOP = new Set(["st", "saint", "and", "the", "parish"]);

/** Reduce a parish string to its distinctive tokens. "Kingston and
 *  St. Andrew" → {kingston, andrew}; "Saint James" → {james}. */
function parishTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().replace(/[.,]/g, " ").split(/\s+/)) {
    const t = w.trim();
    if (t.length < 3 || PARISH_STOP.has(t)) continue;
    out.add(t);
  }
  return out;
}

/**
 * Parishes are "compatible" when either side is missing (the rider may
 * not have a parish from Google — we don't reject on absent data), or
 * when their distinctive tokens overlap.
 *
 * Token comparison (not substring) so the TA's combined "Kingston and
 * St. Andrew" matches a rider parish of "Kingston" OR "St. Andrew",
 * and "Saint James" matches "St. James" — while "St. James" vs
 * "St. Catherine" correctly does NOT match (no shared token).
 */
function parishCompatible(
  routeParish: string | null,
  riderParish: string | null,
): boolean {
  if (!routeParish || !riderParish) return true;
  const r = parishTokens(routeParish);
  const p = parishTokens(riderParish);
  if (r.size === 0 || p.size === 0) return true;
  for (const t of p) if (r.has(t)) return true;
  return false;
}

function normaliseParish(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/\s+parish\s*$/i, "").trim();
}
