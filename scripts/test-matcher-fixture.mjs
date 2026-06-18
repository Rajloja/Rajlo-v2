#!/usr/bin/env node
/**
 * Route-taxi matcher regression test.
 *
 * Runs every entry in scripts/_matcher-fixture.mjs through the
 * matcher gate logic against the LIVE routes table, and asserts:
 *
 *   - Every slug listed in `mustInclude` appears in the top-3
 *     matcher results for that trip.
 *   - Every slug listed in `mustExclude` does NOT appear.
 *   - When `expectNoMatches: true`, the top results are empty.
 *
 * Exits 0 when all entries pass, 1 when any fail. Intended to gate
 * deploys (CI step) and to be re-run after every matcher tweak, new
 * geocoded corridor, and new override coordinate.
 *
 * Why the lock matters — see feedback_route_taxi_matcher_trust.md.
 * False positives in this matcher permanently break rider trust in
 * a brand-new market. The fixture is the line we're holding.
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/test-matcher-fixture.mjs
 *   node scripts/test-matcher-fixture.mjs --verbose   # show diag per entry
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { FIXTURE } from "./_matcher-fixture.mjs";
import { runMatcher } from "./_matcher-gate-logic.mjs";

const VERBOSE = process.argv.includes("--verbose");

try {
  const t = readFileSync(resolve(".env.local"), "utf8");
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* env must be set externally */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "test-matcher-fixture: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(
  `test-matcher-fixture: ${FIXTURE.length} fixture entries; fetching routes…`,
);
const { data: routes, error } = await supabase
  .from("routes")
  .select(
    "id, slug, origin_name, destination_name, distance_km, " +
      "origin_lat, origin_lng, destination_lat, destination_lng, " +
      "path_polyline",
  )
  .eq("active", true)
  .not("origin_lat", "is", null)
  .not("destination_lat", "is", null)
  .limit(2000);

if (error) {
  console.error(`fetch failed: ${error.message}`);
  process.exit(1);
}

console.log(
  `test-matcher-fixture: ${routes.length} active geocoded routes loaded.\n`,
);

let passed = 0;
let failed = 0;
const failures = [];

for (const entry of FIXTURE) {
  const top = runMatcher(routes, entry.pickup, entry.dropoff, 3);
  const topSlugs = top.map((r) => r.route.slug);

  const errors = [];

  if (entry.expectNoMatches && top.length > 0) {
    errors.push(
      `expected no matches, got ${top.length}: [${topSlugs.join(", ")}]`,
    );
  }

  for (const required of entry.mustInclude ?? []) {
    if (!topSlugs.includes(required)) {
      errors.push(
        `missing required slug "${required}" — top results: [${topSlugs.join(", ") || "(empty)"}]`,
      );
    }
  }

  if (entry.mustBeTop) {
    if (topSlugs[0] !== entry.mustBeTop) {
      errors.push(
        `top slug must be "${entry.mustBeTop}" but was "${topSlugs[0] ?? "(empty)"}" — top results: [${topSlugs.join(", ") || "(empty)"}]`,
      );
    }
  }

  for (const forbidden of entry.mustExclude ?? []) {
    if (topSlugs.includes(forbidden)) {
      const offender = top.find((r) => r.route.slug === forbidden);
      errors.push(
        `forbidden slug "${forbidden}" appeared (score=${offender.score.toFixed(2)}, ` +
          `tP=${offender.diag.tP.toFixed(2)} tD=${offender.diag.tD.toFixed(2)} ` +
          `onCorr=${offender.diag.onCorridorKm.toFixed(2)} ` +
          `walk=${offender.diag.totalWalkKm.toFixed(2)} ` +
          `trip=${offender.diag.tripKm.toFixed(2)})`,
      );
    }
  }

  if (errors.length === 0) {
    passed++;
    if (VERBOSE) {
      console.log(
        `  PASS  ${entry.id}  → [${topSlugs.join(", ") || "(none)"}]`,
      );
    } else {
      process.stdout.write(".");
    }
  } else {
    failed++;
    failures.push({ entry, errors, topSlugs, top });
    if (!VERBOSE) process.stdout.write("F");
  }
}

if (!VERBOSE) process.stdout.write("\n\n");

if (failures.length > 0) {
  console.log(
    `\nFailures (${failures.length} of ${FIXTURE.length}):\n` + "─".repeat(70),
  );
  for (const f of failures) {
    console.log(`\n  ${f.entry.id}`);
    console.log(`    ${f.entry.description}`);
    console.log(
      `    pickup:  ${f.entry.pickup.name} (${f.entry.pickup.lat}, ${f.entry.pickup.lng})`,
    );
    console.log(
      `    dropoff: ${f.entry.dropoff.name} (${f.entry.dropoff.lat}, ${f.entry.dropoff.lng})`,
    );
    for (const err of f.errors) {
      console.log(`    ✗ ${err}`);
    }
  }
}

console.log(
  `\n${passed}/${FIXTURE.length} passed, ${failed} failed.\n`,
);

if (failed > 0) {
  console.error(
    "Matcher fixture FAILED. Do not deploy a matcher change until every " +
      "entry passes.\n\n" +
      "If a change is intentional (e.g. a corridor was deliberately removed " +
      "or added), update the fixture and the contract comment in " +
      "src/app/api/rider/route-taxi/match/route.ts at the same time.",
  );
  process.exit(1);
}

console.log(
  "Matcher fixture passed. Safe to ship the current matcher logic + " +
    "current routes table.",
);
process.exit(0);
