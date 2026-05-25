#!/usr/bin/env node
/**
 * Backfill `routes.path_polyline` for any active corridor missing one.
 *
 * Why this exists: the pathfinder's lazy-fetch fires Google Directions
 * calls for ALL routes with NULL polyline at once (unbounded
 * Promise.allSettled). With 880+ routes, that bursts well above
 * Google's ~50 req/sec rate limit and most calls come back null. So
 * polylines stay missing — including critical corridors like
 * Negril → Savanna La Mar, which then forces the pathfinder to use
 * straight-line projection and pick worse routes.
 *
 * This script does the same fetch but THROTTLED: 8 concurrent requests
 * max, ~120 ms between completions, with one automatic retry per
 * failed route. Result: ~90 sec to backfill the whole catalogue
 * cleanly. Safe to re-run — only fills NULL polylines.
 *
 * Required env (read from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_MAPS_SERVER_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 *
 * Usage:
 *   node scripts/backfill-polylines.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

try {
  const envText = readFileSync(resolve(".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env.local */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapsKey =
  process.env.GOOGLE_MAPS_SERVER_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

if (!url || !key) {
  console.error(
    "backfill-polylines: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}
if (!mapsKey) {
  console.error(
    "backfill-polylines: missing GOOGLE_MAPS_SERVER_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CONCURRENCY = 8;
const SLEEP_MS = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google's encoded polyline algorithm — duplicated here so this
// script has zero TypeScript / build dependencies. Same algorithm as
// lib/polyline.ts.
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

async function fetchPolyline(origin, destination) {
  const u = new URL("https://maps.googleapis.com/maps/api/directions/json");
  u.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  u.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  u.searchParams.set("mode", "driving");
  u.searchParams.set("region", "jm");
  u.searchParams.set("key", mapsKey);
  const res = await fetch(u.toString(), { cache: "no-store" });
  if (!res.ok) return { ok: false, status: `http_${res.status}` };
  const data = await res.json();
  if (data.status !== "OK") return { ok: false, status: data.status };
  const route = data.routes?.[0];
  if (!route?.overview_polyline?.points) return { ok: false, status: "no_polyline" };
  const points = decodePolyline(route.overview_polyline.points);
  if (points.length < 2) return { ok: false, status: "polyline_too_short" };
  return { ok: true, points };
}

// Pool runner — fixed concurrency of N workers each pulling from the
// queue. Simpler + more predictable than chunked Promise.all batches.
async function pool(items, worker, concurrency) {
  let i = 0;
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      const r = await worker(items[idx], idx);
      results[idx] = r;
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log("backfill-polylines: loading routes missing polyline…");
  const { data: routes, error } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_lat, origin_lng, destination_lat, destination_lng",
    )
    .eq("active", true)
    .is("path_polyline", null)
    .not("origin_lat", "is", null)
    .not("destination_lat", "is", null);

  if (error) {
    console.error(`backfill-polylines: load failed: ${error.message}`);
    process.exit(1);
  }
  if (!routes || routes.length === 0) {
    console.log("backfill-polylines: nothing to do — all active routes already have polylines");
    return;
  }
  console.log(`backfill-polylines: ${routes.length} routes need polylines`);

  // First pass.
  const first = await pool(
    routes,
    async (r) => {
      const res = await fetchPolyline(
        { lat: r.origin_lat, lng: r.origin_lng },
        { lat: r.destination_lat, lng: r.destination_lng },
      );
      await sleep(SLEEP_MS);
      if (res.ok) {
        await supabase
          .from("routes")
          .update({ path_polyline: res.points })
          .eq("id", r.id);
      }
      return { id: r.id, label: `${r.origin_name} → ${r.destination_name}`, ...res };
    },
    CONCURRENCY,
  );

  const failed = first.filter((r) => !r.ok);
  const succeeded = first.length - failed.length;
  console.log(
    `backfill-polylines: pass 1 — ok=${succeeded} failed=${failed.length}`,
  );

  // Retry pass — typically catches transient OVER_QUERY_LIMIT throttles.
  if (failed.length > 0) {
    console.log(`backfill-polylines: retrying ${failed.length} failed routes…`);
    await sleep(2000); // breather before retry
    const retryRows = routes.filter((r) => failed.some((f) => f.id === r.id));
    const retried = await pool(
      retryRows,
      async (r) => {
        const res = await fetchPolyline(
          { lat: r.origin_lat, lng: r.origin_lng },
          { lat: r.destination_lat, lng: r.destination_lng },
        );
        await sleep(SLEEP_MS);
        if (res.ok) {
          await supabase
            .from("routes")
            .update({ path_polyline: res.points })
            .eq("id", r.id);
        }
        return { id: r.id, label: `${r.origin_name} → ${r.destination_name}`, ...res };
      },
      CONCURRENCY,
    );
    const stillFailed = retried.filter((r) => !r.ok);
    console.log(
      `backfill-polylines: pass 2 — recovered ${retried.length - stillFailed.length}, still failing ${stillFailed.length}`,
    );
    if (stillFailed.length > 0) {
      console.log("backfill-polylines: routes still without a polyline:");
      for (const r of stillFailed.slice(0, 20)) {
        console.log(`  - ${r.label}  [${r.status}]`);
      }
      if (stillFailed.length > 20) {
        console.log(`  ...and ${stillFailed.length - 20} more`);
      }
    }
  }

  console.log("backfill-polylines: done");
}

main().catch((e) => {
  console.error(`backfill-polylines: ${e.message}`);
  process.exit(1);
});
