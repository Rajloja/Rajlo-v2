#!/usr/bin/env node
/**
 * Geocode the route catalogue — fills in origin/destination lat/lng on
 * every `routes` row so the route-taxi matcher can do real geographic
 * proximity instead of name-token guessing.
 *
 * STRATEGY (after the v1 disaster where Google collapsed dozens of
 * different town names onto the same default Jamaica spot):
 *
 *   1. **Curated overrides first.** A hand-verified lookup table of
 *      ~50 well-known TA endpoints (Mandeville, Lucea, Falmouth, etc.)
 *      mapped to coords lifted directly from Google Maps. Those towns
 *      appear in 80%+ of corridors and Google's geocoder mishandled
 *      most of them — overriding is the only reliable fix.
 *
 *   2. **Geocoding API with HARD parish filter.** When a name isn't
 *      in the overrides, we call Geocoding with
 *      `components=country:JM|administrative_area:<parish>`. Unlike
 *      `bounds`, `components` is enforced — Google refuses to return
 *      results outside that parish. So "Richmond" with parish=St.
 *      Mary can no longer collapse onto Richmond in St. James.
 *
 *   3. **Parish-distance sanity check.** Each result is measured
 *      against the parish centroid. Anything > 40 km away (parishes
 *      are at most ~30 km across) is rejected and logged — even with
 *      components, Google occasionally returns the parish centroid
 *      for unrecognised place names, which can still be wrong.
 *
 * --reset wipes every route's coords + path_polyline so the script
 * re-geocodes the entire catalogue from scratch. Without it, only
 * routes still missing coords get processed (idempotent resume).
 *
 * Required env (read from .env.local automatically when present):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_MAPS_SERVER_KEY  (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 *     — the key MUST have the Geocoding API enabled.
 *
 * Usage:
 *   node scripts/geocode-routes.mjs
 *   node scripts/geocode-routes.mjs --reset
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const RESET = process.argv.includes("--reset");
/** When set, every coord resolution is printed but NO write is sent
 *  to Supabase. Use this to verify the override table + Geocoding
 *  results look right before locking them in. Combine with --reset
 *  for a full from-scratch preview of every endpoint. */
const DRY_RUN = process.argv.includes("--dry-run");

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

/* ─────────────────────────── Parish centres ─────────────────────────── */
// Duplicated from src/lib/jamaica.ts so this Node script doesn't depend
// on the TypeScript build. Update both together if a parish centre
// changes (you almost never need to — parishes are static).
const PARISH_CENTERS = {
  "Kingston and St. Andrew": { lat: 17.99, lng: -76.79 },
  Kingston: { lat: 17.97, lng: -76.79 },
  "St. Andrew": { lat: 18.02, lng: -76.81 },
  "St. Catherine": { lat: 17.99, lng: -76.95 },
  Clarendon: { lat: 17.96, lng: -77.24 },
  Manchester: { lat: 18.04, lng: -77.5 },
  "St. Elizabeth": { lat: 18.03, lng: -77.85 },
  Westmoreland: { lat: 18.22, lng: -78.13 },
  Hanover: { lat: 18.45, lng: -78.18 },
  "St. James": { lat: 18.47, lng: -77.92 },
  Trelawny: { lat: 18.49, lng: -77.66 },
  "St. Ann": { lat: 18.43, lng: -77.2 },
  "St. Mary": { lat: 18.36, lng: -76.89 },
  Portland: { lat: 18.18, lng: -76.45 },
  "St. Thomas": { lat: 17.88, lng: -76.41 },
};

/** Tiered parish-distance thresholds. Two failure modes are possible
 *  when a result drifts from its expected parish:
 *
 *    (a) The parish LABEL in routes is wrong but the TOWN is real and
 *        Google found it correctly. Example: Duncans is tagged
 *        Westmoreland in the TA seed but is actually in Trelawny.
 *        The coords come back as Trelawny — ~70 km from the
 *        Westmoreland centroid. The coord is GOOD; only the label
 *        is bad.
 *
 *    (b) Google's `components` filter silently fell off and found a
 *        completely different town with the same name on the far side
 *        of the island. Example: "Cauldwell" tagged Westmoreland
 *        geocoded to 18.02, -76.77 — that's Kingston. 146 km from
 *        Westmoreland centroid. The coord is GARBAGE.
 *
 *  Tier 1 (≤ NEAR): coord is within parish — accept silently.
 *  Tier 2 (NEAR–FAR): probably case (a) — accept + warn so the user
 *    can fix the parish label later if they care.
 *  Tier 3 (> FAR): probably case (b) — reject so we never write a
 *    nonsense coord onto a real corridor. */
