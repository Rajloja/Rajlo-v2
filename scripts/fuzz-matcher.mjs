#!/usr/bin/env node
/**
 * Property-based matcher fuzzer.
 *
 * Instead of hand-enumerating every Jamaican trip pattern (which
 * doesn't scale and stresses out whoever has to maintain it), this
 * script samples N random (pickup, dropoff) pairs from a grid
 * covering populated Jamaica, runs each through the matcher, and
 * asserts UNIVERSAL INVARIANTS on whatever corridors come back:
 *
 *   I1 — Every returned corridor's pickup walk ≤ CORRIDOR_RADIUS_KM
 *        (no corridor too far from the rider to walk to).
 *   I2 — Same for dropoff walk.
 *   I3 — Combined walk ≤ MAX_WALK_VS_TRIP_RATIO × trip distance.
 *   I4 — On-corridor distance ≥ MIN_USEFUL_CORRIDOR_KM.
 *   I5 — On-corridor distance ≥ MIN_USEFUL_CORRIDOR_FRACTION ×
 *        trip distance.
 *   I6 — Total motion (combined walk + on-corridor) ≤
 *        MAX_TOTAL_MOTION_RATIO × trip distance. Catches corridors
 *        that pass near both pickup and dropoff but RUN THE WRONG
 *        WAY — the rider rides 3 km of corridor + walks 2 km but
 *        the actual destination is 1.5 km away. The walk-budget
 *        gate alone misses this because walking might still be
 *        below the trip-distance threshold.
 *
 * I1–I5 are direct mirrors of the production gates — failures here
 * mean the production gate logic and the audit's mirror have drifted
 * apart. I6 is NEW: it's a property the matcher SHOULD respect that
 * the current gates don't enforce. Outliers on I6 are real bugs.
 *
 * The grid is a 0.02° lat × 0.02° lng mesh over populated Jamaica
 * (≈ 2 km cells). Trip distances are clamped to 0.3–25 km — the
 * realistic urban-to-cross-parish range route taxi serves. Pairs
 * with both points in unpopulated bush get implicitly filtered when
 * no corridor matches them.
 *
 * Outliers are printed sorted by severity. Each one is a candidate
 * for a new fixture entry. Once you've reviewed and acted on every
 * outlier, lock the worst into _matcher-fixture.mjs as mustExclude
 * entries so they can't silently come back.
 *
 * Determinism: a seeded PRNG so re-runs are reproducible. Change
 * --seed when you want a different sample.
 *
 * Usage:
 *   node scripts/fuzz-matcher.mjs              # 5000 trips, default seed
 *   node scripts/fuzz-matcher.mjs --n 20000    # more thorough
 *   node scripts/fuzz-matcher.mjs --seed 42    # different random sample
 *   node scripts/fuzz-matcher.mjs --verbose    # print all matches, not just outliers
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CORRIDOR_RADIUS_KM,
  MIN_USEFUL_CORRIDOR_KM,
  MIN_USEFUL_CORRIDOR_FRACTION,
  MAX_WALK_VS_TRIP_RATIO,
  haversineKm,
  runMatcher,
} from "./_matcher-gate-logic.mjs";

try {
  const t = readFileSync(resolve(".env.local"), "utf8");
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const argN = (() => {
  const i = process.argv.indexOf("--n");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 5000;
})();
const argSeed = (() => {
  const i = process.argv.indexOf("--seed");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 17;
})();
const VERBOSE = process.argv.includes("--verbose");

/* ─── Seeded PRNG (mulberry32) ─── */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─── Populated-Jamaica sampling regions ───
 *
 * The matcher serves real riders, so the sampler should hit real
 * populated places. Random uniform over the whole Jamaica bbox
 * wastes most samples in bush + sea. These regions are loose boxes
 * around the major population centres weighted to reflect roughly
 * where trips actually happen.
 */
const REGIONS = [
  // Kingston metropolitan area (highest weight — most trips happen here)
  { weight: 50, minLat: 17.94, maxLat: 18.08, minLng: -76.85, maxLng: -76.7 },
  // Spanish Town / Portmore corridor
  { weight: 15, minLat: 17.92, maxLat: 18.05, maxLng: -76.85, minLng: -77.0 },
  // Montego Bay / Hopewell coastal strip
  { weight: 10, minLat: 18.42, maxLat: 18.5, minLng: -78.0, maxLng: -77.85 },
  // Mandeville / Christiana
  { weight: 5, minLat: 18.0, maxLat: 18.2, minLng: -77.55, maxLng: -77.4 },
  // Ocho Rios / St. Ann coast
  { weight: 5, minLat: 18.4, maxLat: 18.5, minLng: -77.45, maxLng: -77.0 },
  // Negril / Westmoreland coast
  { weight: 5, minLat: 18.2, maxLat: 18.32, minLng: -78.4, maxLng: -78.05 },
  // May Pen / Clarendon
  { weight: 5, minLat: 17.92, maxLat: 18.05, minLng: -77.3, maxLng: -77.15 },
  // Port Antonio / Portland (lower density)
  { weight: 3, minLat: 18.13, maxLat: 18.22, minLng: -76.55, maxLng: -76.4 },
  // Linstead / St. Catherine northern strip
  { weight: 2, minLat: 18.1, maxLat: 18.2, minLng: -77.1, maxLng: -76.95 },
];

