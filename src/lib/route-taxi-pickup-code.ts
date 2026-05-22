/**
 * Short driver-session pickup codes — the manual fallback for riders
 * whose camera can't scan the session QR. Format:
 *
 *   - 4 characters
 *   - Uppercase, alphanumeric
 *   - No lookalikes (I, L, O excluded from letters; 0, 1 excluded
 *     from digits) so a rider reading off a phone screen can't
 *     confuse `I` for `1` or `O` for `0`.
 *
 * Alphabet is 32 characters → 32^4 = 1,048,576 codes. Plenty for any
 * realistic count of concurrently-active driver sessions on the
 * platform, and the partial-unique index in
 * `route-taxi-pickup-code-migration.sql` enforces no two ACTIVE
 * sessions share a code at once. Ended sessions free their code for
 * reuse.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const PICKUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PICKUP_CODE_LENGTH = 4;

/**
 * Generate a random pickup code from the no-lookalike alphabet.
 * Pure function — caller is responsible for inserting and handling
 * the rare collision via `allocateUniquePickupCode` below.
 */
export function generatePickupCode(): string {
  let out = "";
  for (let i = 0; i < PICKUP_CODE_LENGTH; i++) {
    out += PICKUP_CODE_ALPHABET.charAt(
      Math.floor(Math.random() * PICKUP_CODE_ALPHABET.length),
    );
  }
  return out;
}

/**
 * Normalize an input the rider typed for the manual-entry fallback.
 * Strips whitespace, uppercases, and returns null if the result
 * doesn't look like a valid code. Keeps validation logic in one
 * place between the scan endpoint and any future admin tooling.
 */
export function normalizePickupCode(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length !== PICKUP_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!PICKUP_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/**
 * Look up the currently-active driver session matching a typed code.
 * Returns null when no live session carries that code — covers both
 * "no such code" and "session ended already" cases identically from
 * the rider's perspective.
 */
export async function findActiveSessionByPickupCode(
  supabase: SupabaseClient,
  code: string,
): Promise<{ id: string; driver_id: string; route_id: string } | null> {
  const normalized = normalizePickupCode(code);
  if (!normalized) return null;
  const { data } = await supabase
    .from("driver_sessions")
    .select("id, driver_id, route_id")
    .eq("pickup_code", normalized)
    .eq("status", "active")
    .maybeSingle();
  return (
    (data as { id: string; driver_id: string; route_id: string } | null) ??
    null
  );
}

/**
 * Allocate a unique pickup code for a new session. Tries up to 8
 * times before giving up — the partial unique index will reject
 * collisions, and 8 retries against a 1M-code space with a few
 * hundred active sessions is comfortably more than enough.
 *
 * Returns the code the caller should write to the row, or null if
 * we genuinely couldn't find a free code (callers should treat null
 * as a system error and surface a generic failure to the driver).
 */
export async function allocateUniquePickupCode(
  supabase: SupabaseClient,
): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generatePickupCode();
    const { data } = await supabase
      .from("driver_sessions")
      .select("id")
      .eq("pickup_code", candidate)
      .eq("status", "active")
      .maybeSingle();
    if (!data) return candidate;
  }
  return null;
}
