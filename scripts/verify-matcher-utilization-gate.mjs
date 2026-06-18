#!/usr/bin/env node
/**
 * Audit: how many false route-taxi matches did the utilization gate
 * eliminate?
 *
 * Background — see src/app/api/rider/route-taxi/match/route.ts. The
 * matcher's geometric branch used to accept any corridor where both
 * the rider's pickup AND dropoff projected within CORRIDOR_RADIUS_KM
 * (2 km) of the corridor segment. That's too permissive: a trip
 * whose pickup and dropoff both sit near the SAME end of a corridor
 * passes the radius check while the on-corridor travel is ~0, so
 * the rider gets shown a corridor that doesn't actually serve them.
 *
 * The fix added a utilization gate:
 *
 *   onCorridorKm = |t_pickup − t_dropoff| × routeKm
 *   onCorridorKm ≥ max(0.5 km, 0.4 × tripKm)
 *
 * This script:
 *
 *   1. Pulls every active route from Supabase that has geocoded
 *      origin + destination coords.
 *   2. Runs each route against a hand-picked set of real Kingston-
 *      area trip patterns (the kinds of trips that historically
 *      triggered the bug — short urban trips where multiple
 *      corridors brush near the endpoints).
 *   3. For each (route × trip) pair, evaluates BOTH the old gate
 *      (perpendicular distance + distance gate only) and the new
 *      gate (above + utilization). Reports any corridor that the
 *      old gate would have accepted but the new gate rejects —
 *      that's a false match the fix is killing.
 *
 * No writes — pure read-only diagnostic. Safe against any DB.
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/verify-matcher-utilization-gate.mjs
 *   node scripts/verify-matcher-utilization-gate.mjs --verbose
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CORRIDOR_RADIUS_KM,
  TRIP_DISTANCE_SLACK,
  TRIP_DISTANCE_PAD_KM,
  MIN_USEFUL_CORRIDOR_KM,
  MIN_USEFUL_CORRIDOR_FRACTION,
  MAX_WALK_VS_TRIP_RATIO,
  haversineKm,
  projectToSegment,
} from "./_matcher-gate-logic.mjs";

const VERBOSE = process.argv.includes("--verbose");

try {
  const envText = readFileSync(resolve(".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* env must be set by caller */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "verify-matcher: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ─── Test trip patterns ─── */
// Real Kingston-area locations sourced by dropping pins on Google
// Maps. Each entry is a candidate trip a real rider might make. We
// pair them all-against-all (skipping self-pairs) to generate the
// trip matrix.
const PLACES = [
  { name: "School of Dance",     lat: 18.0007, lng: -76.7790 },
  { name: "Half Way Tree",       lat: 18.012,  lng: -76.798  },
  { name: "Cross Roads",         lat: 18.001,  lng: -76.785  },
  { name: "Liguanea",            lat: 18.014,  lng: -76.767  },
  { name: "Papine",              lat: 18.022,  lng: -76.745  },
  { name: "Constant Spring",     lat: 18.048,  lng: -76.795  },
  { name: "Devon House",         lat: 18.018,  lng: -76.785  },
  { name: "New Kingston",        lat: 18.005,  lng: -76.785  },
  { name: "Downtown",            lat: 17.968,  lng: -76.793  },
  { name: "UWI Mona",            lat: 18.007,  lng: -76.7464 },
  { name: "Hope Gardens",        lat: 18.018,  lng: -76.760  },
  { name: "Sovereign Centre",    lat: 18.022,  lng: -76.772  },
  { name: "King's House",        lat: 18.030,  lng: -76.797  },
  { name: "Maxfield Avenue",     lat: 17.998,  lng: -76.804  },
  { name: "August Town",         lat: 18.024,  lng: -76.737  },
  { name: "Mona Heights",        lat: 18.0095, lng: -76.746  },
];

function buildTrips() {
  const trips = [];
  for (const p of PLACES) {
    for (const d of PLACES) {
      if (p.name === d.name) continue;
      const tripKm = haversineKm(p, d);
      // Realistic urban-hail trips: 0.3 km to 12 km. Outside that
      // range route taxi isn't the question being asked.
      if (tripKm < 0.3 || tripKm > 12) continue;
      trips.push({ pickup: p, dropoff: d, tripKm });
    }
  }
  return trips;
}