function pickRegion(rng) {
  const total = REGIONS.reduce((s, r) => s + r.weight, 0);
  let pick = rng() * total;
  for (const r of REGIONS) {
    pick -= r.weight;
    if (pick <= 0) return r;
  }
  return REGIONS[0];
}

function samplePoint(rng) {
  const region = pickRegion(rng);
  return {
    lat: region.minLat + rng() * (region.maxLat - region.minLat),
    lng: region.minLng + rng() * (region.maxLng - region.minLng),
  };
}

/** Generate a (pickup, dropoff) pair likely to produce a real trip.
 *
 *  Half the time, sample BOTH points from the same region (intra-
 *  parish trips — the matcher's bread and butter). Otherwise
 *  cross-region (rarer but should still produce zero matches when
 *  no corridor spans them). */
function sampleTrip(rng) {
  const sameRegion = rng() < 0.5;
  const a = samplePoint(rng);
  let b;
  if (sameRegion) {
    // Resample within the same region by accepting only points close
    // to `a`. Loose — just want them in a similar area.
    let tries = 0;
    do {
      b = samplePoint(rng);
      tries++;
    } while (haversineKm(a, b) > 15 && tries < 20);
  } else {
    b = samplePoint(rng);
  }
  return { pickup: a, dropoff: b };
}

/* ─── Extra invariants beyond the production gates ─── */

/** I6 — TOTAL MOTION (advisory).
 *  Total motion (walk + ride) vs trip distance. A corridor that
 *  forces the rider to traverse 4× the trip distance is suspicious
 *  but not necessarily wrong — route taxis follow meandering road
 *  paths that the rider accepts in exchange for not walking. 3.0
 *  is a soft warning threshold; we count but don't fail on it. */
const MAX_TOTAL_MOTION_RATIO = 3.0;

/** I7 — DIRECTION ALIGNMENT (hard gate candidate).
 *  The taxi's direction of travel along the corridor between the
 *  pickup and dropoff projections should roughly align with the
 *  rider's intended direction (pickup → dropoff vector). If the
 *  cosine of the angle between them is below this threshold, the
 *  taxi is essentially driving sideways or backwards relative to
 *  the rider's destination — the corridor is the wrong taxi line.
 *
 *  cos(60°) ≈ 0.5 — corridor and trip must point within 60° of
 *  each other. Anything wider is genuinely the wrong direction. */
const MIN_DIRECTION_COS = 0.5;

/** Linear interpolation along a polyline at fraction t ∈ [0,1] of
 *  total arc length. Returns the lat/lng of that point. */
function pointAlongPolyline(polyline, t) {
  if (!Array.isArray(polyline) || polyline.length < 2) return null;
  if (t <= 0) return polyline[0];
  if (t >= 1) return polyline[polyline.length - 1];
  const KM_PER_DEG_LAT = 111;
  let total = 0;
  const segLens = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const kmPerDegLng = 111 * Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * kmPerDegLng;
    const by = (b.lat - a.lat) * KM_PER_DEG_LAT;
    const len = Math.hypot(bx, by);
    segLens.push(len);
    total += len;
  }
  const target = t * total;
  let cum = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (cum + segLens[i] >= target) {
      const f = (target - cum) / (segLens[i] || 1);
      return {
        lat: polyline[i].lat + f * (polyline[i + 1].lat - polyline[i].lat),
        lng: polyline[i].lng + f * (polyline[i + 1].lng - polyline[i].lng),
      };
    }
    cum += segLens[i];
  }
  return polyline[polyline.length - 1];
}

/* ─── Main ─── */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log(`fuzz-matcher: n=${argN} seed=${argSeed} (deterministic)`);
console.log("Fetching active geocoded routes…");

const { data: routes, error } = await supabase
  .from("routes")
  .select(
    "id, slug, origin_name, destination_name, distance_km, " +
      "origin_lat, origin_lng, destination_lat, destination_lng, path_polyline",
  )
  .eq("active", true)
  .not("origin_lat", "is", null)
  .not("destination_lat", "is", null)
  .limit(2000);

