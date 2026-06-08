import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { creditWallet } from "@/lib/wallet";
import { notifyDriver } from "@/lib/notify";
import { sendWalletPayoutExcludedEmail } from "@/lib/email-templates";

/**
 * POST /api/admin/payouts/[id]/exclude
 *
 * Admin opts a single payout out of the batch (manual review, name
 * mismatch, fraud check, account closed, etc.). Effects:
 *
 *   1. Flip status to 'excluded' with reason + timestamp.
 *   2. If the row was 'pending' or 'batched' (i.e. wallet was already
 *      debited at OTP verify), credit the wallet back via a
 *      'withdrawal_refund' transaction.
 *   3. If `notifyDriver=true` (default), send push + inbox + email
 *      notification with the reason. Email can carry a custom
 *      `customMessage` body so admin can explain the specific issue.
 *
 * Body:
 *   {
 *     reason: string,                 // short admin-facing label, e.g. "Account number mismatch"
 *     customMessage?: string,         // optional driver-facing copy for the email body
 *     notifyDriver?: boolean,         // default true; pass false to silently park the row
 *   }
 */

type Body = {
  reason?: unknown;
  customMessage?: unknown;
  notifyDriver?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const body = (await request.json().catch(() => ({}))) as Body;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const customMessage =
    typeof body.customMessage === "string" ? body.customMessage.trim() : "";
  const shouldNotify = body.notifyDriver !== false; // default true

  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required so we have an audit trail." },
      { status: 400 },
    );
  }

  const { data: row } = await supabase
    .from("wallet_withdrawals")
    .select(
      "id, user_id, amount_jmd, bank_name, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }
  if (!["pending", "batched"].includes(row.status)) {
    return NextResponse.json(
      {
        error: `Can't exclude a ${row.status} payout. Only pending or batched rows can be excluded.`,
      },
      { status: 409 },
    );
  }

  const wasDebited = row.status === "pending" || row.status === "batched";

  await supabase
    .from("wallet_withdrawals")
    .update({
      status: "excluded",
      excluded_at: new Date().toISOString(),
      excluded_reason: reason,
    })
    .eq("id", row.id);

  // Refund the wallet — OTP verification always debits, so any
  // pending/batched row had funds taken. Without the refund the
  // driver loses the money to a bounce we caused.
  if (wasDebited) {
    await creditWallet(
      supabase,
      row.user_id,
      row.amount_jmd,
      "withdrawal_refund",
      {
        withdrawalId: row.id,
        description: `Excluded from batch: ${reason}`,
      },
    );
  }

  if (shouldNotify) {
    // Display name from public.profiles, email from auth.users (the
    // profiles table has no email column — that's an auth-only field).
    const [{ data: profile }, { data: authData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", row.user_id)
        .single(),
      supabase.auth.admin.getUserById(row.user_id).catch(() => ({ data: null })),
    ]);
    const email = authData?.user?.email ?? null;

    const amountLabel = `JMD ${row.amount_jmd.toLocaleString("en-JM")}`;
    await Promise.all([
      notifyDriver(supabase, {
        driverUserId: row.user_id,
        kind: "system",
        title: `Payout held · ${amountLabel} returned`,
        body: customMessage || `We couldn't process this payout: ${reason}. The funds are back in your wallet.`,
        href: "/driver/wallet",
        pushTag: `payout-excluded-${row.id}`,
        requireInteraction: true,
      }).catch(() => null),
      email
        ? sendWalletPayoutExcludedEmail(email, {
            amountJmd: row.amount_jmd,
            bankName: row.bank_name ?? "your bank",
            reason,
            customMessage: customMessage || null,
            driverName: profile?.full_name ?? null,
          })
            .then(async () => {
              await supabase
                .from("wallet_withdrawals")
                .update({
                  excluded_email_sent_at: new Date().toISOString(),
                })
                .eq("id", row.id);
            })
            .catch(() => null)
        : null,
    ]);
  }

  return NextResponse.json({ ok: true, refunded: wasDebited });
}
