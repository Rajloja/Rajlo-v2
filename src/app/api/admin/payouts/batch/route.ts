import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { notifyDriver } from "@/lib/notify";
import { sendWalletPayoutProcessingEmail } from "@/lib/email-templates";

/**
 * POST /api/admin/payouts/batch
 *
 * Generate the weekly bank batch file from a set of pending payout
 * rows. Atomically:
 *   1. Re-validates the selected rows are still in 'pending'.
 *   2. Creates a payout_batches row to identify this batch.
 *   3. Flips each selected wallet_withdrawals row to status='batched'
 *      with batch_id + batched_at populated.
 *   4. Returns the CSV as a downloadable file response.
 *
 * Body: { ids: string[] }   // wallet_withdrawals.id selected by admin
 *
 * CSV format (chosen as a sensible default until the actual bank's
 * spec arrives — see project memory). Columns:
 *
 *   driver_name, account_holder_name, bank_name, branch,
 *   account_number, account_type, routing_number, trn, amount_jmd,
 *   rajlo_request_id
 *
 * Easy to remap to whatever the chosen bank (NCB / JN / Scotia / etc.)
 * actually accepts once that's known. Header row included.
 */

type Body = { ids?: unknown };

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;

  const body = (await request.json().catch(() => ({}))) as Body;
  const ids =
    Array.isArray(body.ids) && body.ids.every((x) => typeof x === "string")
      ? (body.ids as string[])
      : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one payout to batch." },
      { status: 400 },
    );
  }
  if (ids.length > 500) {
    return NextResponse.json(
      { error: "Batch up to 500 payouts at a time." },
      { status: 400 },
    );
  }

  // Re-fetch rows under server auth + filter to actually-batchable
  // status. If the admin's UI was stale (someone else excluded a row
  // between page load and submit), we silently drop those rather
  // than aborting the whole batch.
  const { data: rows } = await supabase
    .from("wallet_withdrawals")
    .select(
      "id, user_id, amount_jmd, bank_name, bank_account_number, account_holder_name, payout_method_snapshot, status",
    )
    .in("id", ids)
    .eq("status", "pending");

  type Row = {
    id: string;
    user_id: string;
    amount_jmd: number;
    bank_name: string | null;
    bank_account_number: string | null;
    account_holder_name: string | null;
    payout_method_snapshot: {
      branch?: string;
      account_type?: string;
      routing_number?: string | null;
    } | null;
    status: string;
  };
  const list = (rows ?? []) as Row[];

  if (list.length === 0) {
    return NextResponse.json(
      { error: "None of the selected payouts are still pending." },
      { status: 409 },
    );
  }

  // Hydrate driver display name + TRN. The CSV needs both for the
  // bank's reference + (in some cases) the TRN line item.
  const userIds = Array.from(new Set(list.map((r) => r.user_id)));
  // Profile name + driver TRN come from public tables; email lives on
  // auth.users (NOT public.profiles), so we fetch the auth rows
  // individually for each affected driver. The auth.admin call needs
  // the service-role key which requireAdmin's `supabase` client has.
  const [{ data: profileRows }, { data: driverRows }, authUsers] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", userIds),
      supabase
        .from("drivers")
        .select("user_id, external_id, trn")
        .in("user_id", userIds),
      Promise.all(
        userIds.map((id) =>
          supabase.auth.admin
            .getUserById(id)
            .then(({ data }) => ({ id, email: data?.user?.email ?? null }))
            .catch(() => ({ id, email: null as string | null })),
        ),
      ),
    ]);
  const profileMap = new Map<
    string,
    { fullName: string; email: string | null }
  >();
  const emailMap = new Map<string, string | null>();
  authUsers.forEach((u) => emailMap.set(u.id, u.email));
  ((profileRows ?? []) as Array<{
    id: string;
    full_name: string | null;
  }>).forEach((p) =>
    profileMap.set(p.id, {
      fullName: p.full_name ?? "",
      email: emailMap.get(p.id) ?? null,
    }),
  );
  // Ensure every user we have an email for has an entry (in case the
  // profiles row is missing — defensive).
  userIds.forEach((id) => {
    if (!profileMap.has(id)) {
      profileMap.set(id, { fullName: "", email: emailMap.get(id) ?? null });
    }
  });
  const driverMap = new Map<string, { externalId: string; trn: string | null }>();
  ((driverRows ?? []) as Array<{
    user_id: string;
    external_id: string;
    trn: string | null;
  }>).forEach((d) =>
    driverMap.set(d.user_id, { externalId: d.external_id, trn: d.trn }),
  );

  // Create the batch record. Calculate totals from validated rows
  // (NOT the input ids list, which may include rows we dropped).
  const totalAmount = list.reduce((sum, r) => sum + r.amount_jmd, 0);
  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const fileName = `rajlo-payouts-${stamp}.csv`;

  const { data: batch, error: batchError } = await supabase
    .from("payout_batches")
    .insert({
      created_by: actor.userId,
      file_name: fileName,
      total_amount_jmd: totalAmount,
      row_count: list.length,
    })
    .select("id")
    .single();
  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? "Couldn't create batch." },
      { status: 500 },
    );
  }

  // Stamp the rows as batched.
  await supabase
    .from("wallet_withdrawals")
    .update({
      status: "batched",
      batch_id: batch.id,
      batched_at: new Date().toISOString(),
    })
    .in(
      "id",
      list.map((r) => r.id),
    );

  // Tell each driver their payout is processing — push + inbox + email.
  // Fire-and-forget so the CSV download doesn't wait on email delivery.
  void Promise.all(
    list.map(async (r) => {
      const profile = profileMap.get(r.user_id);
      const last4 = (r.bank_account_number ?? "").slice(-4);
      const amountLabel = `JMD ${r.amount_jmd.toLocaleString("en-JM")}`;
      await notifyDriver(supabase, {
        driverUserId: r.user_id,
        kind: "system",
        title: `Payout processing · ${amountLabel}`,
        body: `${amountLabel} has been sent to your bank. Expect it within 1–3 business days.`,
        href: "/driver/wallet",
        pushTag: `payout-processing-${r.id}`,
      }).catch(() => null);
      if (profile?.email) {
        await sendWalletPayoutProcessingEmail(profile.email, {
          amountJmd: r.amount_jmd,
          bankName: r.bank_name ?? "your bank",
          accountLast4: last4,
          driverName: profile.fullName || null,
        }).catch(() => null);
      }
    }),
  ).catch(() => null);

  // Build the CSV.
  const header = [
    "driver_name",
    "account_holder_name",
    "bank_name",
    "branch",
    "account_number",
    "account_type",
    "routing_number",
    "trn",
    "amount_jmd",
    "rajlo_request_id",
  ];
  const csvLines: string[] = [header.join(",")];
  for (const r of list) {
    const snap = r.payout_method_snapshot ?? {};
    const driver = driverMap.get(r.user_id);
    csvLines.push(
      [
        profileMap.get(r.user_id)?.fullName ?? "",
        r.account_holder_name ?? "",
        r.bank_name ?? "",
        snap.branch ?? "",
        r.bank_account_number ?? "",
        snap.account_type ?? "",
        snap.routing_number ?? "",
        driver?.trn ?? "",
        r.amount_jmd.toString(),
        r.id,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const csv = csvLines.join("\n") + "\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      // Surface the new batch id back to the UI so it can navigate
      // straight to /admin/payouts?batchId=... after download.
      "X-Rajlo-Batch-Id": batch.id,
    },
  });
}

/** RFC 4180 — quote any field that contains comma, quote, or newline;
 *  escape internal quotes by doubling. Numbers + clean text pass
 *  through unchanged for readability. */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
