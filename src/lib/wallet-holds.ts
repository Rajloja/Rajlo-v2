/**
 * Wallet hold (soft-lock) helpers.
 *
 * A "hold" is a non-money-moving lock on a portion of the rider's
 * wallet balance. Used today by multi-leg route taxi journeys: when
 * the rider starts the journey we lock the full quoted fare upfront
 * so they can't spend it elsewhere mid-trip. Each leg's actual debit
 * happens at settlement (a real wallet_transactions row) and the hold
 * shrinks by that leg's portion.
 *
 *   Available balance = wallets.balance_jmd − SUM(active holds for user)
 *
 * Every spendable-balance gate in the app — book ride, book hail,
 * withdraw, transfer — checks available, not raw, so the rider can't
 * drain the hold via a side door.
 *
 * Hold lifecycle:
 *   - placeHold     creates an `active` row, amount = initial amount.
 *   - consumeHold   shrinks amount; flips to `consumed` when it hits 0.
 *                   The caller separately writes the real
 *                   wallet_transactions debit.
 *   - releaseHold   refunds the remaining amount back to available
 *                   balance. Used when a journey is cancelled before
 *                   all legs settle.
 *
 * Caller MUST pass a service-role Supabase client (RLS blocks
 * client-side writes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getWalletBalance } from "@/lib/wallet";

export type WalletHold = {
  id: string;
  userId: string;
  journeyId: string | null;
  /** Set for private (Mode A) ride holds. XOR with journeyId — the
   *  `wallet_holds_journey_xor_ride` check constraint enforces that. */
  rideId: string | null;
  initialAmountJmd: number;
  amountJmd: number;
  status: "active" | "consumed" | "released" | "partial";
  reason: string;
  consumedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
};

type HoldRow = {
  id: string;
  user_id: string;
  journey_id: string | null;
  ride_id: string | null;
  initial_amount_jmd: number;
  amount_jmd: number;
  status: "active" | "consumed" | "released" | "partial";
  reason: string;
  consumed_at: string | null;
  released_at: string | null;
  created_at: string;
};

const toHold = (r: HoldRow): WalletHold => ({
  id: r.id,
  userId: r.user_id,
  journeyId: r.journey_id,
  rideId: r.ride_id,
  initialAmountJmd: r.initial_amount_jmd,
  amountJmd: r.amount_jmd,
  status: r.status,
  reason: r.reason,
  consumedAt: r.consumed_at,
  releasedAt: r.released_at,
  createdAt: r.created_at,
});

/* ────────────────────────── Balance reads ────────────────────────── */

/**
 * Sum of every currently-locked hold for a user. O(1) with the
 * `wallet_holds_user_active_idx` partial index.
 */
export async function getLockedAmount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("wallet_holds")
    .select("amount_jmd")
    .eq("user_id", userId)
    .eq("status", "active");
  const rows = (data ?? []) as Array<{ amount_jmd: number }>;
  return rows.reduce((s, r) => s + r.amount_jmd, 0);
}

/**
 * Spendable balance. THIS is what every "can the user afford X?" gate
 * in the app should call — never `getWalletBalance` directly, or the
 * lock is bypassable through any other wallet-spending action.
 */
export async function getAvailableBalance(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const [raw, locked] = await Promise.all([
    getWalletBalance(supabase, userId),
    getLockedAmount(supabase, userId),
  ]);
  return Math.max(0, raw - locked);
}

/**
 * Returns both the raw balance and the locked portion — used by the
 * rider wallet UI so we can show "JMD $1,250 · $500 locked for active
 * trip" instead of just a single number.
 */
export async function getBalanceWithLock(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ balanceJmd: number; lockedJmd: number; availableJmd: number }> {
  const [balanceJmd, lockedJmd] = await Promise.all([
    getWalletBalance(supabase, userId),
    getLockedAmount(supabase, userId),
  ]);
  return {
    balanceJmd,
    lockedJmd,
    availableJmd: Math.max(0, balanceJmd - lockedJmd),
  };
}

