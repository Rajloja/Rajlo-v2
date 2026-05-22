import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { debitWallet } from "@/lib/wallet";
import { getBalanceWithLock } from "@/lib/wallet-holds";
import { sendWalletTransferOtpEmail } from "@/lib/email-templates";
import { enforceUserRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/wallet/transfer
 *
 * Initiates a rider-to-rider transfer:
 *   1. Resolve the recipient by email.
 *   2. Debit the sender's wallet up front so they can't double-spend
 *      the same balance while the OTP is in flight.
 *   3. Create a `wallet_transfers` row in 'pending_verification'.
 *   4. Email a 6-digit OTP to the sender's address (or their
 *      preferred channel — only email is wired today; sms slot is
 *      reserved for when an SMS provider lands).
 *   5. Return the transfer id so the client can show the OTP screen.
 *
 * The recipient ONLY sees the money once the sender posts the OTP
 * to /api/wallet/transfer/[id]/verify and we confirm.
 *
 * Body: {
 *   recipientEmail: string,
 *   amountJmd: number,
 *   message?: string,
 *   otpMethod?: "email" | "sms"   // sms returns 400 today
 * }
 */

const MIN_TRANSFER = 50;
const MAX_TRANSFER = 100_000;
const OTP_TTL_MIN = 10;

type Body = {
  recipientEmail?: unknown;
  amountJmd?: unknown;
  message?: unknown;
  otpMethod?: unknown;
};

function generateOtp(): string {
  // 6 digits, zero-padded. randomInt is cryptographically secure.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Per-user throttle on initiate. 5 transfer initiations per 10 minutes
  // is enough headroom for legitimate retries (typo'd recipient email,
  // OTP not received, abandoned + restarted) but stops a stolen-session
  // attacker from spraying transfers / spamming OTP emails.
  const limited = enforceUserRateLimit(user.id, {
    prefix: "wallet:transfer-initiate",
    limit: 5,
    windowMs: 10 * 60_000,
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
  const recipientEmail =
    typeof body.recipientEmail === "string"
      ? body.recipientEmail.trim().toLowerCase()
      : "";
  const amount = Number(body.amountJmd);
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 200) : "";
  const otpMethod = body.otpMethod === "sms" ? "sms" : "email";

  if (otpMethod === "sms") {
    return NextResponse.json(
      {
        error:
          "SMS verification isn't wired up yet — choose Email and we'll send the code there.",
      },
      { status: 400 },
    );
  }

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Recipient email is required." },
      { status: 400 },
    );
  }
  if (recipientEmail === user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "You can't send money to yourself." },
      { status: 400 },
    );
  }
  if (
    !Number.isInteger(amount) ||
    amount < MIN_TRANSFER ||
    amount > MAX_TRANSFER
  ) {
    return NextResponse.json(
      {
        error: `Amount must be between ${MIN_TRANSFER} and ${MAX_TRANSFER.toLocaleString("en-JM")} JMD.`,
      },
      { status: 400 },
    );
  }

  // Resolve the recipient. We look up via the auth.users table since
  // that's where email lives.
  const { data: authData } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const recipient = (authData?.users ?? []).find(
    (u) => u.email?.toLowerCase() === recipientEmail,
  );
  if (!recipient) {
    return NextResponse.json(
      {
        error: "No Rajlo account found for that email.",
      },
      { status: 404 },
    );
  }
  // Recipient must be a real profile (not a deleted shell).
  const { data: recipientProfile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", recipient.id)
    .maybeSingle();
  if (!recipientProfile) {
    return NextResponse.json(
      { error: "Recipient profile not found." },
      { status: 404 },
    );
  }

  // Pre-check spendable balance (raw − any active hold). Transferring
  // out funds reserved for an in-flight journey would break the lock.
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

  // Generate the OTP. Store the SHA-256 hash, never the plain digits.
  const otp = generateOtp();
  const expiresAt = new Date(
    Date.now() + OTP_TTL_MIN * 60 * 1000,
  ).toISOString();

  const { data: transfer, error: insertError } = await supabase
    .from("wallet_transfers")
    .insert({
      sender_id: user.id,
      recipient_id: recipient.id,
      amount_jmd: amount,
      message: message || null,
      otp_hash: hashOtp(otp),
      otp_method: otpMethod,
      otp_sent_to: user.email,
      status: "pending_verification",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (insertError || !transfer) {
    return NextResponse.json(
      { error: insertError?.message ?? "Couldn't create transfer." },
      { status: 500 },
    );
  }

  // Debit the sender NOW so the same balance can't fund a second
  // transfer while this OTP is pending. If verification fails or the
  // user cancels, we issue a 'transfer_in' refund (handled in the
  // cancel + verify endpoints).
  const debit = await debitWallet(supabase, user.id, amount, "transfer_out", {
    transferId: transfer.id,
    relatedUserId: recipient.id,
    description: `Pending transfer to ${recipient.email ?? "another rider"}`,
  });
  if (!debit.ok) {
    await supabase.from("wallet_transfers").delete().eq("id", transfer.id);
    return NextResponse.json(
      {
        error: debit.insufficientFunds
          ? "Insufficient balance — wallet changed mid-request."
          : debit.error,
      },
      { status: debit.insufficientFunds ? 402 : 500 },
    );
  }

  // Send the OTP. Best-effort — if email fails the user can request
  // a resend. We don't roll back the debit because the transfer row
  // still exists and they can cancel it from the UI.
  const senderProfile = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  await sendWalletTransferOtpEmail(user.email, {
    code: otp,
    amountJmd: amount,
    recipientLabel:
      (recipientProfile.full_name as string | null) ??
      recipient.email ??
      "another rider",
    expiresInMinutes: OTP_TTL_MIN,
    senderName: (senderProfile.data?.full_name as string | null) ?? null,
  });

  return NextResponse.json({
    ok: true,
    transferId: transfer.id,
    recipient: {
      email: recipient.email,
      name: (recipientProfile.full_name as string | null) ?? null,
    },
    sentTo: user.email,
    expiresAt,
  });
}
