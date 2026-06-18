#!/usr/bin/env node
/**
 * Quick one-shot: print the DB row for a single route by slug. Used
 * to debug "why is corridor X not surfacing for trip Y" — confirms
 * the row exists, is active, and has geocoded coords.
 *
 * Usage: node scripts/check-route.mjs <slug>
 * Example: node scripts/check-route.mjs half-way-tree-to-maxfield-avenue
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing env"); process.exit(1); }

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const slug = process.argv[2];
if (!slug) {
  console.error("usage: node scripts/check-route.mjs <slug>");
  process.exit(1);
}

const { data, error } = await supabase
  .from("routes")
  .select("*")
  .eq("slug", slug)
  .maybeSingle();

if (error) { console.error(error.message); process.exit(1); }
if (!data) { console.log(`no route with slug "${slug}"`); process.exit(0); }
console.log(JSON.stringify(data, null, 2));
