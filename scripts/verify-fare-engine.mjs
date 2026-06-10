#!/usr/bin/env node
/**
 * Verify the fare engine against every TA worked example we've ever
 * supported AND audit the parsed route seed for parser misalignment
 * (the PDF's multi-column layout occasionally pairs an origin with
 * the wrong row's distance).
 *
 * Usage:
 *   node scripts/verify-fare-engine.mjs
 *
 * Exits non-zero if:
 *   - any tariff's worked example diverges
 *   - more than 5% of seeded 2023 routes diverge from the 2023 formula
 *     by more than $20 (parser likely shifted columns)
 */

import { TA_ROUTES_2023_SEED } from "../src/lib/route-seed.ts";
import {
  ROUTE_TAXI_TARIFFS,
  calculateRouteFare,
} from "../src/lib/fare-engine.ts";

let failed = 0;
const note = (...a) => console.log(...a);

/* ──────── 1. Worked examples per tariff phase ────────
 * From the TA notices. Every one of these MUST hold true or we're
 * mis-quoting fares in production. Picks a date one day after the
 * tariff's `effectiveFrom` so we know the engine routes the call to
 * the right phase.
 */
const WORKED_EXAMPLES = [
  {
    label: "TA 2023",
    asOf: "2024-01-15",
    distanceKm: 15,
    expectedJmd: 220, // 113 + 105 = 218 → $220 to the nearest $10
  },
  {
    label: "TA 2026 · Phase 1 (June 2026)",
    asOf: "2026-06-15",
    distanceKm: 15,
    expectedJmd: 240, // 122 + 113.40 = 235.40 → $240
  },
  {
    label: "TA 2026 · Phase 2 (July 2026)",
    asOf: "2026-07-15",
    distanceKm: 15,
    expectedJmd: 260, // 132 + 129.60 = 261.60 → $260
  },
];

for (const wx of WORKED_EXAMPLES) {
  const got = calculateRouteFare(wx.distanceKm, new Date(wx.asOf));
  if (got !== wx.expectedJmd) {
    console.error(
      `FAIL · ${wx.label} worked example: ${wx.distanceKm}km should yield $${wx.expectedJmd}, got $${got}`,
    );
    failed++;
  } else {
    note(`OK   · ${wx.label}: ${wx.distanceKm}km → $${got}`);
  }
}

/* ──────── 2. Tariff list ────────
 * Snapshot what's defined in the engine so a `git diff` of this
 * script's stdout makes any silent change obvious.
 */
note("INFO · Tariffs registered:");
for (const t of ROUTE_TAXI_TARIFFS) {
  note(
    `       · ${t.effectiveFrom}  base=$${t.baseRateJmd}  per-km=$${t.perKmRateJmd}  (${t.label})`,
  );
}

/* ──────── 3. Seed audit ────────
 * The seeded routes carry the 2023 TA fare. Compute calculateRouteFare
 * for that same date and compare. The published table was rounded by
 * humans so a $10 drift is normal; a $20+ drift on more than ~5% of
 * rows means the parser is grabbing wrong numbers.
 *
 * NOTE: only the 2023 tariff is audited here — the 2026 fare schedule
 * was published BUT the per-route table in our DB still carries the
 * 2023 number for legacy reasons. Re-seeding the table to 2026 fares
 * would invalidate the audit. The runtime engine bypasses the table
 * for post-2026-06-02 trips (see `quote/route.ts`).
 */
const AS_OF_2023 = new Date("2024-01-15");
let audited = 0;
let divergent = 0;
const examples = [];
for (const row of TA_ROUTES_2023_SEED) {
  const formulaFare = calculateRouteFare(row.distanceKm, AS_OF_2023);
  const drift = Math.abs(formulaFare - row.taFareJmd);
  audited++;
  if (drift > 20) {
    divergent++;
    if (examples.length < 12) {
      examples.push(
        `   · ${row.origin} → ${row.destination}: distance=${row.distanceKm}km, formula=$${formulaFare}, TA=$${row.taFareJmd}, drift=$${drift}`,
      );
    }
  }
}

const driftPct = (divergent / audited) * 100;
note(
  `INFO · Seed audit (2023 tariff): ${divergent}/${audited} rows drift > $20 from formula (${driftPct.toFixed(1)}%)`,
);
if (examples.length > 0) {
  note("   Sample drifts (first 12):");
  for (const e of examples) note(e);
}
if (driftPct > 5) {
  console.error(
    `FAIL · Drift rate ${driftPct.toFixed(1)}% > 5% — parser is grabbing misaligned columns`,
  );
  failed++;
} else {
  note(`OK   · Drift rate ${driftPct.toFixed(1)}% within tolerance`);
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
