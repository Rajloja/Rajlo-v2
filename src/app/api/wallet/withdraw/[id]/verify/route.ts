import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { debitWallet } from "@/lib/wallet";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { sendWalletPayoutRequestedEmail } from "@/lib/email-templates";

/**
 * POST /api/wallet/withdraw/[id]/verify
 *
 * Driver submits the OTP issued at POST /api/wallet/withdraw. On
 * match:
 *   - Debit the wallet (the actual money movement).
 *   - Flip status from 'unverified' → 'pending' (visible to admin).
 *   - Send a confirmation email.
 *
 * On wrong code:
 *   - Increment otp_attempts. After 5 bad tries, mark 'cancelled'.
 *     No refund needed — the wallet wasn't debited yet (debit happens
 *     here on success).
 *
 * On expired or already terminal:
 *   - Return a clear error so the UI can prompt the driver to start
 *     a fresh request.
 *
 * Body: { code: string }   // 6-digit OTP
 */

const MAX_ATTEMPTS = 5;

type Body = { code?: unknown };

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
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

  // Per-user throttle so the 5-attempt lockout can't be burned in
  // milliseconds by a brute-force script. 10 verify attempts per 60s
  // is generous for a real human mistyping a 6-digit code.
  const limited = enforceUserRateLimit(user.id, {
    prefix: "wallet:withdraw-verify",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{4,8}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the 6-digit code from your email." },
      { status: 400 },
    );
  }

  const { data: row } = await supabase
    .from("wallet_withdrawals")
    .select(
      "id, user_id, amount_jmd, status, otp_hash, otp_attempts, otp_expires_at, bank_name, bank_account_number",
    )
    .eq("id", id)
    .maybeSingle();

  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }
  if (row.status !== "unverified") {
    return NextResponse.json(
      { error: `This payout is already ${row.status}.` },
      { status: 409 },
    );
  }
  if (
    !row.otp_hash ||
    !row.otp_expires_at ||
    new Date(row.otp_expires_at).getTime() < Date.now()
  ) {
    // Expired or never had an OTP (shouldn't happen for unverified
    // rows but defensive). Mark cancelled so the driver can request
    // afresh; no refund needed since we never debited.
    await supabase
      .from("wallet_withdrawals")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    return NextResponse.json(
      { error: "This code expired — request the payout again." },
      { status: 410 },
    );
  }

  const submittedHash = createHash("sha256").update(code).digest("hex");
  if (!constantTimeHexEqual(submittedHash, row.otp_hash)) {
    const nextAttempts = row.otp_attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await supabase
        .from("wallet_withdrawals")
        .update({ otp_attempts: nextAttempts, status: "cancelled" })
        .eq("id", row.id);
      return NextResponse.json(
        {
          error:
            "Too many wrong codes — the payout request was cancelled. Start a fresh request when you're ready.",
        },
        { status: 423 },
      );
    }
    await supabase
      .from("wallet_withdrawals")
      .update({ otp_attempts: nextAttempts })
      .eq("id", row.id);
    return NextResponse.json(
      {
        error: `Wrong code. ${MAX_ATTEMPTS - nextAttempts} attempt${MAX_ATTEMPTS - nextAttempts === 1 ? "" : "s"} left.`,
      },
      { status: 401 },
    );
  }

  // OTP matches. Now the actual money movement.
  const debit = await debitWallet(
    supabase,
    user.id,
    row.amount_jmd,
    "withdrawal",
    {
      withdrawalId: row.id,
      description: `Withdrawal to ${row.bank_name ?? "bank"}`,
    },
  );
  if (!debit.ok) {
    // Balance changed since the OTP was issued (e.g. driver paid for
    // a ride in the interim). Mark cancelled so the row isn't stuck
    // forever in 'unverified'.
    await supabase
      .from("wallet_withdrawals")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    return NextResponse.json(
      {
        error: debit.insufficientFunds
          ? "Your balance changed since you started this payout — request again with the current balance."
          : debit.error,
      },
      { status: debit.insufficientFunds ? 402 : 500 },
    );
  }

  await supabase
    .from("wallet_withdrawals")
    .update({
      status: "pending",
      otp_verified_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  // Confirmation email — non-blocking; OTP email already arrived,
  // this just provides a paper trail.
  const accountLast4 = (row.bank_account_number ?? "").slice(-4);
  const { data: profile } = await auth
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  void sendWalletPayoutRequestedEmail(user.email ?? "", {
    amountJmd: row.amount_jmd,
    bankName: row.bank_name ?? "your bank",
    accountLast4,
    driverName: profile?.full_name ?? null,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    balanceAfter: debit.balanceAfter,
  });
}