/* ────────────────────────── Lifecycle ────────────────────────── */

type PlaceOutcome =
  | { ok: true; hold: WalletHold }
  | {
      ok: false;
      error: string;
      insufficientFunds?: boolean;
      availableJmd?: number;
    };

/**
 * Reserve `amountJmd` for a journey. Fails (does NOT insert) if the
 * rider's available balance is less than the requested amount.
 *
 * Race window: between the affordability check and the INSERT, another
 * spend could land. We re-check available balance post-insert and roll
 * the hold back to `released` if it would have pushed the rider into
 * a negative spendable position. This is a soft guard; a stricter
 * lock would need a DB-side stored proc with FOR UPDATE on the wallet
 * row. The volume of concurrent rider actions per user (1, typically)
 * makes the soft guard sufficient at launch scale.
 */
export async function placeHold(
  supabase: SupabaseClient,
  args: {
    userId: string;
    amountJmd: number;
    /** XOR with rideId. Route-taxi journeys hold at journey level. */
    journeyId?: string | null;
    /** XOR with journeyId. Private rides hold at ride level. */
    rideId?: string | null;
    reason?: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<PlaceOutcome> {
  const { userId, amountJmd } = args;
  const journeyId = args.journeyId ?? null;
  const rideId = args.rideId ?? null;
  if (!Number.isInteger(amountJmd) || amountJmd <= 0) {
    return { ok: false, error: "Hold amount must be a positive integer (JMD)." };
  }
  // Mirror the DB `wallet_holds_journey_xor_ride` check so a misuse
  // fails with a clear caller-facing error instead of a Postgres 23514.
  if (journeyId && rideId) {
    return {
      ok: false,
      error: "Hold cannot reference both a journey and a ride.",
    };
  }

  const available = await getAvailableBalance(supabase, userId);
  if (available < amountJmd) {
    return {
      ok: false,
      error: "insufficient_balance",
      insufficientFunds: true,
      availableJmd: available,
    };
  }

  const { data, error } = await supabase
    .from("wallet_holds")
    .insert({
      user_id: userId,
      journey_id: journeyId,
      ride_id: rideId,
      initial_amount_jmd: amountJmd,
      amount_jmd: amountJmd,
      status: "active",
      reason: args.reason ?? (rideId ? "private_ride" : "route_journey"),
      metadata: args.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to place hold." };
  }
  const hold = toHold(data as HoldRow);

  // Post-insert re-check: if a concurrent spend slipped through, roll
  // back rather than leave the rider in an invalid state.
  const recheck = await getAvailableBalance(supabase, userId);
  if (recheck < 0) {
    await supabase
      .from("wallet_holds")
      .update({
        status: "released",
        amount_jmd: 0,
        released_at: new Date().toISOString(),
      })
      .eq("id", hold.id);
    return {
      ok: false,
      error: "insufficient_balance",
      insufficientFunds: true,
      availableJmd: 0,
    };
  }

  return { ok: true, hold };
}

type ConsumeOutcome =
  | { ok: true; hold: WalletHold }
  | { ok: false; error: string };

/**
 * Shrink a hold by `amountJmd`. When the hold reaches zero, flip to
 * `consumed` (terminal). The CALLER separately writes the real money
 * movement — typically `debitWallet(..., 'ride_charge', ...)` for the
 * leg charge that this hold portion was reserved for.
 *
 * Idempotency: passing more than the remaining amount is an error
 * (the caller has a bug). The hold never goes negative.
 */
export async function consumeHoldPortion(
  supabase: SupabaseClient,
  holdId: string,
  amountJmd: number,
): Promise<ConsumeOutcome> {
  if (!Number.isInteger(amountJmd) || amountJmd <= 0) {
    return { ok: false, error: "Consume amount must be a positive integer." };
  }

  const { data: existing } = await supabase
    .from("wallet_holds")
    .select("*")
    .eq("id", holdId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Hold not found." };
  const hold = toHold(existing as HoldRow);
  if (hold.status !== "active") {
    return {
      ok: false,
      error: `Hold is not active (status=${hold.status}).`,
    };
  }
  if (amountJmd > hold.amountJmd) {
    return {
      ok: false,
      error: `Consume ${amountJmd} exceeds remaining ${hold.amountJmd}.`,
    };
  }

  const remaining = hold.amountJmd - amountJmd;
  const nextStatus = remaining === 0 ? "consumed" : "active";

  const { data: updated, error } = await supabase
    .from("wallet_holds")
    .update({
      amount_jmd: remaining,
      status: nextStatus,
      consumed_at: remaining === 0 ? new Date().toISOString() : null,
    })
    .eq("id", holdId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) {
    return {
      ok: false,
      error: "Hold was modified concurrently — retry.",
    };
  }
  return { ok: true, hold: toHold(updated as HoldRow) };
}

/**
 * Refund whatever's still locked back to available balance. Called
 * when a journey is cancelled mid-flight, or when a settlement step
 * fails and we need to undo a partial consumption.
 *
 * Sets status to `released` (if no legs were ever consumed) or
 * `partial` (if some were consumed but the rest is being refunded).
 */
export async function releaseHold(
  supabase: SupabaseClient,
  holdId: string,
  reason?: string,
): Promise<ConsumeOutcome> {
  const { data: existing } = await supabase
    .from("wallet_holds")
    .select("*")
    .eq("id", holdId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Hold not found." };
  const hold = toHold(existing as HoldRow);
  if (hold.status !== "active") {
    // Already terminal — releasing is a no-op, return the row as-is.
    return { ok: true, hold };
  }

  const wasPartial = hold.amountJmd < hold.initialAmountJmd;
  const nextStatus = wasPartial ? "partial" : "released";

  const { data: updated, error } = await supabase
    .from("wallet_holds")
    .update({
      status: nextStatus,
      amount_jmd: 0,
      released_at: new Date().toISOString(),
      metadata: reason
        ? { ...(hold as unknown as Record<string, unknown>), release_reason: reason }
        : undefined,
    })
    .eq("id", holdId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) {
    return {
      ok: false,
      error: "Hold was modified concurrently — retry.",
    };
  }
  return { ok: true, hold: toHold(updated as HoldRow) };
}

/**
 * Fetch a hold by id. Useful for admin tooling / debugging.
 */
export async function getHold(
  supabase: SupabaseClient,
  holdId: string,
): Promise<WalletHold | null> {
  const { data } = await supabase
    .from("wallet_holds")
    .select("*")
    .eq("id", holdId)
    .maybeSingle();
  return data ? toHold(data as HoldRow) : null;
}

/**
 * Find the CURRENTLY-ACTIVE hold for a given private ride, if any.
 * Backed by the `wallet_holds_ride_active_idx` partial index so this
 * is O(1) on the hot path.
 *
 * Returns null if:
 *   - No hold was ever placed for this ride (rides created before the
 *     private-ride-hold migration will hit this — the on-complete
 *     path treats it as a soft-fallback to the pre-hold flow).
 *   - The hold was already consumed / released / released-partial
 *     (only `active` counts for lookup purposes).
 */
export async function getActiveHoldForRide(
  supabase: SupabaseClient,
  rideId: string,
): Promise<WalletHold | null> {
  const { data } = await supabase
    .from("wallet_holds")
    .select("*")
    .eq("ride_id", rideId)
    .eq("status", "active")
    // A ride can only ever have ONE active hold at a time under the
    // current design (placed at booking, consumed at completion, or
    // released on cancel). maybeSingle() short-circuits at 1 row so
    // any accidental duplicate would surface as a Postgres error rather
    // than silently returning the wrong one.
    .maybeSingle();
  return data ? toHold(data as HoldRow) : null;
}
