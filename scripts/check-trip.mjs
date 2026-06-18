#!/usr/bin/env node
/**
 * Quick one-shot: run a specific (pickup, dropoff) through the
 * matcher against the live routes table and print every top match
 * with diagnostics. Used to verify reported trips by hand.
 *
 * Usage:
 *   node scripts/check-trip.mjs <pickup-lat> <pickup-lng> <dropoff-lat> <dropoff-lng>
 *   node scripts/check-trip.mjs 18.012 -76.798 17.998 -76.804  # HWT → Maxfield
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runMatcher, haversineKm } from "./_matcher-gate-logic.mjs";

try {
  const t = readFileSync(resolve(".env.local"), "utf8");
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const [pLat, pLng, dLat, dLng] = process.argv.slice(2).map(Number);
if ([pLat, pLng, dLat, dLng].some((n) => !Number.isFinite(n))) {
  console.error("usage: node scripts/check-trip.mjs <pLat> <pLng> <dLat> <dLng>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
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
if (error) { console.error(error.message); process.exit(1); }

// Allow optional --pickup-name / --dropoff-name args to exercise the
// name-match bonus in the matcher. Defaults to empty so legacy calls
// (positional lat/lng only) still work.
const pickupName = (() => {
  const i = process.argv.indexOf("--pickup-name");
  return i >= 0 ? process.argv[i + 1] : "";
})();
const dropoffName = (() => {
  const i = process.argv.indexOf("--dropoff-name");
  return i >= 0 ? process.argv[i + 1] : "";
})();
const pickup = { lat: pLat, lng: pLng, name: pickupName };
const dropoff = { lat: dLat, lng: dLng, name: dropoffName };
const tripKm = haversineKm(pickup, dropoff);
const top = runMatcher(routes, pickup, dropoff, 5);

console.log(`Trip: (${pLat}, ${pLng}) → (${dLat}, ${dLng})`);
console.log(`Trip distance (straight-line): ${tripKm.toFixed(2)} km\n`);

if (top.length === 0) {
  console.log("No matches. Matcher would return [] — UI shows 'Private Ride only'.");
  process.exit(0);
}

console.log(`Top ${top.length} match${top.length > 1 ? "es" : ""} (sorted by score):\n`);
for (let i = 0; i < top.length; i++) {
  const m = top[i];
  const d = m.diag;
  console.log(`  ${i + 1}. ${m.route.origin_name} → ${m.route.destination_name}`);
  console.log(`     slug:        ${m.route.slug}`);
  console.log(`     score:       ${m.score.toFixed(2)}`);
  console.log(`     direction:   ${m.direction}`);
  console.log(`     on-corridor: ${d.onCorridorKm.toFixed(2)} km`);
  console.log(`     walk total:  ${d.totalWalkKm.toFixed(2)} km (${((d.totalWalkKm / d.tripKm) * 100).toFixed(0)}% of trip)`);
  console.log(`     pickup perp: ${d.perpP.toFixed(2)} km (t=${d.tP.toFixed(2)})`);
  console.log(`     dropoff perp:${d.perpD.toFixed(2)} km (t=${d.tD.toFixed(2)})`);
  console.log("");
}