if (error) {
  console.error(`fetch failed: ${error.message}`);
  process.exit(1);
}

console.log(`Loaded ${routes.length} routes. Running ${argN} fuzz trips…\n`);

const rng = makeRng(argSeed);

let tripsRun = 0;
let tripsWithMatch = 0;
let totalMatches = 0;
let perGateViolations = { I1: 0, I2: 0, I3: 0, I4: 0, I5: 0, I6: 0, I7: 0 };
const violators = [];

for (let i = 0; i < argN; i++) {
  const trip = sampleTrip(rng);
  const tripKm = haversineKm(trip.pickup, trip.dropoff);
  if (tripKm < 0.3 || tripKm > 25) {
    i--;
    continue;
  }
  tripsRun++;

  const top = runMatcher(routes, trip.pickup, trip.dropoff, 3);
  if (top.length === 0) continue;
  tripsWithMatch++;
  totalMatches += top.length;

  for (const m of top) {
    const { perpP, perpD, onCorridorKm, totalWalkKm } = m.diag;
    const violations = [];

    if (perpP > CORRIDOR_RADIUS_KM + 1e-6) {
      violations.push(`I1 perpP=${perpP.toFixed(2)} > ${CORRIDOR_RADIUS_KM}`);
      perGateViolations.I1++;
    }
    if (perpD > CORRIDOR_RADIUS_KM + 1e-6) {
      violations.push(`I2 perpD=${perpD.toFixed(2)} > ${CORRIDOR_RADIUS_KM}`);
      perGateViolations.I2++;
    }
    if (totalWalkKm > tripKm * MAX_WALK_VS_TRIP_RATIO + 1e-6) {
      violations.push(
        `I3 walk=${totalWalkKm.toFixed(2)} > ${(tripKm * MAX_WALK_VS_TRIP_RATIO).toFixed(2)}`,
      );
      perGateViolations.I3++;
    }
    if (onCorridorKm < MIN_USEFUL_CORRIDOR_KM - 1e-6) {
      violations.push(
        `I4 onCorr=${onCorridorKm.toFixed(2)} < ${MIN_USEFUL_CORRIDOR_KM}`,
      );
      perGateViolations.I4++;
    }
    if (onCorridorKm < tripKm * MIN_USEFUL_CORRIDOR_FRACTION - 1e-6) {
      violations.push(
        `I5 onCorr=${onCorridorKm.toFixed(2)} < ${(tripKm * MIN_USEFUL_CORRIDOR_FRACTION).toFixed(2)}`,
      );
      perGateViolations.I5++;
    }
    const totalMotion = totalWalkKm + onCorridorKm;
    if (totalMotion > tripKm * MAX_TOTAL_MOTION_RATIO + 1e-6) {
      violations.push(
        `I6 motion=${totalMotion.toFixed(2)} > ${(tripKm * MAX_TOTAL_MOTION_RATIO).toFixed(2)} (advisory: corridor adds substantial detour)`,
      );
      perGateViolations.I6++;
    }

    // I7 direction alignment: project pickup and dropoff onto the
    // polyline, then measure the angle between (rider's trip vector)
    // and (corridor's vector from pickup-projection to dropoff-
    // projection). If cos < 0.5 the taxi is going essentially
    // sideways relative to where the rider needs to go.
    const polyline = m.route.path_polyline;
    if (Array.isArray(polyline) && polyline.length >= 2) {
      const tP = m.diag.tP;
      const tD = m.diag.tD;
      // Only meaningful when projections are distinct enough that a
      // direction is defined. Same-point projections (|t_p - t_d| ≈ 0)
      // already trip I4 utilization, no extra check needed.
      if (Math.abs(tP - tD) > 0.02) {
        const projP = pointAlongPolyline(polyline, tP);
        const projD = pointAlongPolyline(polyline, tD);
        const riderVec = {
          lat: trip.dropoff.lat - trip.pickup.lat,
          lng: trip.dropoff.lng - trip.pickup.lng,
        };
        const corridorVec = {
          lat: projD.lat - projP.lat,
          lng: projD.lng - projP.lng,
        };
        const dot = riderVec.lat * corridorVec.lat + riderVec.lng * corridorVec.lng;
        const magR = Math.hypot(riderVec.lat, riderVec.lng);
        const magC = Math.hypot(corridorVec.lat, corridorVec.lng);
        const cos = magR > 0 && magC > 0 ? dot / (magR * magC) : 1;
        if (cos < MIN_DIRECTION_COS) {
          violations.push(
            `I7 cos=${cos.toFixed(2)} < ${MIN_DIRECTION_COS} (corridor runs at >60° angle to trip direction)`,
          );
          perGateViolations.I7++;
        }
      }
    }

    if (violations.length > 0) {
      violators.push({
        trip,
        tripKm,
        slug: m.route.slug,
        score: m.score,
        diag: m.diag,
        violations,
      });
    }
  }
}

