#!/usr/bin/env node
/**
 * Parse the TA 2023 Route Taxi fare table PDF (`pdftotext -layout`
 * output) into a structured seed list for the `routes` table.
 *
 * Usage:
 *   pdftotext -table "public/ROUTE TAXI FARE INCREASE 2023_updated.pdf" /tmp/fares_2023.txt
 *   node scripts/parse-ta-routes.mjs /tmp/fares_2023.txt > src/lib/route-seed.ts
 *
 * IMPORTANT: use `-table` mode, NOT `-layout`. `-layout` mis-aligns the
 * PDF's column boundaries for any row with a wrapped origin name —
 * Negril → Sav-la-Mar got distance "10" with -layout (should be 28),
 * and the drift check then rejected the row as anomalous. With -table
 * the same row parses correctly as 28 km / $310. Net effect: -table
 * extracts roughly 2× as many rows as -layout, and they're correct.
 *
 * Strategy:
 *   - Walk the file line-by-line.
 *   - Track current parish from the section headers ("Kingston and St.
 *     Andrew", "St. Catherine", etc.).
 *   - Emit a row only when origin, destination, distance, AND new fare
 *     all appear together on a single line. Multi-line rows are skipped
 *     by design — the admin "Add route" form covers the long tail.
 *
 * The output intentionally contains JSDoc + types so it's drop-in for
 * `src/lib/route-seed.ts`.
 */

import { readFileSync } from "node:fs";

/**
 * Quality gate: any parsed row whose TA-published fare drifts more
 * than this many JMD from `formula(distance)` is treated as a column-
 * misalignment artefact and dropped. The TA table itself was rounded
 * by humans so a $10–20 spread from the formula is normal; anything
 * bigger means we paired an origin with the wrong row's distance.
 */
const MAX_FORMULA_DRIFT_JMD = 20;
const BASE = 113;
const PER_KM = 7;
const ROUND = 10;
const formulaFare = (km) => Math.floor((BASE + km * PER_KM) / ROUND + 0.5) * ROUND;

const PARISHES = [
  "Kingston and St. Andrew",
  "St. Catherine",
  "Clarendon",
  "Manchester",
  "St. Elizabeth",
  "Westmoreland",
  "Hanover",
  "St. James",
  "Trelawny",
  "St. Ann",
  "St. Mary",
  "Portland",
  "St. Thomas",
];

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: node scripts/parse-ta-routes.mjs <fares.txt>");
  process.exit(1);
}

const text = readFileSync(inputPath, "utf8");
const lines = text.split(/\r?\n/);

// Match e.g.:
//   "CHISHOLM AVENUE   DOWNTOWN            6.4    $ 130.00 $ 160.00"
//   "MOUNT INDUSTRY    LAWRENCE TAVERN     14     $ 170.00 $ 210.00"
//   "GRAVEL HILL via York Town  MAY PEN    16.9   $ 190.00 $ 230.00"
//
// Origin and destination are alphanumeric tokens (uppercase + optional
// lowercase for "via X" qualifiers, dots, slashes, apostrophes, dashes,
// parens, ampersands) separated from each other and from the numeric
// block by 2+ spaces. Distance is integer or one-decimal. Two dollar
// amounts follow (current + new) — the second one may have variable
// whitespace inside ("$ 180.00" or "$               180.00"), absorbed
// by \s* before the digit run.
const ROW_RE =
  /^([A-Z0-9][A-Za-z0-9 .'\-/&()]+?)\s{2,}([A-Z0-9][A-Za-z0-9 .'\-/&()]+?)\s{2,}(\d+(?:\.\d+)?)\s+\$\s*([\d,]+\.\d{2})\s+\$\s*([\d,]+\.\d{2})\s*$/;

let currentParish = null;
const seen = new Set();
const rows = [];

