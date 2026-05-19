/**
 * Rewrites a Google Play "Data safety" CSV export into a corrected,
 * import-ready file for the Rajlo Driver app.
 *
 * Why this exists: the previous declaration was inaccurate — it
 * over-claimed data types the app never touches (Emails, SMS, the
 * device Contacts list) and left the usage detail blank for types
 * the app genuinely collects. This script clears the false ones and
 * fills the real ones, keyed strictly on the machine-readable
 * Question ID / Response ID columns so labels are never transcribed.
 *
 * Usage:
 *   node scripts/fix-data-safety-csv.mjs "C:\\path\\to\\data_safety_export.csv"
 *
 * Output: a sibling file with "_FIXED" appended to the name. Import
 * that one in Play Console -> App content -> Data safety -> Import.
 */

import { readFileSync, writeFileSync } from "node:fs";

const inputPath =
  process.argv[2] || "C:\\Users\\HP\\Downloads\\data_safety_export.csv";

// Data types Rajlo Driver genuinely collects, with their usage answers.
//   required: true  -> "Data collection is required"
//   required: false -> "Users can choose whether this data is collected"
const COLLECTED = {
  PSL_APPROX_LOCATION: { required: true, purposes: ["PSL_APP_FUNCTIONALITY"] },
  PSL_PRECISE_LOCATION: { required: true, purposes: ["PSL_APP_FUNCTIONALITY"] },
  PSL_OTHER_MESSAGES: { required: true, purposes: ["PSL_APP_FUNCTIONALITY"] },
  PSL_PHOTOS: { required: false, purposes: ["PSL_APP_FUNCTIONALITY"] },
  PSL_AUDIO: { required: false, purposes: ["PSL_APP_FUNCTIONALITY"] },
  PSL_CRASH_LOGS: { required: true, purposes: ["PSL_ANALYTICS"] },
  PSL_PERFORMANCE_DIAGNOSTICS: { required: true, purposes: ["PSL_ANALYTICS"] },
  PSL_FILES_AND_DOCS: {
    required: true,
    purposes: ["PSL_APP_FUNCTIONALITY", "PSL_ACCOUNT_MANAGEMENT"],
  },
  PSL_DEVICE_ID: { required: true, purposes: ["PSL_APP_FUNCTIONALITY"] },
};

// key = "QuestionID|ResponseID" -> new value for the "Response value" column.
const overrides = new Map();
const set = (q, r, v) => overrides.set(`${q}|${r}`, v);

// 1. Clear data types the app does NOT collect.
set("PSL_DATA_TYPES_EMAIL_AND_TEXT", "PSL_EMAILS", "");
set("PSL_DATA_TYPES_EMAIL_AND_TEXT", "PSL_SMS_CALL_LOG", "");
set("PSL_DATA_TYPES_CONTACTS", "PSL_CONTACTS", "");

// 2. ID / licence documents are also used for fraud prevention &
//    regulatory compliance, not only app functionality.
set(
  "PSL_DATA_USAGE_RESPONSES:PSL_OTHER_PERSONAL:DATA_USAGE_COLLECTION_PURPOSE",
  "PSL_FRAUD_PREVENTION_SECURITY",
  "true",
);

// 3. Fill the usage detail for every collected type left blank.
for (const [type, cfg] of Object.entries(COLLECTED)) {
  const base = `PSL_DATA_USAGE_RESPONSES:${type}:`;
  set(`${base}PSL_DATA_USAGE_COLLECTION_AND_SHARING`, "PSL_DATA_USAGE_ONLY_COLLECTED", "true");
  set(`${base}PSL_DATA_USAGE_EPHEMERAL`, "", "false");
  set(
    `${base}DATA_USAGE_USER_CONTROL`,
    cfg.required
      ? "PSL_DATA_USAGE_USER_CONTROL_REQUIRED"
      : "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL",
    "true",
  );
  for (const p of cfg.purposes) {
    set(`${base}DATA_USAGE_COLLECTION_PURPOSE`, p, "true");
  }
}

const lines = readFileSync(inputPath, "utf8").split(/\r?\n/);
let changed = 0;

const out = lines.map((line, i) => {
  if (i === 0 || line.trim() === "") return line;
  // Columns 1-4 never contain commas; only the label (col 5+) might.
  // split/join on "," is lossless because we only touch column 3.
  const parts = line.split(",");
  if (parts.length < 4) return line;
  const key = `${parts[0]}|${parts[1]}`;
  if (overrides.has(key)) {
    const next = overrides.get(key);
    if (parts[2] !== next) changed++;
    parts[2] = next;
    return parts.join(",");
  }
  return line;
});

const outPath = inputPath.replace(/\.csv$/i, "") + "_FIXED.csv";
writeFileSync(outPath, out.join("\n"), "utf8");
console.log(`Applied ${changed} value changes.`);
console.log(`Wrote: ${outPath}`);