console.log("─".repeat(70));
console.log(`Trips sampled:             ${tripsRun}`);
console.log(`Trips with ≥1 match:       ${tripsWithMatch}`);
console.log(`Total matches returned:    ${totalMatches}`);
console.log(
  `Match rate:                ${((tripsWithMatch / tripsRun) * 100).toFixed(1)}%`,
);
console.log(`Invariant violations:      ${violators.length}`);
console.log(`  I1 perp pickup           ${perGateViolations.I1}`);
console.log(`  I2 perp dropoff          ${perGateViolations.I2}`);
console.log(`  I3 walk budget           ${perGateViolations.I3}`);
console.log(`  I4 on-corridor floor     ${perGateViolations.I4}`);
console.log(`  I5 on-corridor fraction  ${perGateViolations.I5}`);
console.log(`  I6 total motion          ${perGateViolations.I6}  (advisory)`);
console.log(`  I7 direction alignment   ${perGateViolations.I7}  (HARD — corridor pointing wrong way)`);

if (violators.length === 0) {
  console.log(
    "\nNo invariant violations. The matcher's gates cover the I1–I5 " +
      "properties as expected, and I6 (total motion) is also satisfied " +
      "by every returned match.",
  );
  process.exit(0);
}

// Sort by severity. I7 first (corridor pointing wrong way is the
// real bug class — matcher returning corridor that goes sideways to
// the trip), then I6, then by how badly motion exceeded trip.
violators.sort((a, b) => {
  const aHasI7 = a.violations.some((v) => v.startsWith("I7"));
  const bHasI7 = b.violations.some((v) => v.startsWith("I7"));
  if (aHasI7 !== bHasI7) return aHasI7 ? -1 : 1;
  const aHasI6 = a.violations.some((v) => v.startsWith("I6"));
  const bHasI6 = b.violations.some((v) => v.startsWith("I6"));
  if (aHasI6 !== bHasI6) return aHasI6 ? -1 : 1;
  const aTotal = a.diag.totalWalkKm + a.diag.onCorridorKm;
  const bTotal = b.diag.totalWalkKm + b.diag.onCorridorKm;
  return bTotal / b.tripKm - aTotal / a.tripKm;
});

const HEAD = VERBOSE ? violators.length : Math.min(30, violators.length);
console.log(`\nTop ${HEAD} violators (review these — each is a candidate bug):\n`);
for (const v of violators.slice(0, HEAD)) {
  console.log(
    `  ${v.slug}  trip=${v.tripKm.toFixed(2)}km  walk=${v.diag.totalWalkKm.toFixed(2)}  ` +
      `onCorr=${v.diag.onCorridorKm.toFixed(2)}  score=${v.score.toFixed(2)}`,
  );
  console.log(
    `    pickup:  ${v.trip.pickup.lat.toFixed(5)}, ${v.trip.pickup.lng.toFixed(5)}`,
  );
  console.log(
    `    dropoff: ${v.trip.dropoff.lat.toFixed(5)}, ${v.trip.dropoff.lng.toFixed(5)}`,
  );
  for (const violation of v.violations) {
    console.log(`    ✗ ${violation}`);
  }
}

// I7 violations are the actionable signal — they indicate the
// matcher returned a corridor pointing the wrong way relative to
// the trip, which the existing production gates don't catch. I1–I5
// violations would mean the audit mirror has drifted from
// production. I6 is advisory only (long-but-meandering corridors
// are a route taxi reality, not bugs).
const i7Count = perGateViolations.I7;
const productionGateDrift =
  perGateViolations.I1 +
    perGateViolations.I2 +
    perGateViolations.I3 +
    perGateViolations.I4 +
    perGateViolations.I5 >
  0;

if (productionGateDrift) {
  console.error(
    "\nWARNING: I1–I5 violations detected. These are gates production " +
      "is supposed to enforce, so seeing them here means the audit's " +
      "mirror of the matcher logic has drifted from src/app/api/rider/" +
      "route-taxi/match/route.ts. Re-sync the two files.",
  );
  process.exit(1);
}

if (i7Count > 0) {
  console.error(
    `\n${i7Count} I7 violations — the matcher returned corridors pointing ` +
      "more than 60° away from the rider's trip direction. These are " +
      "real false positives — add the worst as mustExclude entries in " +
      "scripts/_matcher-fixture.mjs, then add a corresponding gate to " +
      "production (direction-alignment check in the geocoded branch).",
  );
  process.exit(1);
}

process.exit(0);