for (let raw of lines) {
  const line = raw.replace(/\s+$/, "");

  // Detect parish header. The PDF puts these on their own line — we
  // accept any line that exactly matches one of the parish names.
  for (const p of PARISHES) {
    if (line.trim() === p) {
      currentParish = p;
      break;
    }
  }

  const m = line.match(ROW_RE);
  if (!m) continue;
  const [, origin, destination, dist, , newFare] = m;

  const cleanOrigin = normaliseName(origin);
  const cleanDest = normaliseName(destination);
  if (!cleanOrigin || !cleanDest) continue;
  if (cleanOrigin === cleanDest) continue;

  // Skip table-header noise that happens to fit the row regex.
  if (/^DISTANCE/i.test(cleanOrigin) || /^ORIGIN/i.test(cleanOrigin)) continue;
  if (/^FARE/i.test(cleanDest) || /^DESTINATION/i.test(cleanDest)) continue;

  const distanceKm = Number(dist);
  const taFareJmd = Number(newFare.replace(/,/g, ""));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) continue;
  if (!Number.isFinite(taFareJmd) || taFareJmd <= 0) continue;
  // Sanity floor: anything below the base rate is a parsing error.
  if (taFareJmd < 110) continue;

  // Drop rows where the TA fare contradicts the formula by more
  // than $20 — the PDF's column layout shifts numerics across rows
  // for long-name origins, and we can't trust either field on those
  // rows. Better to ship a smaller, high-confidence seed.
  const drift = Math.abs(formulaFare(distanceKm) - taFareJmd);
  if (drift > MAX_FORMULA_DRIFT_JMD) continue;

  // De-dup by (origin, destination). When the same (origin, dest)
  // pair appears with different distances — which happens when the
  // TA lists two physically-distinct places that share a simplified
  // name (e.g. "Shrewsbury" the village and "Shrewsbury via Logwood"
  // a different settlement) — disambiguate by suffixing distance to
  // the slug so both rows survive. The first occurrence keeps the
  // canonical slug; subsequent ones get `-{km}km` appended.
  const key = `${cleanOrigin.toLowerCase()} → ${cleanDest.toLowerCase()}`;
  let baseSlug = slugify(`${cleanOrigin}-to-${cleanDest}`);
  let slug = baseSlug;
  if (seen.has(key)) {
    slug = slugify(`${cleanOrigin}-to-${cleanDest}-${distanceKm}km`);
    // If even the distance-suffixed slug collides (extreme edge
    // case — same origin/dest/distance twice in the PDF), skip.
    if (seen.has(slug)) continue;
  }
  seen.add(key);
  seen.add(slug);

  rows.push({
    origin: cleanOrigin,
    destination: cleanDest,
    parish: currentParish ?? null,
    distanceKm,
    taFareJmd,
    slug,
  });
}

console.error(
  `parse-ta-routes: kept ${rows.length} high-confidence routes (dropped column-shifted rows)`,
);

// Emit a TypeScript module.
const out = [
  "/**",
  " * Auto-generated from the TA 2023 Route Taxi fare table PDF.",
  " *",
  " * Source: public/ROUTE TAXI FARE INCREASE 2023_updated.pdf",
  " * Generator: scripts/parse-ta-routes.mjs",
  " *",
  " * Do NOT hand-edit. Re-run the parser when TA publishes a new schedule.",
  " * Routes the parser couldn't extract cleanly (multi-line PDF rows) are",
  " * intentionally omitted — admin operators add those via the UI.",
  " */",
  "",
  "export type SeedRoute = {",
  "  origin: string;",
  "  destination: string;",
  "  parish: string | null;",
  "  distanceKm: number;",
  "  taFareJmd: number;",
  "  slug: string;",
  "};",
  "",
  `export const TA_ROUTES_2023_SEED: SeedRoute[] = ${JSON.stringify(rows, null, 2)};`,
  "",
].join("\n");

process.stdout.write(out);

// ─────────────── helpers ───────────────

function normaliseName(raw) {
  // Convert "MOUNT INDUSTRY" → "Mount Industry"; preserve embedded
  // dots, slashes, ampersands, and the few "via X" qualifiers.
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s|\/|\(|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/\bSt\.?\b/gi, "St.")
    .replace(/\bMt\.?\b/gi, "Mt.")
    .replace(/\bVia\b/g, "via");
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
