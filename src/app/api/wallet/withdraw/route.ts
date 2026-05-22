import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { debitWallet } from "@/lib/wallet";
import { getBalanceWithLock } from "@/lib/wallet-holds";
import { hasActivePayoutHold } from "@/lib/payout-hold";

/**
 * GET  /api/wallet/withdraw — list my withdrawal requests
 * POST /api/wallet/withdraw — request a new withdrawal
 *
 * Withdrawals are debited from the wallet IMMEDIATELY at request
 * time. That way the driver can't double-spend the same balance
 * on a ride / transfer / second withdrawal while the request sits
 * pending. If an admin rejects (or the bank rejects on settlement),
 * we issue a 'withdrawal_refund' credit back to the wallet — see
 * the admin endpoint.
 *
 * POST body: {
 *   amountJmd: number,
 *   bankName: string,
 *   bankAccountNumber: string,
 *   accountHolderName: string
 * }
 */

const MIN_WITHDRAWAL = 500; // anything smaller costs more in admin time than it's worth
const MAX_WITHDRAWAL = 500_000;

type Body = {
  amountJmd?: unknown;
  bankName?: unknown;
  bankAccountNumber?: unknown;
  accountHolderName?: unknown;
};

export async function GET() {
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

  const { data } = await supabase
    .from("wallet_withdrawals")
    .select(
      "id, amount_jmd, bank_name, bank_account_number, account_holder_name, status, admin_note, reviewed_at, paid_at, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ withdrawals: data ?? [] });
}

export async function POST(request: Request) {
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

  // Withdrawals are a driver feature in product, but the schema is
  // role-agnostic. We still gate on profile.role === 'driver' so a
  // rider can't accidentally drain their wallet to "their bank".
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "driver") {
    return NextResponse.json(
      {
        error:
          "Withdrawals are for driver wallets. Riders can transfer money to other riders or use it to pay for trips.",
      },
      { status: 403 },
    );
  }

  // Moderation gate: a driver with an active payout hold can't
  // withdraw. The hold is placed by the moderation/fraud team while a
  // fraud or dispute investigation runs (see payout_holds).
  if (await hasActivePayoutHold(supabase, user.id)) {
    return NextResponse.json(
      {
        error: "payout_hold",
        message:
          "Your payouts are temporarily on hold while our team reviews your account. Contact support for details.",
      },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const amount = Number(body.amountJmd);
  const bankName =
    typeof body.bankName === "string" ? body.bankName.trim() : "";
  const accountNumber =
    typeof body.bankAccountNumber === "string"
      ? body.bankAccountNumber.trim()
      : "";
  const accountHolder =
    typeof body.accountHolderName === "string"
      ? body.accountHolderName.trim()
      : "";

  if (
    !Number.isInteger(amount) ||
    amount < MIN_WITHDRAWAL ||
    amount > MAX_WITHDRAWAL
  ) {
    return NextResponse.json(
      {
        error: `Amount must be a whole number between ${MIN_WITHDRAWAL} and ${MAX_WITHDRAWAL.toLocaleString("en-JM")} JMD.`,
      },
      { status: 400 },
    );
  }
  if (!bankName || !accountNumber || !accountHolder) {
    return NextResponse.json(
      { error: "Bank name, account number, and account holder name are required." },
      { status: 400 },
    );
  }

  // Pre-check spendable balance (raw − any active hold). Withdrawing
  // money that's reserved for an in-flight multi-leg journey would
  // break the lock, so the available-balance gate covers both cases.
  const { availableJmd, lockedJmd } = await getBalanceWithLock(
    supabase,
    user.id,
  );
  if (availableJmd < amount) {
    return NextResponse.json(
      {
        error: lockedJmd > 0
          ? `Insufficient balance — you have ${availableJmd.toLocaleString("en-JM")} JMD available (JMD ${lockedJmd.toLocaleString("en-JM")} locked for an active trip).`
          : `Insufficient balance — you have ${availableJmd.toLocaleString("en-JM")} JMD available.`,
      },
      { status: 402 },
    );
  }

  // Create the withdrawal row first so we have an id to attach to
  // the debit transaction.
  const { data: withdrawal, error: createError } = await supabase
    .from("wallet_withdrawals")
    .insert({
      user_id: user.id,
      amount_jmd: amount,
      bank_name: bankName,
      bank_account_number: accountNumber,
      account_holder_name: accountHolder,
      status: "pending",
    })
    .select("id")
    .single();

  if (createError || !withdrawal) {
    return NextResponse.json(
      { error: createError?.message ?? "Couldn't create withdrawal." },
      { status: 500 },
    );
  }

  // Debit the wallet — this is the actual money movement. If it
  // fails (insufficient funds raced), roll back the withdrawal row.
  const debit = await debitWallet(supabase, user.id, amount, "withdrawal", {
    withdrawalId: withdrawal.id,
    description: `Withdrawal to ${bankName}`,
  });
  if (!debit.ok) {
    await supabase.from("wallet_withdrawals").delete().eq("id", withdrawal.id);
    return NextResponse.json(
      {
        error: debit.insufficientFunds
          ? "Insufficient balance — wallet changed mid-request."
          : debit.error,
      },
      { status: debit.insufficientFunds ? 402 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    withdrawalId: withdrawal.id,
    balanceAfter: debit.balanceAfter,
  });
}
