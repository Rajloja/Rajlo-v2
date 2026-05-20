import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/wallet-withdrawals
 *
 * Withdrawal queue for the admin's payouts page. Defaults to
 * pending requests; pass `?status=` to widen the view (paid,
 * rejected, all).
 *
 * Pagination: over-fetches by one to surface `pagination.hasMore`.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "pending";
  const limit = Math.min(
    200,
    Math.max(10, parseInt(sp.get("limit") ?? "100", 10) || 100),
  );
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  let query = supabase
    .from("wallet_withdrawals")
    .select(
      "id, user_id, amount_jmd, bank_name, bank_account_number, account_holder_name, status, admin_note, reviewed_by, reviewed_at, paid_at, created_at",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (status !== "all") query = query.eq("status", status);

  const { data: rows } = await query;
  type Row = {
    id: string;
    user_id: string;
    amount_jmd: number;
    bank_name: string | null;
    bank_account_number: string | null;
    account_holder_name: string | null;
    status: string;
    admin_note: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    paid_at: string | null;
    created_at: string;
  };
  const fetched = (rows ?? []) as Row[];
  const hasMore = fetched.length > limit;
  const list = hasMore ? fetched.slice(0, limit) : fetched;

  // Hydrate the driver display name + email + driver external id.
  const userIds = Array.from(new Set(list.map((r) => r.user_id)));
  const profileMap = new Map<string, { fullName: string | null; role: string }>();
  const driverMap = new Map<string, string>();
  if (userIds.length > 0) {
    const [{ data: profileRows }, { data: driverRows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").in("id", userIds),
      supabase
        .from("drivers")
        .select("user_id, external_id")
        .in("user_id", userIds),
    ]);
    ((profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      role: string;
    }>).forEach((p) =>
      profileMap.set(p.id, { fullName: p.full_name, role: p.role }),
    );
    ((driverRows ?? []) as Array<{ user_id: string; external_id: string }>).forEach(
      (d) => driverMap.set(d.user_id, d.external_id),
    );
  }

  return NextResponse.json({
    withdrawals: list.map((r) => ({
      id: r.id,
      userId: r.user_id,
      driverExternalId: driverMap.get(r.user_id) ?? null,
      driverName: profileMap.get(r.user_id)?.fullName ?? "Unnamed",
      amountJmd: r.amount_jmd,
      bankName: r.bank_name,
      bankAccountNumber: r.bank_account_number,
      accountHolderName: r.account_holder_name,
      status: r.status,
      adminNote: r.admin_note,
      reviewedAt: r.reviewed_at,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    })),
    pagination: { hasMore },
  });
}
