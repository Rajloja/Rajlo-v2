import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/qr-charges
 *
 * QR Pay reconciliation. Lists charges with filters + roll-up totals
 * for the admin dashboard. The totals are computed across the FILTERED
 * set so an admin querying "completed last 7 days" gets the totals
 * that match what they're looking at.
 *
 * Query:
 *   ?status=pending|confirmed|expired|cancelled|all
 *   ?since=ISO date  (charges created at or after)
 *   ?until=ISO date  (charges created before)
 *   ?driverId=<external_id>
 *   ?q=<rider name|driver name|code>
 *   ?limit=200 (max 500)
 *   ?offset=0
 *
 * Response includes `pagination.hasMore` for the charges list. Totals
 * are computed across the LOADED page slice — pair with tight filters
 * (status / date range) for reconciliation that matches what's on
 * screen.
 */

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const driverExternalId = url.searchParams.get("driverId")?.trim();
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? 200)),
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset") ?? 0) || 0,
  );

  // Over-fetch by one to surface `hasMore`.
  let query = supabase
    .from("qr_charges")
    .select(
      "id, code, amount_jmd, description, status, expires_at, confirmed_at, cancelled_at, commission_jmd, driver_earnings_jmd, created_at, driver_id, driver_user_id, rider_user_id",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (status !== "all") query = query.eq("status", status);
  if (since) query = query.gte("created_at", since);
  if (until) query = query.lt("created_at", until);
  if (q) {
    const safe = q.replace(/[,()]/g, "");
    // Code is the cheapest match — search by it directly. Name searches
    // would require a join; defer to a stronger search index later.
    query = query.ilike("code", `%${safe.toUpperCase()}%`);
  }

  // Driver-scope filter resolves the external id → drivers.id first,
  // then constrains the charges by it.
  if (driverExternalId) {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("external_id", driverExternalId)
      .maybeSingle();
    if (!driver) {
      return NextResponse.json({
        charges: [],
        pagination: { hasMore: false },
        totals: emptyTotals(),
      });
    }
    query = query.eq("driver_id", driver.id);
  }

  const { data: chargesRaw, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const fetched = chargesRaw ?? [];
  const hasMore = fetched.length > limit;
  const charges = hasMore ? fetched.slice(0, limit) : fetched;
  if (charges.length === 0) {
    return NextResponse.json({
      charges: [],
      pagination: { hasMore: false },
      totals: emptyTotals(),
    });
  }

  // Hydrate driver + rider names. One query each, indexed by user id.
  const driverIds = Array.from(
    new Set(charges.map((c) => c.driver_id).filter(Boolean)),
  );
  const userIds = Array.from(
    new Set(
      [
        ...charges.map((c) => c.driver_user_id),
        ...charges.map((c) => c.rider_user_id),
      ].filter(Boolean) as string[],
    ),
  );

  const [{ data: drivers }, { data: profiles }] = await Promise.all([
    supabase
      .from("drivers")
      .select("id, external_id, first_name, last_name, plate_number")
      .in("id", driverIds),
    userIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
  ]);

  const driverById = new Map((drivers ?? []).map((d) => [d.id, d]));
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p as { id: string; full_name: string | null }]),
  );

  const enriched = charges.map((c) => {
    const driver = driverById.get(c.driver_id);
    const driverProfile = profileById.get(c.driver_user_id);
    const riderProfile = c.rider_user_id ? profileById.get(c.rider_user_id) : null;
    return {
      id: c.id,
      code: c.code,
      amountJmd: c.amount_jmd,
      description: c.description,
      status: c.status,
      expiresAt: c.expires_at,
      confirmedAt: c.confirmed_at,
      cancelledAt: c.cancelled_at,
      commissionJmd: c.commission_jmd,
      driverEarningsJmd: c.driver_earnings_jmd,
      createdAt: c.created_at,
      driver: driver
        ? {
            externalId: driver.external_id,
            name:
              driverProfile?.full_name ??
              [driver.first_name, driver.last_name].filter(Boolean).join(" ") ??
              "Unnamed driver",
            plate: driver.plate_number,
          }
        : null,
      rider: riderProfile
        ? {
            name: riderProfile.full_name ?? "Anonymous rider",
          }
        : null,
    };
  });

  // Totals across the filtered set.
  const settled = enriched.filter((c) => c.status === "confirmed");
  const totals = {
    chargeCount: enriched.length,
    settledCount: settled.length,
    grossJmd: settled.reduce((s, c) => s + c.amountJmd, 0),
    driverEarningsJmd: settled.reduce(
      (s, c) => s + (c.driverEarningsJmd ?? 0),
      0,
    ),
    commissionJmd: settled.reduce((s, c) => s + (c.commissionJmd ?? 0), 0),
  };

  return NextResponse.json({
    charges: enriched,
    pagination: { hasMore },
    totals,
  });
}

function emptyTotals() {
  return {
    chargeCount: 0,
    settledCount: 0,
    grossJmd: 0,
    driverEarningsJmd: 0,
    commissionJmd: 0,
  };
}
