import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { notifyDriver } from "@/lib/notify";
import { sendWalletPayoutPaidEmail } from "@/lib/email-templates";

/**
 * POST /api/admin/payouts/paid
 *
 * Mark one or more 'batched' payouts as 'paid' after the bank
 * confirms the credit. For each row marked paid we fan out to the
 * driver via push + inbox + email (the user's "notify drivers all
 * three ways" requirement).
 *
 * Body:
 *   { ids?: string[], batchId?: string, bankReference?: string }
 *
 *   - Pass `ids` to mark a hand-picked set.
 *   - Pass `batchId` to mark every batched row in that batch.
 *   - At least one of the two is required.
 *   - `bankReference` (optional) is the bank's transaction reference
 *     that lands in the driver's payout receipt email + the row's
 *     bank_reference column.
 */

type Body = { ids?: unknown; batchId?: unknown; bankReference?: unknown };

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const body = (await request.json().catch(() => ({}))) as Body;
  const ids =
    Array.isArray(body.ids) && body.ids.every((x) => typeof x === "string")
      ? (body.ids as string[])
      : [];
  const batchId = typeof body.batchId === "string" ? body.batchId : null;
  const bankReference =
    typeof body.bankReference === "string"
      ? body.bankReference.trim() || null
      : null;

  if (ids.length === 0 && !batchId) {
    return NextResponse.json(
      { error: "Pass ids[] or batchId — nothing to mark paid." },
      { status: 400 },
    );
  }

  // Resolve the actual row set.
  let query = supabase
    .from("wallet_withdrawals")
    .select(
      "id, user_id, amount_jmd, bank_name, bank_account_number, status",
    )
    .eq("status", "batched");
  if (ids.length > 0) query = query.in("id", ids);
  if (batchId) query = query.eq("batch_id", batchId);
  const { data: rows } = await query;
  type Row = {
    id: string;
    user_id: string;
    amount_jmd: number;
    bank_name: string | null;
    bank_account_number: string | null;
    status: string;
  };
  const list = (rows ?? []) as Row[];
  if (list.length === 0) {
    return NextResponse.json(
      { error: "No batched payouts matched. Maybe already paid or excluded." },
      { status: 409 },
    );
  }

  const paidAt = new Date().toISOString();
  await supabase
    .from("wallet_withdrawals")
    .update({
      status: "paid",
      paid_at: paidAt,
      bank_reference: bankReference,
    })
    .in(
      "id",
      list.map((r) => r.id),
    );

  // If a batchId was used and ALL its batched rows are now paid,
  // stamp the batch as paid too. Lets the batch history view show
  // "paid" vs "partially paid" at a glance.
  if (batchId) {
    const { count: remainingBatched } = await supabase
      .from("wallet_withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("status", "batched");
    if (!remainingBatched || remainingBatched === 0) {
      await supabase
        .from("payout_batches")
        .update({ paid_at: paidAt })
        .eq("id", batchId);
    }
  }

  // Fan-out notifications. Name comes from profiles; email comes
  // from auth.users (NOT a column on the public.profiles table —
  // bug we hit when emails silently no-op'd).
  const userIds = Array.from(new Set(list.map((r) => r.user_id)));
  const [{ data: profileRows }, authUsers] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", userIds),
    Promise.all(
      userIds.map((id) =>
        supabase.auth.admin
          .getUserById(id)
          .then(({ data }) => ({ id, email: data?.user?.email ?? null }))
          .catch(() => ({ id, email: null as string | null })),
      ),
    ),
  ]);
  const emailMap = new Map<string, string | null>();
  authUsers.forEach((u) => emailMap.set(u.id, u.email));
  const profileMap = new Map<
    string,
    { fullName: string | null; email: string | null }
  >();
  ((profileRows ?? []) as Array<{
    id: string;
    full_name: string | null;
  }>).forEach((p) =>
    profileMap.set(p.id, {
      fullName: p.full_name,
      email: emailMap.get(p.id) ?? null,
    }),
  );
  userIds.forEach((id) => {
    if (!profileMap.has(id)) {
      profileMap.set(id, { fullName: null, email: emailMap.get(id) ?? null });
    }
  });

  await Promise.all(
    list.map(async (r) => {
      const profile = profileMap.get(r.user_id);
      const last4 = (r.bank_account_number ?? "").slice(-4);
      const amountLabel = `JMD ${r.amount_jmd.toLocaleString("en-JM")}`;
      // Push + inbox via notifyDriver. requireInteraction so the
      // notification stays until tapped — money landing is important
      // enough to interrupt the driver's flow.
      await notifyDriver(supabase, {
        driverUserId: r.user_id,
        kind: "system",
        title: `Payout sent · ${amountLabel}`,
        body: `${amountLabel} has been sent to your ${r.bank_name ?? "bank"} account ••${last4}.`,
        href: "/driver/wallet",
        pushTag: `payout-paid-${r.id}`,
        requireInteraction: true,
      }).catch(() => null);
      // Email — only fire if we have an address.
      if (profile?.email) {
        await sendWalletPayoutPaidEmail(profile.email, {
          amountJmd: r.amount_jmd,
          bankName: r.bank_name ?? "your bank",
          accountLast4: last4,
          bankReference,
          driverName: profile.fullName,
        }).catch(() => null);
      }
    }),
  );

  return NextResponse.json({ ok: true, paidCount: list.length });
}
