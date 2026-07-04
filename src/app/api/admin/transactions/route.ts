import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/transactions
 *
 * Money-flow analytics for the admin Transactions page.
 *
 * Returns:
 *   - totals across the requested window (in / out / net by kind)
 *   - a daily series for the chart
 *   - a recent transactions list (filterable + searchable)
 *   - the top spenders + earners across the window
 *
 * Query:
 *   ?range=24h|7d|30d|90d|1y|all   (default 30d)
 *   ?kind=deposit|ride_charge|ride_earning|withdrawal|...|all
 *   ?direction=credit|debit|all
 *   ?q=<user name>                 (matches profiles.full_name)
 *   ?limit=200                      (max 500)
 *   ?offset=0                       (paginates the list only — the
 *                                    aggregates/series/top-users are
 *                                    always computed over the full
 *                                    window so they don't shift as
 *                                    the admin pages)
 *
 * Response includes `pagination: { hasMore }` for the transactions
 * list so the page can show / hide a Load-more button.
 */

const RANGE_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  all: 0, // 0 = no since cutoff
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "30d";
  const kindFilter = url.searchParams.get("kind") ?? "all";
  const directionFilter = url.searchParams.get("direction") ?? "all";
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? 200)),
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset") ?? 0) || 0,
  );

  const days = RANGE_DAYS[range] ?? 30;
  const sinceIso =
    days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  // ─── Aggregates: pull ALL transactions in the window (capped to a
  // reasonable safety ceiling). At rider scale this is fine; if it
  // grows we move to a stored aggregate later.
  let aggQuery = supabase
    .from("wallet_transactions")
    .select("direction, amount_jmd, kind, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (sinceIso) aggQuery = aggQuery.gte("created_at", sinceIso);

  const { data: aggRows, error: aggError } = await aggQuery;
  if (aggError) {
    return NextResponse.json({ error: aggError.message }, { status: 500 });
  }
  const allRows = aggRows ?? [];

  // Roll-up totals by kind / direction.
  const totals = {
    inJmd: 0, // credits to wallets (deposits + earnings + transfers in + refunds + admin credits)
    outJmd: 0, // debits from wallets (charges + withdrawals + transfers out + admin debits)
    netJmd: 0,
    countTotal: allRows.length,
    byKind: {} as Record<string, { in: number; out: number; count: number }>,
  };
  for (const r of allRows) {
    const amt = r.amount_jmd as number;
    if (r.direction === "credit") totals.inJmd += amt;
    else totals.outJmd += amt;
    const k = (totals.byKind[r.kind] ??= { in: 0, out: 0, count: 0 });
    if (r.direction === "credit") k.in += amt;
    else k.out += amt;
    k.count += 1;
  }
  totals.netJmd = totals.inJmd - totals.outJmd;

  // ─── Daily series for the chart.
  // Bucket rows into "YYYY-MM-DD" days, then emit a sorted series.
  const dayBuckets = new Map<string, { in: number; out: number }>();
  for (const r of allRows) {
    const date = new Date(r.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const cur = dayBuckets.get(key) ?? { in: 0, out: 0 };
    if (r.direction === "credit") cur.in += r.amount_jmd as number;
    else cur.out += r.amount_jmd as number;
    dayBuckets.set(key, cur);
  }
  const dailySeries = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { in: inJmd, out: outJmd }]) => ({
      day,
      inJmd,
      outJmd,
      netJmd: inJmd - outJmd,
    }));

  // ─── Top users (spenders + earners).
  const userTotals = new Map<
    string,
    { in: number; out: number; count: number }
  >();
  for (const r of allRows) {
    const cur = userTotals.get(r.user_id as string) ?? {
      in: 0,
      out: 0,
      count: 0,
    };
    if (r.direction === "credit") cur.in += r.amount_jmd as number;
    else cur.out += r.amount_jmd as number;
    cur.count += 1;
    userTotals.set(r.user_id as string, cur);
  }
  const topSpenderIds = Array.from(userTotals.entries())
    .sort(([, a], [, b]) => b.out - a.out)
    .slice(0, 5)
    .map(([id]) => id);
  const topEarnerIds = Array.from(userTotals.entries())
    .sort(([, a], [, b]) => b.in - a.in)
    .slice(0, 5)
    .map(([id]) => id);
  const topUserIds = Array.from(new Set([...topSpenderIds, ...topEarnerIds]));
  const { data: topProfiles } = topUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", topUserIds)
    : { data: [] as Array<{ id: string; full_name: string | null; role: string }> };
  const profileById = new Map((topProfiles ?? []).map((p) => [p.id, p]));

  const topSpenders = topSpenderIds.map((id) => ({
    userId: id,
    name: (profileById.get(id) as { full_name: string | null } | undefined)?.full_name ?? "Unknown",
    role: (profileById.get(id) as { role: string } | undefined)?.role ?? "rider",
    totalJmd: userTotals.get(id)?.out ?? 0,
    count: userTotals.get(id)?.count ?? 0,
  }));
  const topEarners = topEarnerIds.map((id) => ({
    userId: id,
    name: (profileById.get(id) as { full_name: string | null } | undefined)?.full_name ?? "Unknown",
    role: (profileById.get(id) as { role: string } | undefined)?.role ?? "driver",
    totalJmd: userTotals.get(id)?.in ?? 0,
    count: userTotals.get(id)?.count ?? 0,
  }));

  // ─── Filterable transactions list — paged via offset.
  // Over-fetch by one row so we can surface `hasMore` without a
  // separate count query against the same filtered set.
  let listQuery = supabase
    .from("wallet_transactions")
    .select(
      "id, user_id, direction, amount_jmd, kind, ride_id, related_user_id, description, balance_after_jmd, created_at",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (sinceIso) listQuery = listQuery.gte("created_at", sinceIso);
  if (kindFilter !== "all") listQuery = listQuery.eq("kind", kindFilter);
  if (directionFilter === "credit" || directionFilter === "debit") {
    listQuery = listQuery.eq("direction", directionFilter);
  }

  // Search matches either a user name OR a transaction id prefix. The
  // admin usually pastes the short 8-char id shown in the UI (e.g.
  // "dc9ac4b3") — we ilike-prefix so partial matches work. `%` and `_`
  // in the query would be interpreted as SQL wildcards, so strip them
  // to keep the ilike safe.
  if (q) {
    const safe = q.replace(/[%_]/g, "");
    const { data: matchProfiles } = await supabase
      .from("profiles")
      .select("id")
      .ilike("full_name", `%${safe}%`)
      .limit(50);
    const nameUserIds = (matchProfiles ?? []).map((p) => p.id);

    const orClauses: string[] = [`id.ilike.${safe}%`];
    if (nameUserIds.length > 0) {
      orClauses.push(`user_id.in.(${nameUserIds.join(",")})`);
    }
    listQuery = listQuery.or(orClauses.join(","));
  }

  const { data: txnsRaw, error: listError } = await listQuery;
  const txns = txnsRaw ?? [];
  const hasMore = txns.length > limit;
  const pageTxns = hasMore ? txns.slice(0, limit) : txns;
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  // Hydrate user names + roles for the list.
  const listUserIds = Array.from(
    new Set(pageTxns.map((t) => t.user_id as string)),
  );
  const { data: listProfiles } = listUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", listUserIds)
    : { data: [] as Array<{ id: string; full_name: string | null; role: string }> };
  const usersById: Record<string, { name: string; role: string }> = {};
  for (const p of listProfiles ?? []) {
    usersById[p.id] = {
      name: p.full_name ?? "Unknown",
      role: p.role,
    };
  }

  return NextResponse.json({
    totals,
    dailySeries,
    topSpenders,
    topEarners,
    transactions: pageTxns.map((t) => ({
      id: t.id,
      userId: t.user_id,
      direction: t.direction,
      amountJmd: t.amount_jmd,
      kind: t.kind,
      description: t.description,
      balanceAfterJmd: t.balance_after_jmd,
      createdAt: t.created_at,
    })),
    pagination: { hasMore },
    usersById,
  });
}
