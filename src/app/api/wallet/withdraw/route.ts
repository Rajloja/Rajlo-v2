import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getBalanceWithLock } from "@/lib/wallet-holds";
import { hasActivePayoutHold } from "@/lib/payout-hold";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { sendWalletPayoutOtpEmail } from "@/lib/email-templates";

/**
 * GET  /api/wallet/withdraw — list my payout requests (history).
 * POST /api/wallet/withdraw — request a new payout. Issues an OTP to
 *                             the driver's email. Wallet is NOT yet
 *                             debited — that happens at /verify, once
 *                             the driver confirms the code.
 *
 * Flow (new payout system):
 *
 *   1. Driver POSTs amount → row created with status='unverified',
 *      OTP hashed + emailed.
 *   2. Driver POSTs OTP to /api/wallet/withdraw/[id]/verify → on
 *      success: wallet debited, row flipped to 'pending', appears
 *      in the admin queue for the next Friday batch.
 *   3. Driver can cancel at /api/wallet/withdraw/[id]/cancel any
 *      time before admin marks it `batched` (auto-refund applies if
 *      the row was already verified+debited).
 *
 * The earlier "POST = immediate debit" behavior is gone. Existing
 * pending rows from before the migration are still admin-actionable
 * via the same admin endpoints — only the request entry-point has
 * changed.
 *
 * POST body: { amountJmd: number }
 *   The bank fields come from the driver's saved payout_method
 *   (see /api/driver/payout-method). The method is snapshotted onto
 *   the withdrawal row by a DB trigger so editing the method later
 *   doesn't rewrite in-flight payouts.
 */

const MIN_WITHDRAWAL = 500;
const MAX_WITHDRAWAL = 500_000;
const OTP_TTL_MIN = 10;

type Body = { amountJmd?: unknown };

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

  // Exclude unverified rows from history — they're effectively drafts
  // waiting on OTP entry, surfacing them in "My payouts" is confusing.
  const { data } = await supabase
    .from("wallet_withdrawals")
    .select(
      "id, amount_jmd, bank_name, bank_account_number, account_holder_name, status, admin_note, otp_expires_at, reviewed_at, batched_at, paid_at, excluded_at, excluded_reason, bank_reference, created_at",
    )
    .eq("user_id", user.id)
    .neq("status", "unverified")
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

  // Rate limit — 5 requests per 10 minutes per driver. Stops a bug
  // or malicious script from spraying OTP emails.
  const limited = enforceUserRateLimit(user.id, {
    prefix: "wallet:withdraw-request",
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // Driver-only — same gate as before. Riders can transfer to other
  // riders but can't withdraw to a bank.
  const { data: profile } = await auth
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "driver") {
    return NextResponse.json(
      {
        error:
          "Withdrawals are for driver wallets. Riders can transfer money or use it to pay for trips.",
      },
      { status: 403 },
    );
  }

  // Moderation gate: drivers with an active payout hold can't
  // withdraw. Hold is placed by the fraud/moderation team.
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

  // Saved bank account required before requesting a payout. The
  // driver UI redirects to /driver/wallet/bank when this hits.
  const { data: payoutMethod } = await supabase
    .from("payout_methods")
    .select(
      "id, bank_name, branch, account_number, account_holder_name, account_type",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!payoutMethod) {
    return NextResponse.json(
      {
        error: "no_payout_method",
        message:
          "Save your bank account details before requesting a payout.",
      },
      { status: 409 },
    );
  }

  // Single in-flight payout at a time — keeps the admin queue clean
  // and avoids confusing partial debits during the OTP window.
  const { data: inFlight } = await supabase
    .from("wallet_withdrawals")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["unverified", "pending", "batched"])
    .maybeSingle();
  if (inFlight) {
    return NextResponse.json(
      {
        error: "payout_in_flight",
        message:
          inFlight.status === "unverified"
            ? "You already have a payout waiting for the verification code. Enter the code in your email or wait for it to expire."
            : "You already have a payout in progress. Wait for it to be paid or excluded before requesting another.",
      },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const amount = Number(body.amountJmd);
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

  // Pre-check balance. We don't reserve / debit here — the verify
  // step does the actual debit. But there's no point sending an OTP
  // for a payout that can't possibly succeed.
  const { availableJmd, lockedJmd } = await getBalanceWithLock(
    supabase,
    user.id,
  );
  if (availableJmd < amount) {
    return NextResponse.json(
      {
        error:
          lockedJmd > 0
            ? `Insufficient balance — you have ${availableJmd.toLocaleString("en-JM")} JMD available (JMD ${lockedJmd.toLocaleString("en-JM")} locked for an active trip).`
            : `Insufficient balance — you have ${availableJmd.toLocaleString("en-JM")} JMD available.`,
      },
      { status: 402 },
    );
  }

  // Generate 6-digit OTP. Use crypto.randomInt for a CSPRNG source —
  // Math.random is forbidden here for the same reason it's forbidden
  // in cookie / session token generation.
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const otpHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  const { data: withdrawal, error: createError } = await supabase
    .from("wallet_withdrawals")
    .insert({
      user_id: user.id,
      amount_jmd: amount,
      payout_method_id: payoutMethod.id,
      // bank_name / bank_account_number / account_holder_name are
      // copied onto the row by the snapshot_payout_method() trigger.
      status: "unverified",
      otp_hash: otpHash,
      otp_expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (createError || !withdrawal) {
    return NextResponse.json(
      { error: createError?.message ?? "Couldn't create payout request." },
      { status: 500 },
    );
  }

  // Send the OTP. Non-blocking on the response — even if email fails
  // the driver can hit /api/wallet/withdraw/[id]/resend (future) or
  // just request again after the OTP expires.
  const accountLast4 = payoutMethod.account_number.slice(-4);
  void sendWalletPayoutOtpEmail(user.email ?? "", {
    code,
    amountJmd: amount,
    bankLabel: `${payoutMethod.bank_name} ••••${accountLast4}`,
    expiresInMinutes: OTP_TTL_MIN,
    driverName: profile?.full_name ?? null,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    withdrawalId: withdrawal.id,
    expiresAt,
    bankLabel: `${payoutMethod.bank_name} ••••${accountLast4}`,
  });
}
