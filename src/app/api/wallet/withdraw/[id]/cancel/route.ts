import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { creditWallet } from "@/lib/wallet";

/**
 * POST /api/wallet/withdraw/[id]/cancel
 *
 * Driver cancels their own pending payout. Allowed while status is:
 *   - 'unverified' — never debited; just flip status to 'cancelled'.
 *   - 'pending'    — wallet was debited at verify; auto-refund via
 *                    a 'withdrawal_refund' credit transaction.
 *
 * NOT allowed once status is 'batched' — at that point the row is
 * sitting in a CSV file the admin has handed (or is about to hand)
 * to the bank. Reversing it would require admin coordination; driver
 * should contact support.
 *
 * No body required.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: row } = await supabase
    .from("wallet_withdrawals")
    .select("id, user_id, amount_jmd, status, bank_name")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }
  if (row.status !== "unverified" && row.status !== "pending") {
    return NextResponse.json(
      {
        error:
          row.status === "batched"
            ? "This payout is already in the bank batch — contact support to reverse it."
            : `This payout is already ${row.status} and can't be cancelled.`,
      },
      { status: 409 },
    );
  }

  const wasDebited = row.status === "pending";

  await supabase
    .from("wallet_withdrawals")
    .update({ status: "cancelled" })
    .eq("id", row.id);

  // Refund only if the wallet was actually debited (pending = OTP
  // verified = debit happened). Unverified rows never moved money.
  if (wasDebited) {
    await creditWallet(
      supabase,
      row.user_id,
      row.amount_jmd,
      "withdrawal_refund",
      {
        withdrawalId: row.id,
        description: `Cancelled payout to ${row.bank_name ?? "bank"}`,
      },
    );
  }

  return NextResponse.json({ ok: true, refunded: wasDebited });
}