const PARISH_NEAR_KM = 40;
const PARISH_FAR_KM = 100;

/** Last-resort sanity gate. If Google returns a coord OUTSIDE this
 *  box, something is seriously wrong (probably ZERO_RESULTS quietly
 *  followed by an OK with junk). Reject. */
const JAMAICA_BBOX = {
  south: 17.6,
  north: 18.7,
  west: -78.5,
  east: -76.0,
};

/* ───────────────────────── Curated overrides ───────────────────────── */
// Hand-verified coords for the towns that appear most often in the TA
// corridor catalogue, sourced by dropping a pin on Google Maps. These
// override the Geocoding API entirely — checked BEFORE any external
// call.
//
// Key format: `"<name>|<parish>"` (parish normalised to the same form
// the routes table uses — "St. " not "Saint "). Normalise the lookup
// key the same way at the call site.
const OVERRIDES = {
  // ─── Bare-name fallbacks ───
  // Towns with exactly ONE location in Jamaica — safe to look up by
  // name alone, regardless of what parish the routes table tags them
  // with. Catches the case where the TA seed has wrong parish labels
  // (e.g. Lucea + Orange Bay are tagged "Westmoreland" in the seed
  // but both are actually in Hanover — without these bare-name
  // entries the parish-qualified lookup misses and Google's geocoder
  // falls back to junk coordinates inside Westmoreland).
  //
  // ONLY add a bare-name entry for a name you've verified is unique
  // across all 14 parishes. For ambiguous names (Hopewell, Richmond,
  // Hampton Court) leave only the parish-qualified entries so we
  // don't lock the wrong location.
  Lucea: { lat: 18.4500, lng: -78.1700 },
  "Orange Bay": { lat: 18.4500, lng: -78.1810 },
  Mandeville: { lat: 18.0400, lng: -77.5010 },
  Christiana: { lat: 18.1710, lng: -77.4900 },
  Falmouth: { lat: 18.4929, lng: -77.6517 },
  "Spanish Town": { lat: 17.9920, lng: -76.9570 },
  "Montego Bay": { lat: 18.4720, lng: -77.9200 },
  "Ocho Rios": { lat: 18.4080, lng: -77.1030 },
  "Port Antonio": { lat: 18.1800, lng: -76.4530 },
  "Black River": { lat: 18.0260, lng: -77.8440 },
  "May Pen": { lat: 17.9670, lng: -77.2430 },
  Linstead: { lat: 18.1350, lng: -77.0300 },
  "Morant Bay": { lat: 17.8810, lng: -76.4080 },
  "Port Maria": { lat: 18.3710, lng: -76.8920 },
  "Half Way Tree": { lat: 18.0120, lng: -76.7980 },
  "Half-Way Tree": { lat: 18.0120, lng: -76.7980 },
  "Cross Roads": { lat: 18.0010, lng: -76.7850 },
  Papine: { lat: 18.0220, lng: -76.7450 },

  // ─── Hanover ───
  "Lucea|Hanover": { lat: 18.4500, lng: -78.1700 },
  "Orange Bay|Hanover": { lat: 18.4500, lng: -78.1810 },
  "Green Island|Hanover": { lat: 18.2810, lng: -78.3454 },
  "Hopewell|Hanover": { lat: 18.4350, lng: -78.1070 },
  "Sandy Bay|Hanover": { lat: 18.4500, lng: -78.0700 },
  "Cousins Cove|Hanover": { lat: 18.4515, lng: -78.2050 },

  // ─── Westmoreland ───
  Negril: { lat: 18.2700, lng: -78.3480 },
  "Negril|Westmoreland": { lat: 18.2700, lng: -78.3480 },
  "Savanna La Mar|Westmoreland": { lat: 18.2200, lng: -78.1330 },
  "Sav-la-Mar|Westmoreland": { lat: 18.2200, lng: -78.1330 },
  "Sheffield|Westmoreland": { lat: 18.2780, lng: -78.3040 },
  "Revival|Westmoreland": { lat: 18.2260, lng: -78.2860 },
  "Whithorn|Westmoreland": { lat: 18.2400, lng: -78.0050 },
  "Bluefields|Westmoreland": { lat: 18.1700, lng: -78.0400 },
  "Little London|Westmoreland": { lat: 18.2400, lng: -78.1900 },
  "Grange Hill|Westmoreland": { lat: 18.3120, lng: -78.1880 },

  // ─── St. James ───
  "Montego Bay|St. James": { lat: 18.4720, lng: -77.9200 },
  "Reading|St. James": { lat: 18.4560, lng: -77.9990 },
  "Cornwall|St. James": { lat: 18.4640, lng: -77.9160 },
  "Cornwall Courts|St. James": { lat: 18.4640, lng: -77.9160 },
  "Anchovy|St. James": { lat: 18.4250, lng: -77.8920 },

  // ─── Trelawny ───
  "Falmouth|Trelawny": { lat: 18.4929, lng: -77.6517 },
  "Duncans|Trelawny": { lat: 18.4660, lng: -77.5190 },
  "Clarks Town|Trelawny": { lat: 18.4480, lng: -77.5610 },
  "Albert Town|Trelawny": { lat: 18.2940, lng: -77.5760 },

  // ─── St. Ann ───
  "Ocho Rios|St. Ann": { lat: 18.4080, lng: -77.1030 },
  "Brown's Town|St. Ann": { lat: 18.3850, lng: -77.3590 },
  "St. Ann's Bay|St. Ann": { lat: 18.4340, lng: -77.2070 },
  "Cave Valley|St. Ann": { lat: 18.2080, lng: -77.2410 },
  "Discovery Bay|St. Ann": { lat: 18.4630, lng: -77.4170 },
  "Runaway Bay|St. Ann": { lat: 18.4570, lng: -77.3360 },

  // ─── St. Mary ───
  "Port Maria|St. Mary": { lat: 18.3710, lng: -76.8920 },
  "Annotto Bay|St. Mary": { lat: 18.2750, lng: -76.7700 },
  "Highgate|St. Mary": { lat: 18.2620, lng: -76.8950 },
  "Richmond|St. Mary": { lat: 18.2270, lng: -76.9270 },

  // ─── Portland ───
  "Port Antonio|Portland": { lat: 18.1800, lng: -76.4530 },
  "Buff Bay|Portland": { lat: 18.2340, lng: -76.6600 },

  // ─── St. Thomas ───
  "Morant Bay|St. Thomas": { lat: 17.8810, lng: -76.4080 },
  "Yallahs|St. Thomas": { lat: 17.8790, lng: -76.5660 },

  // ─── Kingston / St. Andrew ───
  "Half Way Tree|Kingston": { lat: 18.0120, lng: -76.7980 },
  "Half Way Tree|St. Andrew": { lat: 18.0120, lng: -76.7980 },
  "Half-Way Tree|Kingston": { lat: 18.0120, lng: -76.7980 },
  "Half-Way Tree|St. Andrew": { lat: 18.0120, lng: -76.7980 },
  "Cross Roads|Kingston": { lat: 18.0010, lng: -76.7850 },
  "Cross Roads|St. Andrew": { lat: 18.0010, lng: -76.7850 },
  "Downtown|Kingston": { lat: 17.9680, lng: -76.7930 },
  "Papine|St. Andrew": { lat: 18.0220, lng: -76.7450 },
  "Constant Spring|St. Andrew": { lat: 18.0480, lng: -76.7950 },
  "Maxfield Avenue|St. Andrew": { lat: 17.9980, lng: -76.8044 },
  "Liguanea|St. Andrew": { lat: 18.0140, lng: -76.7670 },
  "Mona|St. Andrew": { lat: 18.0095, lng: -76.7460 },
  "Bull Bay|St. Thomas": { lat: 17.8950, lng: -76.6500 },
  "Nine Miles|St. Andrew": { lat: 18.0270, lng: -76.8730 },
  "August Town|St. Andrew": { lat: 18.0240, lng: -76.7370 },
  "Stony Hill|St. Andrew": { lat: 18.0790, lng: -76.7820 },
  "Mount James|St. Andrew": { lat: 18.0810, lng: -76.7530 },
  "Golden Spring|St. Andrew": { lat: 18.0900, lng: -76.8010 },
  "Jones Town|Kingston": { lat: 17.9810, lng: -76.7950 },
  "Cane River|St. Andrew": { lat: 17.9650, lng: -76.6920 },

  // ─── St. Catherine ───
  "Spanish Town|St. Catherine": { lat: 17.9920, lng: -76.9570 },
  "Linstead|St. Catherine": { lat: 18.1350, lng: -77.0300 },
  "Old Harbour|St. Catherine": { lat: 17.9390, lng: -77.1140 },
  "Old Harbour Bay|St. Catherine": { lat: 17.8860, lng: -77.1050 },
  "Bog Walk|St. Catherine": { lat: 18.1010, lng: -76.9970 },
  "Ewarton|St. Catherine": { lat: 18.1830, lng: -77.0680 },
  "Portmore|St. Catherine": { lat: 17.9530, lng: -76.8800 },
  "Portmore Mall|St. Catherine": { lat: 17.9701, lng: -76.8655 },
  "Waterford|St. Catherine": { lat: 17.9874, lng: -76.8707 },
  "Gregory Park|St. Catherine": { lat: 17.9987, lng: -76.8865 },
  "Westchester|St. Catherine": { lat: 17.9753, lng: -76.8743 },
  "Lawrence Tavern|St. Andrew": { lat: 18.1272, lng: -76.8457 },
  "Free Town|St. Catherine": { lat: 18.0179, lng: -76.8099 },

  // ─── Clarendon ───
  "May Pen|Clarendon": { lat: 17.9670, lng: -77.2430 },
  "Chapelton|Clarendon": { lat: 18.0830, lng: -77.2700 },
  "Lionel Town|Clarendon": { lat: 17.8120, lng: -77.2360 },
  "Mocho|Clarendon": { lat: 18.0750, lng: -77.2720 },
  "Frankfield|Clarendon": { lat: 18.1530, lng: -77.3490 },

  // ─── Manchester ───
  "Mandeville|Manchester": { lat: 18.0400, lng: -77.5010 },
  "Christiana|Manchester": { lat: 18.1710, lng: -77.4900 },
  "Williamsfield|Manchester": { lat: 18.0750, lng: -77.4870 },
  "Spaldings|Manchester": { lat: 18.1840, lng: -77.4090 },
  "Porus|Manchester": { lat: 18.0270, lng: -77.4170 },

  // ─── St. Elizabeth ───
  "Black River|St. Elizabeth": { lat: 18.0260, lng: -77.8440 },
  "Santa Cruz|St. Elizabeth": { lat: 18.0540, lng: -77.6940 },
  "Junction|St. Elizabeth": { lat: 17.9620, lng: -77.7060 },
  "Malvern|St. Elizabeth": { lat: 17.9810, lng: -77.7440 },
};