/* ─── Gate evaluation ─── */

/**
 * Replays the matcher's geocoded branch for one (route, trip) pair.
 * Returns:
 *   - oldAccept: whether the pre-fix gate (perp + distance) accepts
 *   - newAccept: whether the post-fix gate (adds utilization) accepts
 *   - diag: numbers used for the rejection reason
 *
 * Skipped (returns null) when:
 *   - route has no coords
 *   - distance gate rejects it (both gates rejected, no change)
 */
function evaluate(route, trip) {
  const routeKm = Number(route.distance_km);
  if (!Number.isFinite(routeKm) || routeKm <= 0) return null;

  // Distance gate — same on both sides of the fix.
  if (trip.tripKm > routeKm * TRIP_DISTANCE_SLACK + TRIP_DISTANCE_PAD_KM)
    return null;

  if (
    route.origin_lat == null ||
    route.origin_lng == null ||
    route.destination_lat == null ||
    route.destination_lng == null
  ) {
    return null;
  }
  const origin = { lat: Number(route.origin_lat), lng: Number(route.origin_lng) };
  const dest = {
    lat: Number(route.destination_lat),
    lng: Number(route.destination_lng),
  };
  const segP = projectToSegment(trip.pickup, origin, dest);
  const segD = projectToSegment(trip.dropoff, origin, dest);

  // Old gate: perp distance only.
  const oldAccept =
    segP.distKm <= CORRIDOR_RADIUS_KM && segD.distKm <= CORRIDOR_RADIUS_KM;

  if (!oldAccept) return { oldAccept: false, newAccept: false };

  // New gates: utilization + walk-budget.
  const onCorridorKm = Math.abs(segP.t - segD.t) * routeKm;
  const minUseful = Math.max(
    MIN_USEFUL_CORRIDOR_KM,
    trip.tripKm * MIN_USEFUL_CORRIDOR_FRACTION,
  );
  const totalWalkKm = segP.distKm + segD.distKm;
  const utilizationOK = onCorridorKm >= minUseful;
  const walkBudgetOK = totalWalkKm <= trip.tripKm * MAX_WALK_VS_TRIP_RATIO;
  const newAccept = utilizationOK && walkBudgetOK;

  return {
    oldAccept,
    newAccept,
    diag: {
      perpP: segP.distKm,
      perpD: segD.distKm,
      tP: segP.t,
      tD: segD.t,
      onCorridorKm,
      minUseful,
      totalWalkKm,
      routeKm,
    },
  };
}

/* ─── Main ─── */

console.log("verify-matcher-utilization-gate: fetching routes…");
const { data: routes, error } = await supabase
  .from("routes")
  .select(
    "id, origin_name, destination_name, distance_km, " +
      "origin_lat, origin_lng, destination_lat, destination_lng",
  )
  .eq("active", true)
  .not("origin_lat", "is", null)
  .not("destination_lat", "is", null)
  .limit(2000);

if (error) {
  console.error(`fetch failed: ${error.message}`);
  process.exit(1);
}

const trips = buildTrips();
console.log(
  `verify-matcher: ${routes.length} geocoded active routes × ${trips.length} ` +
    `synthetic trips = ${routes.length * trips.length} pairs to evaluate.\n`,
);

let totalPairs = 0;
let oldAcceptCount = 0;
let bothAcceptCount = 0;
let flipped = [];
let stillAccepted = [];

for (const route of routes) {
  for (const trip of trips) {
    const r = evaluate(route, trip);
    if (!r) continue;
    totalPairs++;
    if (r.oldAccept) oldAcceptCount++;
    if (r.oldAccept && r.newAccept) {
      bothAcceptCount++;
      stillAccepted.push({ route, trip, ...r.diag });
    }
    if (r.oldAccept && !r.newAccept) {
      flipped.push({ route, trip, ...r.diag });
    }
  }
}

console.log(
  `Pairs evaluated:           ${totalPairs.toLocaleString()}\n` +
    `Old gate accepted:         ${oldAcceptCount.toLocaleString()}\n` +
    `New gate still accepts:    ${bothAcceptCount.toLocaleString()}\n` +
    `New gate REJECTS (flipped): ${flipped.length.toLocaleString()}\n`,
);

