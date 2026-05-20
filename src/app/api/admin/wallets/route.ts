import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/wallets
 *
 * Lists every user's wallet balance with their profile + email so
 * the admin can see who holds what at a glance.
 *
 * Query params:
 *   ?role=rider|driver|admin   filter by profile.role
 *   ?q=<search>                matches name or email
 *   ?sort=balance|newest        default: balance desc
 *   ?limit=100 (max 200)
 *   ?offset=0
 *
 * Response carries `pagination.hasMore` (the page slice doesn't
 * exhaust the in-memory result set) and `totals` computed across the
 * full filtered set, not just the page.
 */

type WalletRow = {
  userId: string;
  fullName: string;
  email: string | null;
  role: "rider" | "driver" | "admin";
  balanceJmd: number;
  updatedAt: string;
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const sp = request.nextUrl.searchParams;
  const role = sp.get("role") ?? "all";
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const sort = sp.get("sort") === "newest" ? "newest" : "balance";
  const limit = Math.min(
    200,
    Math.max(10, parseInt(sp.get("limit") ?? "100", 10) || 100),
  );
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  // Pull profiles + wallets — outer-join so users without a wallet
  // row yet (haven't transacted) still surface with balance 0.
  let profileQuery = supabase
    .from("profiles")
    .select("id, full_name, role")
    .limit(1000);
  if (role !== "all") profileQuery = profileQuery.eq("role", role);

  const [{ data: profiles }, { data: wallets }] = await Promise.all([
    profileQuery,
    supabase.from("wallets").select("user_id, balance_jmd, updated_at"),
  ]);

  const walletMap = new Map(
    ((wallets ?? []) as Array<{
      user_id: string;
      balance_jmd: number;
      updated_at: string;
    }>).map((w) => [w.user_id, w]),
  );

  // Hydrate emails. listUsers caps at 1000 per page; for free-tier
  // sized platforms that's plenty. Above 1000 we'd need to paginate.
  const emailMap = new Map<string, string | null>();
  try {
    const { data: authData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    (authData?.users ?? []).forEach((u) =>
      emailMap.set(u.id, u.email ?? null),
    );
  } catch (e) {
    console.error(
      "listUsers in /admin/wallets:",
      e instanceof Error ? e.message : "unknown error",
    );
  }

  type ProfileRow = {
    id: string;
    full_name: string | null;
    role: "rider" | "driver" | "admin";
  };

  let rows: WalletRow[] = ((profiles ?? []) as ProfileRow[]).map((p) => {
    const w = walletMap.get(p.id);
    return {
      userId: p.id,
      fullName: p.full_name ?? "Unnamed user",
      email: emailMap.get(p.id) ?? null,
      role: p.role,
      balanceJmd: w?.balance_jmd ?? 0,
      updatedAt: w?.updated_at ?? "",
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q),
    );
  }

  rows.sort((a, b) => {
    if (sort === "newest") {
      return (
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime()
      );
    }
    return b.balanceJmd - a.balanceJmd;
  });

  // Aggregate totals for the page header.
  const totals = {
    total: rows.length,
    riders: rows.filter((r) => r.role === "rider").length,
    drivers: rows.filter((r) => r.role === "driver").length,
    admins: rows.filter((r) => r.role === "admin").length,
    totalRiderBalance: rows
      .filter((r) => r.role === "rider")
      .reduce((s, r) => s + r.balanceJmd, 0),
    totalDriverBalance: rows
      .filter((r) => r.role === "driver")
      .reduce((s, r) => s + r.balanceJmd, 0),
  };

  const page = rows.slice(offset, offset + limit);
  const hasMore = rows.length > offset + limit;

  return NextResponse.json({
    wallets: page,
    pagination: { hasMore },
    totals,
  });
}
