#!/usr/bin/env node
/**
 * Geocode the route catalogue — fills in origin/destination lat/lng on
 * every `routes` row so the route-taxi matcher can do real geographic
 * proximity instead of name-token guessing.
 *
 * Run once after applying `supabase/route-coordinates-migration.sql`.
 * Idempotent: only routes still missing coordinates are geocoded, so
 * re-running is safe and resumes where a previous run left off.
 *
 * Required env (read from .env.local automatically when present):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_MAPS_SERVER_KEY  (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 *     — the key MUST have the Geocoding API enabled.
 *
 * Usage:
 *   node scripts/geocode-routes.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local if present (best-effort — dotenv isn't a dep).
try {
  const envText = readFileSync(resolve(".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env.local — env must be set by caller */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapsKey =
  process.env.GOOGLE_MAPS_SERVER_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

if (!url || !key) {
  console.error(
    "geocode-routes: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}
if (!mapsKey) {
  console.error(
    "geocode-routes: missing GOOGLE_MAPS_SERVER_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Geocode one "place, parish, Jamaica" string → {lat,lng} or null. */
async function geocode(place, parish) {
  const address = [place, parish, "Jamaica"].filter(Boolean).join(", ");
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", address);
  u.searchParams.set("region", "jm");
  u.searchParams.set("key", mapsKey);
  // Bias hard to the Jamaica bounding box so ambiguous names
  // ("Richmond", "Hopewell") don't resolve to a foreign country.
  u.searchParams.set("bounds", "17.7,-78.4|18.55,-76.2");
  try {
    const res = await fetch(u.toString());
    const data = await res.json();
    if (data.status === "OK" && data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    if (data.status === "ZERO_RESULTS") return null;
    // REQUEST_DENIED is a key/config problem — it will fail for EVERY
    // route, so stop now with instructions rather than churn 2,000
    // doomed calls.
    if (data.status === "REQUEST_DENIED") {
      console.error(
        "\ngeocode-routes: Google rejected the request (REQUEST_DENIED)." +
          (data.error_message ? `\n  Google says: ${data.error_message}` : "") +
          "\n\n  The API key can't call the Geocoding API. To fix:" +
          "\n   1. Google Cloud Console → enable the 'Geocoding API'." +
          "\n   2. Use a SERVER key, not the browser key. The browser key" +
          "\n      (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) is locked to HTTP" +
          "\n      referrers, so a script with no referrer is denied." +
          "\n   3. Create a key with Application restrictions = None (or" +
          "\n      'IP addresses'), allow the Geocoding API on it, and add" +
          "\n      it to .env.local as:" +
          "\n        GOOGLE_MAPS_SERVER_KEY=your_server_key" +
          "\n   4. Re-run: node scripts/geocode-routes.mjs\n",
      );
      process.exit(1);
    }
    // OVER_QUERY_LIMIT / INVALID_REQUEST etc. — skip this one, continue.
    console.warn(
      `geocode-routes: "${address}" → ${data.status}` +
        (data.error_message ? ` — ${data.error_message}` : ""),
    );
    return null;
  } catch (e) {
    console.warn(`geocode-routes: "${address}" failed: ${e.message}`);
    return null;
  }
}

const PAGE = 300;
let processed = 0;
let geocoded = 0;
let skipped = 0;

console.log("geocode-routes: starting…");

// Geocoded rows drop out of the `coords IS NULL` filter, so we always
// read the next page from the top. We stop when a whole page yields
// zero new geocodes — those remaining rows can't be resolved.
for (;;) {
  const { data: routes, error } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, origin_lat, destination_lat",
    )
    .or("origin_lat.is.null,destination_lat.is.null")
    .limit(PAGE);

  if (error) {
    console.error(`geocode-routes: fetch failed: ${error.message}`);
    process.exit(1);
  }
  if (!routes || routes.length === 0) break;

  let geocodedThisPage = 0;
  for (const r of routes) {
    processed++;
    const update = {};

    if (r.origin_lat == null) {
      const c = await geocode(r.origin_name, r.origin_parish);
      await sleep(120); // ~8 req/s — polite, well under Google's limit
      if (c) {
        update.origin_lat = c.lat;
        update.origin_lng = c.lng;
      }
    }
    if (r.destination_lat == null) {
      const c = await geocode(r.destination_name, r.destination_parish);
      await sleep(120);
      if (c) {
        update.destination_lat = c.lat;
        update.destination_lng = c.lng;
      }
    }

    if (Object.keys(update).length > 0) {
      const { error: upErr } = await supabase
        .from("routes")
        .update(update)
        .eq("id", r.id);
      if (upErr) {
        console.warn(`geocode-routes: update ${r.id} failed: ${upErr.message}`);
      } else {
        geocoded++;
        geocodedThisPage++;
      }
    } else {
      skipped++;
    }

    if (processed % 100 === 0) {
      console.log(
        `geocode-routes: processed=${processed} geocoded=${geocoded} skipped=${skipped}`,
      );
    }
  }

  // A whole page produced no new geocodes → the rows still missing
  // coords are un-resolvable (bad names). Stop rather than loop forever.
  if (geocodedThisPage === 0) {
    console.warn(
      `geocode-routes: ${routes.length} route(s) couldn't be geocoded — stopping.`,
    );
    break;
  }
}

console.log(
  `geocode-routes: done · processed=${processed} geocoded=${geocoded} skipped=${skipped}`,
);
process.exit(0);