if (flipped.length === 0) {
  console.log("No false matches found by the new gate — nothing to clean up.");
  process.exit(0);
}

// Sort flipped matches by how egregious they were (smallest on-corridor
// utilization first — those are the worst false matches).
flipped.sort((a, b) => a.onCorridorKm - b.onCorridorKm);

console.log("Top 20 worst false matches the fix now rejects:\n");
console.log(
  "  trip                                          corridor                            tripKm  onCorr  needed   walk");
console.log(
  "  ────────────────────────────────────────────  ──────────────────────────────────  ──────  ──────  ──────  ─────",
);
for (const f of flipped.slice(0, 25)) {
  const tripLabel = `${f.trip.pickup.name} → ${f.trip.dropoff.name}`.padEnd(46);
  const corridorLabel = `${f.route.origin_name} → ${f.route.destination_name}`.padEnd(
    34,
  );
  console.log(
    `  ${tripLabel}  ${corridorLabel}  ${f.trip.tripKm.toFixed(2).padStart(6)}  ${f.onCorridorKm.toFixed(2).padStart(6)}  ${f.minUseful.toFixed(2).padStart(6)}  ${f.totalWalkKm.toFixed(2).padStart(5)}`,
  );
}

// Per-trip aggregation — which trips were getting the most spurious
// matches?
const perTrip = new Map();
for (const f of flipped) {
  const k = `${f.trip.pickup.name} → ${f.trip.dropoff.name}`;
  perTrip.set(k, (perTrip.get(k) ?? 0) + 1);
}
const tripRanking = [...perTrip.entries()].sort((a, b) => b[1] - a[1]);

console.log("\nTrips that received the most spurious matches (top 10):\n");
for (const [trip, count] of tripRanking.slice(0, 10)) {
  console.log(`  ${count.toString().padStart(3)} × ${trip}`);
}

// Per-corridor aggregation — which corridors were over-matching?
const perCorridor = new Map();
for (const f of flipped) {
  const k = `${f.route.origin_name} → ${f.route.destination_name}`;
  perCorridor.set(k, (perCorridor.get(k) ?? 0) + 1);
}
const corridorRanking = [...perCorridor.entries()].sort(
  (a, b) => b[1] - a[1],
);

console.log("\nCorridors that were over-matching the most (top 10):\n");
for (const [corridor, count] of corridorRanking.slice(0, 10)) {
  console.log(`  ${count.toString().padStart(3)} × ${corridor}`);
}

// Show matches that still pass — sanity check these are all legitimate.
stillAccepted.sort((a, b) => b.onCorridorKm - a.onCorridorKm);
console.log("\nMatches the new gate still ACCEPTS (sanity-check these are real):\n");
console.log(
  "  trip                                          corridor                            tripKm  onCorr   walk",
);
console.log(
  "  ────────────────────────────────────────────  ──────────────────────────────────  ──────  ──────  ─────",
);
for (const f of stillAccepted.slice(0, 25)) {
  const tripLabel = `${f.trip.pickup.name} → ${f.trip.dropoff.name}`.padEnd(46);
  const corridorLabel = `${f.route.origin_name} → ${f.route.destination_name}`.padEnd(34);
  console.log(
    `  ${tripLabel}  ${corridorLabel}  ${f.trip.tripKm.toFixed(2).padStart(6)}  ${f.onCorridorKm.toFixed(2).padStart(6)}  ${f.totalWalkKm.toFixed(2).padStart(5)}`,
  );
}

if (VERBOSE) {
  console.log("\nFull flipped-match list (verbose):\n");
  for (const f of flipped) {
    console.log(
      `  ${f.trip.pickup.name} → ${f.trip.dropoff.name} (${f.trip.tripKm.toFixed(2)} km) ` +
        `vs ${f.route.origin_name} → ${f.route.destination_name} (${f.routeKm.toFixed(2)} km): ` +
        `tP=${f.tP.toFixed(2)} tD=${f.tD.toFixed(2)} ` +
        `onCorr=${f.onCorridorKm.toFixed(2)} needed=${f.minUseful.toFixed(2)} ` +
        `perp=(${f.perpP.toFixed(2)}, ${f.perpD.toFixed(2)})`,
    );
  }
}