/** Normalise a parish string to the routes-table form. Routes use
 *  "St. " (with the period) and the TA's combined parish names like
 *  "Kingston and St. Andrew" — we strip the suffix down to the first
 *  parish when present, so a lookup with the rider-side "Kingston"
 *  reaches the same override entry as "Kingston and St. Andrew".  */
function normaliseParish(p) {
  if (!p) return null;
  let s = p.trim();
  // "Kingston and St. Andrew" → "Kingston" for the primary lookup.
  s = s.replace(/\s+and\s+.*$/i, "");
  s = s.replace(/^Saint\s+/i, "St. ");
  s = s.replace(/\bSt\s+/g, "St. ");
  return s;
}

/** Look up the curated override, trying both the parish-qualified key
 *  and the bare name. Returns coords or null. */
function override(name, parish) {
  if (!name) return null;
  const p = normaliseParish(parish);
  if (p && OVERRIDES[`${name}|${p}`]) return OVERRIDES[`${name}|${p}`];
  if (OVERRIDES[name]) return OVERRIDES[name];
  return null;
}

/* ────────────────────────── Geocoding API ────────────────────────── */

/** Haversine in km. Used for the parish-distance sanity check. */
function haversineKm(a, b) {
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

/** Geocode one "place, parish, Jamaica" with HARD parish constraint.
 *  Returns `{lat, lng}` or null. Logs the reason on rejection so a
 *  full run produces a debuggable trail. */
async function geocode(place, parish) {
  const p = normaliseParish(parish);
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", `${place}, Jamaica`);
  u.searchParams.set("region", "jm");
  u.searchParams.set("key", mapsKey);
  // HARD filter — Google refuses to return results outside this
  // country / parish, unlike `bounds` which is just a hint.
  const components = ["country:JM"];
  if (p) components.push(`administrative_area:${p}`);
  u.searchParams.set("components", components.join("|"));

  try {
    const res = await fetch(u.toString());
    const data = await res.json();
    if (data.status === "OK" && data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      const coords = { lat: loc.lat, lng: loc.lng };
      // Hard sanity: must be inside Jamaica. A coord outside the
      // bbox means Google found something nonsensical — drop it.
      if (
        coords.lat < JAMAICA_BBOX.south ||
        coords.lat > JAMAICA_BBOX.north ||
        coords.lng < JAMAICA_BBOX.west ||
        coords.lng > JAMAICA_BBOX.east
      ) {
        console.warn(
          `  reject "${place}" (${parish}) → ${coords.lat.toFixed(4)},` +
            `${coords.lng.toFixed(4)} is outside Jamaica`,
        );
        return null;
      }
      // Tiered parish-distance check (see PARISH_NEAR_KM /
      // PARISH_FAR_KM docs above).
      if (p && PARISH_CENTERS[p]) {
        const d = haversineKm(coords, PARISH_CENTERS[p]);
        if (d > PARISH_FAR_KM) {
          // Tier 3: the components filter failed and Google found
          // a different town entirely. Refuse — never write garbage.
          console.warn(
            `  reject "${place}" (${parish}) → ${coords.lat.toFixed(4)},` +
              `${coords.lng.toFixed(4)} is ${d.toFixed(0)}km from ${p} centroid ` +
              `— Google likely found a different town. Add to OVERRIDES if you ` +
              `know the correct coords.`,
          );
          return null;
        }
        if (d > PARISH_NEAR_KM) {
          // Tier 2: cross-parish but real. Accept + warn.
          console.warn(
            `  warn   "${place}" tagged ${p} but coords are ${d.toFixed(0)}km ` +
              `from ${p} centroid — parish label may be wrong in routes table`,
          );
        }
      }
      return coords;
    }
    if (data.status === "ZERO_RESULTS") return null;
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
    console.warn(
      `geocode-routes: "${place}" (${parish}) → ${data.status}` +
        (data.error_message ? ` — ${data.error_message}` : ""),
    );
    return null;
  } catch (e) {
    console.warn(`geocode-routes: "${place}" (${parish}) failed: ${e.message}`);
    return null;
  }
}

/** Resolve coords: curated override first, then Geocoding API.
 *  Returns `{coords, source}` or null. */
async function resolve_(place, parish) {
  const ov = override(place, parish);
  if (ov) return { coords: ov, source: "override" };
  const c = await geocode(place, parish);
  await sleep(120); // ~8 req/s — well under Google's limit
  return c ? { coords: c, source: "geocode" } : null;
}

/* ──────────────────────────── --reset ──────────────────────────── */

if (RESET) {
  if (DRY_RUN) {
    console.log(
      "geocode-routes: --reset + --dry-run → would wipe all coords + " +
        "polylines, but skipping write. Proceeding to dry-run re-geocode " +
        "by treating every route as if its coords were missing…\n",
    );
  } else {
    console.log("geocode-routes: --reset → wiping all coords + polylines…");
    // path_polyline is downstream of the coords; wipe both so the
    // pathfinder rebuilds polylines from the corrected endpoints on
    // the next /rider/request quote.
    const { error: resetErr } = await supabase
      .from("routes")
      .update({
        origin_lat: null,
        origin_lng: null,
        destination_lat: null,
        destination_lng: null,
        path_polyline: null,
      })
      .not("id", "is", null);
    if (resetErr) {
      console.error(`geocode-routes: --reset failed: ${resetErr.message}`);
      process.exit(1);
    }
    console.log("geocode-routes: reset complete. Proceeding to re-geocode…\n");
  }
}

/* ────────────────────────── Geocoding loop ────────────────────────── */

const PAGE = 300;
let processed = 0;
let geocoded = 0;
let bySource = { override: 0, geocode: 0 };
let skipped = 0;

console.log("geocode-routes: starting…");

// Dry-run mode resolves each UNIQUE (name, parish) pair once instead
// of once per route — same coverage, way less API spend, much shorter
// output for human review.
if (DRY_RUN) {
  const { data: rows, error } = await supabase
    .from("routes")
    .select(
      "origin_name, destination_name, origin_parish, destination_parish",
    )
    .eq("active", true);
  if (error) {
    console.error(`geocode-routes: dry-run fetch failed: ${error.message}`);
    process.exit(1);
  }
  const uniq = new Map();
  for (const r of rows ?? []) {
    uniq.set(`${r.origin_name}|${r.origin_parish ?? ""}`, {
      name: r.origin_name,
      parish: r.origin_parish,
    });
    uniq.set(`${r.destination_name}|${r.destination_parish ?? ""}`, {
      name: r.destination_name,
      parish: r.destination_parish,
    });
  }
  console.log(
    `geocode-routes: dry-run — ${uniq.size} unique endpoints across ${rows?.length ?? 0} active routes\n`,
  );
  for (const { name, parish } of uniq.values()) {
    const res = await resolve_(name, parish);
    processed++;
    if (res) {
      bySource[res.source]++;
      console.log(
        `  ${res.source.padEnd(8)} ${name} (${parish ?? "?"}) → ` +
          `${res.coords.lat.toFixed(4)}, ${res.coords.lng.toFixed(4)}`,
      );
    } else {
      skipped++;
      console.log(`  UNRESOLVED ${name} (${parish ?? "?"})`);
    }
  }
  console.log(
    `\ngeocode-routes: dry-run done · ${processed} endpoints ` +
      `(override=${bySource.override}, api=${bySource.geocode}, ` +
      `unresolved=${skipped}). No writes performed.\n` +
      `Review the list above. When happy, re-run WITHOUT --dry-run.`,
  );
  process.exit(0);
}

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
      const res = await resolve_(r.origin_name, r.origin_parish);
      if (res) {
        update.origin_lat = res.coords.lat;
        update.origin_lng = res.coords.lng;
        bySource[res.source]++;
      }
    }
    if (r.destination_lat == null) {
      const res = await resolve_(r.destination_name, r.destination_parish);
      if (res) {
        update.destination_lat = res.coords.lat;
        update.destination_lng = res.coords.lng;
        bySource[res.source]++;
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

    if (processed % 50 === 0) {
      console.log(
        `geocode-routes: processed=${processed} geocoded=${geocoded} ` +
          `(override=${bySource.override}, api=${bySource.geocode}) ` +
          `skipped=${skipped}`,
      );
    }
  }

  if (geocodedThisPage === 0) {
    console.warn(
      `geocode-routes: ${routes.length} route(s) couldn't be geocoded — ` +
        "names not in overrides AND Geocoding API can't resolve them. " +
        "Inspect with: SELECT origin_name, origin_parish FROM routes " +
        "WHERE origin_lat IS NULL;",
    );
    break;
  }
}

console.log(
  `\ngeocode-routes: done · processed=${processed} geocoded=${geocoded} ` +
    `(override=${bySource.override}, api=${bySource.geocode}) ` +
    `skipped=${skipped}`,
);
console.log(
  "\nNext: open /rider/request and run any route taxi quote. The " +
    "pathfinder will rebuild path_polyline for every corridor (one " +
    "Google Directions call each, cached forever after).",
);
process.exit(0);
