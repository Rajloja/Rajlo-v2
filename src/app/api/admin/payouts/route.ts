import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/payouts
 *
 * Payout queue for the /admin/payouts dashboard.
 *
 * Query params:
 *   status  one of: pending (default) | batched | paid | excluded |
 *           cancelled | all
 *   batchId limit results to a specific payout_batches.id
 *   limit   max rows (10..200, default 100)
 *   offset  pagination offset (default 0)
 *
 * Hydrated per row: driver display name, external_id, TRN, email,
 * the bank-method snapshot (the authoritative copy for the batch
 * file), and the OTP verification timestamp so admin can see how
 * fresh the request is.
 *
 * Never returns 'unverified' rows — those are draft payouts the
 * driver hasn't confirmed yet and shouldn't appear in admin work.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "pending";
  const batchId = sp.get("batchId");
  const limit = Math.min(
    200,
    Math.max(10, parseInt(sp.get("limit") ?? "100", 10) || 100),
  );
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  let query = supabase
    .from("wallet_withdrawals")
    .select(
      "id, user_id, amount_jmd, bank_name, bank_account_number, account_holder_name, payout_method_snapshot, status, admin_note, otp_verified_at, batched_at, batch_id, paid_at, excluded_at, excluded_reason, excluded_email_sent_at, bank_reference, created_at",
    )
    .neq("status", "unverified")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (status !== "all") query = query.eq("status", status);
  if (batchId) query = query.eq("batch_id", batchId);

  const { data: rows } = await query;
  type Row = {
    id: string;
    user_id: string;
    amount_jmd: number;
    bank_name: string | null;
    bank_account_number: string | null;
    account_holder_name: string | null;
    payout_method_snapshot: Record<string, unknown> | null;
    status: string;
    admin_note: string | null;
    otp_verified_at: string | null;
    batched_at: string | null;
    batch_id: string | null;
    paid_at: string | null;
    excluded_at: string | null;
    excluded_reason: string | null;
    excluded_email_sent_at: string | null;
    bank_reference: string | null;
    created_at: string;
  };
  const fetched = (rows ?? []) as Row[];
  const hasMore = fetched.length > limit;
  const list = hasMore ? fetched.slice(0, limit) : fetched;

  // Hydrate driver display name + email + external id + TRN.
  // We pull from BOTH `profiles` and `drivers` because the two tables
  // can disagree: a driver may complete TA onboarding (drivers row
  // populated) before their profile row gets a full_name from the
  // app (which happens later via account settings). When the profile
  // is sparse we fall through to the drivers row so the payout queue
  // doesn't show "Unnamed · no email" for a verified driver whose
  // name we already have on file.
  const userIds = Array.from(new Set(list.map((r) => r.user_id)));
  const profileMap = new Map<
    string,
    { fullName: string | null; email: string | null }
  >();
  const driverMap = new Map<
    string,
    {
      externalId: string;
      trn: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    }
  >();
  if (userIds.length > 0) {
    const [{ data: profileRows }, { data: driverRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds),
      supabase
        .from("drivers")
        .select("user_id, external_id, trn, first_name, last_name, email")
        .in("user_id", userIds),
    ]);
    ((profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>).forEach((p) =>
      profileMap.set(p.id, { fullName: p.full_name, email: p.email }),
    );
    ((driverRows ?? []) as Array<{
      user_id: string;
      external_id: string;
      trn: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>).forEach((d) =>
      driverMap.set(d.user_id, {
        externalId: d.external_id,
        trn: d.trn,
        firstName: d.first_name,
        lastName: d.last_name,
        email: d.email,
      }),
    );
  }

  /** Resolve the most-complete display name for a row. Cascade:
   *  profile.full_name → drivers.first+last → bank account_holder
   *  → "Unnamed" (true unknown — only fires for genuinely empty rows). */
  function resolveDriverName(r: Row): string {
    const profile = profileMap.get(r.user_id);
    if (profile?.fullName && profile.fullName.trim()) return profile.fullName;
    const driver = driverMap.get(r.user_id);
    const driverName = [driver?.firstName, driver?.lastName]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(" ")
      .trim();
    if (driverName) return driverName;
    if (r.account_holder_name && r.account_holder_name.trim()) {
      return r.account_holder_name;
    }
    return "Unnamed";
  }

  function resolveDriverEmail(r: Row): string | null {
    return (
      profileMap.get(r.user_id)?.email ??
      driverMap.get(r.user_id)?.email ??
      null
    );
  }

  return NextResponse.json({
    payouts: list.map((r) => ({
      id: r.id,
      userId: r.user_id,
      driverExternalId: driverMap.get(r.user_id)?.externalId ?? null,
      driverTrn: driverMap.get(r.user_id)?.trn ?? null,
      driverName: resolveDriverName(r),
      driverEmail: resolveDriverEmail(r),
      amountJmd: r.amount_jmd,
      bankName: r.bank_name,
      bankAccountNumber: r.bank_account_number,
      accountHolderName: r.account_holder_name,
      // The snapshot is authoritative for branch / routing / account
      // type — those columns aren't on the legacy wallet_withdrawals
      // shape but live in the JSONB the trigger writes.
      methodSnapshot: r.payout_method_snapshot,
      status: r.status,
      adminNote: r.admin_note,
      otpVerifiedAt: r.otp_verified_at,
      batchedAt: r.batched_at,
      batchId: r.batch_id,
      paidAt: r.paid_at,
      excludedAt: r.excluded_at,
      excludedReason: r.excluded_reason,
      excludedEmailSentAt: r.excluded_email_sent_at,
      bankReference: r.bank_reference,
      createdAt: r.created_at,
    })),
    pagination: { hasMore },
  });
}
