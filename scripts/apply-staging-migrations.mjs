#!/usr/bin/env node
/**
 * Applies every supabase/*.sql migration in chronological order into
 * a fresh staging database.
 *
 * Order is the same order the files landed in git on the production
 * timeline (the order they were applied to prod) — derived from
 * `git log --diff-filter=A --reverse -- 'supabase/*.sql'`.
 *
 * Usage:
 *   1. Save your staging database connection string to .env.staging-migration:
 *        STAGING_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *   2. Install pg locally if you haven't already:
 *        npm install --no-save pg dotenv
 *   3. Run:
 *        node scripts/apply-staging-migrations.mjs
 *
 * Behavior:
 *   - Each file applies in its own transaction. If a file fails, the
 *     script halts immediately and prints the file name + error.
 *   - You can re-run after fixing the failure; everything before the
 *     failure is already committed, so don't re-apply those by hand —
 *     edit ORDER below to start from the failed file and re-run.
 *
 * NEVER point this at production. Hard-coded guard at startup compares
 * the host against the production project ref so a typo doesn't replay
 * 59 migrations onto a live database.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config as loadDotenv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Explicit path — the file isn't named `.env`, so the default
// `dotenv/config` autoload wouldn't pick it up.
loadDotenv({ path: resolve(REPO_ROOT, ".env.staging-migration") });

// Resume list — the first 45 migrations already committed cleanly
// on the previous run. `legal-consent-evidence-migration.sql` failed
// because alphabetical same-day ordering put it before
// `legal-consent-migration.sql` (the file that creates the
// `legal_acceptances` table the evidence migration alters). The two
// have been swapped below; the rest carry on in their original order.
const ORDER = [
  "legal-consent-migration.sql",
  "legal-consent-evidence-migration.sql",
  "legal-documents-table-migration.sql",
  "moderation-enforcement-migration.sql",
  "route-coordinates-migration.sql",
  "connection-violation-migration.sql",
  "route-hails-transfer-broadcast-migration.sql",
  "route-journeys-migration.sql",
  "route-taxi-pickup-code-migration.sql",
  "route-hails-boarding-coords-migration.sql",
  "route-corridor-polylines-migration.sql",
  "route-taxi-drop-od-unique-migration.sql",
  "calls-migration.sql",
  "payouts-migration.sql",
];

const connectionString = process.env.STAGING_DATABASE_URL;
if (!connectionString) {
  console.error(
    "Missing STAGING_DATABASE_URL — add it to .env.staging-migration first.",
  );
  process.exit(1);
}

// Guard: parse out the project ref from the connection string and
// refuse to run against the production project. Replace the value
// below with your real production project ref (the part after
// "postgres." in your prod connection string) before first run.
const PROD_REF_GUARD = process.env.PROD_PROJECT_REF;
if (PROD_REF_GUARD && connectionString.includes(`postgres.${PROD_REF_GUARD}`)) {
  console.error(
    `Refusing to run: connection string targets the production project ref "${PROD_REF_GUARD}".`,
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log(`Connected. Applying ${ORDER.length} migrations...\n`);

  for (let i = 0; i < ORDER.length; i++) {
    const file = ORDER[i];
    const path = resolve(REPO_ROOT, "supabase", file);
    const sql = await readFile(path, "utf8");

    process.stdout.write(
      `[${String(i + 1).padStart(2)}/${ORDER.length}] ${file} ... `,
    );
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("ok");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      console.error("\n---");
      console.error(`Migration failed: ${file}`);
      console.error(err.message);
      console.error("---");
      console.error(
        "To resume: edit ORDER in this script, remove every file BEFORE",
      );
      console.error(
        `"${file}" (those already committed), fix the issue if needed, and re-run.`,
      );
      process.exit(1);
    }
  }

  console.log("\nAll migrations applied cleanly.");
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end().catch(() => {});
  process.exit(1);
});
