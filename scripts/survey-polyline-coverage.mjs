#!/usr/bin/env node
/**
 * Quick survey: how many active geocoded routes have path_polyline
 * populated, vs how many would need a backfill?
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

try {
  const t = readFileSync(resolve(".env.local"), "utf8");
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await supabase
  .from("routes")
  .select("id, slug, distance_km, origin_lat, destination_lat, path_polyline")
  .eq("active", true)
  .limit(2000);

if (error) { console.error(error.message); process.exit(1); }

let geocoded = 0;
let polylined = 0;
let geocodedNoPolyline = 0;
const sample = { withPolyline: [], withoutPolyline: [] };

for (const r of data) {
  const isGeocoded = r.origin_lat != null && r.destination_lat != null;
  const hasPolyline = Array.isArray(r.path_polyline) && r.path_polyline.length >= 2;
  if (isGeocoded) geocoded++;
  if (hasPolyline) polylined++;
  if (isGeocoded && !hasPolyline) {
    geocodedNoPolyline++;
    if (sample.withoutPolyline.length < 5) sample.withoutPolyline.push(r.slug);
  } else if (isGeocoded && hasPolyline) {
    if (sample.withPolyline.length < 5) {
      sample.withPolyline.push(`${r.slug} (${r.path_polyline.length} pts)`);
    }
  }
}

console.log(`Active routes:                        ${data.length}`);
console.log(`Geocoded (origin+dest coords):        ${geocoded}`);
console.log(`Have path_polyline:                   ${polylined}`);
console.log(`Geocoded but NO polyline (need backfill): ${geocodedNoPolyline}`);
console.log(`\nSample with polyline:`);
sample.withPolyline.forEach((s) => console.log(`  ${s}`));
console.log(`\nSample without polyline:`);
sample.withoutPolyline.forEach((s) => console.log(`  ${s}`));
