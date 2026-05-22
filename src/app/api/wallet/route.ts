import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getWalletBalance } from "@/lib/wallet";
import { getLockedAmount } from "@/lib/wallet-holds";

/**
 * GET /api/wallet
 *
 * Returns the calling user's wallet — balance plus a page of their
 * transactions. Used by both rider and driver wallet pages; shape is
 * identical, only the kinds of transactions differ.
 *
 * `?limit=` page size (default 30, capped at 100).
 * `?offset=` (default 0) drives "Load more"; response carries
 * `pagination.hasMore` so callers don't need a count query.
 */

export async function GET(request: NextRequest) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const limit = Math.min(
    100,
    Math.max(5, parseInt(request.nextUrl.searchParams.get("limit") ?? "30", 10) || 30),
  );
  const offset = Math.max(
    0,
    parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0,
  );

  // Pull raw balance + the locked total in parallel. `locked` is the
  // sum of every active wallet_holds row for this user — currently
  // populated only by multi-leg route taxi journeys. The wallet UI
  // shows "JMD $X available" (balance − locked) with a small hint
  // when the lock is non-zero.
  const [balance, locked] = await Promise.all([
    getWalletBalance(supabase, user.id),
    getLockedAmount(supabase, user.id),
  ]);
  const available = Math.max(0, balance - locked);

  // Over-fetch by one row so we can return `hasMore` without a
  // separate count query. If the DB returns limit+1, we slice off the
  // probe row before sending the page back.
  const { data: txnsRaw } = await supabase
    .from("wallet_transactions")
    .select(
      "id, direction, amount_jmd, kind, ride_id, related_user_id, deposit_id, withdrawal_id, transfer_id, description, balance_after_jmd, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  const txns = txnsRaw ?? [];
  const hasMore = txns.length > limit;

  return NextResponse.json({
    balanceJmd: balance,
    lockedJmd: locked,
    availableJmd: available,
    transactions: hasMore ? txns.slice(0, limit) : txns,
    pagination: { hasMore },
  });
}
