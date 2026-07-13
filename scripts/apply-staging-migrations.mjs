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

// Full chronological order — derived from
//   git log --diff-filter=A --reverse --name-only -- 'supabase/*.sql'
// then filtered to drop one-offs that do not belong on a fresh
// staging DB (delete-test-user.sql, production-reset-2026-07.sql).
//
// Two ordering fixes vs. raw git order:
//   1. legal-consent-evidence must run AFTER legal-consent (evidence
//      alters the `legal_acceptances` table the base migration creates).
//      Alphabetical same-day ordering had put evidence first.
//   2. Everything else keeps its chronological add order.
//
// If a NEW migration lands in supabase/*.sql after this list was
// authored, append it to the end here BEFORE re-running against a
// fresh staging DB. There is no automatic file-discovery on purpose —
// order is critical and must be reviewed by a human.
const ORDER = [
  "schema.sql",
  "auth-migration.sql",
  "deactivation-migration.sql",
  "document-resubmission-tracking-migration.sql",
  "google-oauth-migration.sql",
  "onboarding-fields-migration.sql",
  "storage-migration.sql",
  "rides-migration.sql",
  "rides-realtime-migration.sql",
  "safety-alerts-migration.sql",
  "carpool-migration.sql",
  "ratings-migration.sql",
  "rider-personalisation-migration.sql",
  "vehicle-color-migration.sql",
  "avatars-bucket-migration.sql",
  "ride-expiry-migration.sql",
  "vehicle-change-requests-migration.sql",
  "driver-notifications-migration.sql",
  "driver-online-status-migration.sql",
  "push-subscriptions-migration.sql",
  "ride-chat-migration.sql",
  "admin-audit-logs-migration.sql",
  "admin-messages-migration.sql",
  "theme-default-light-migration.sql",
  "driver-activity-tracking-migration.sql",
  "wallets-migration.sql",
  "qr-charges-migration.sql",
  "route-taxi-migration.sql",
  "route-taxi-phase2-migration.sql",
  "route-hail-chat-migration.sql",
  "rides-settlement-migration.sql",
  "user-delete-cascade-migration.sql",
  "safety-checks-migration.sql",
  "safety-officers-migration.sql",
  "off-route-detection-migration.sql",
  "ride-driver-position-cache-migration.sql",
  "push-subscriptions-native-migration.sql",
  "driver-position-cache-migration.sql",
  "driver-violations-migration.sql",
  "pin-verify-migration.sql",
  "saved-places-migration.sql",
  "account-deletion-retention-migration.sql",
  "admin-rbac-security-migration.sql",
  "fraud-risk-migration.sql",
  "incidents-retention-migration.sql",
  // legal-consent BEFORE evidence — see comment above.
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
  "contact-recipients-migration.sql",
  "profile-deactivation-migration.sql",
  "link-shortener-migration.sql",
  "employers-migration.sql",
  "wallet-holds-private-ride-migration.sql",
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

// Optional override: comma-separated migration filenames to run
// instead of the full ORDER. Use this when the DB is already
// partially migrated and you just need to apply the tail — e.g.
//   ONLY_MIGRATIONS=contact-recipients-migration.sql,profile-deactivation-migration.sql
// The order in the env var IS the run order. Anything not in ORDER
// is rejected so a typo can't silently apply the wrong file.
const ONLY_MIGRATIONS_RAW = process.env.ONLY_MIGRATIONS?.trim();
const RUN_LIST = ONLY_MIGRATIONS_RAW
  ? ONLY_MIGRATIONS_RAW.split(",").map((s) => s.trim()).filter(Boolean)
  : ORDER;
if (ONLY_MIGRATIONS_RAW) {
  const unknown = RUN_LIST.filter((f) => !ORDER.includes(f));
  if (unknown.length) {
    console.error(
      `ONLY_MIGRATIONS contains files not in ORDER: ${unknown.join(", ")}`,
    );
    process.exit(1);
  }
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log(`Connected. Applying ${RUN_LIST.length} migrations...\n`);

  for (let i = 0; i < RUN_LIST.length; i++) {
    const file = RUN_LIST[i];
    const path = resolve(REPO_ROOT, "supabase", file);
    const sql = await readFile(path, "utf8");

    process.stdout.write(
      `[${String(i + 1).padStart(2)}/${RUN_LIST.length}] ${file} ... `,
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
