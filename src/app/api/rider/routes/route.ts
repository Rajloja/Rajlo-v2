import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/rider/routes
 *
 * Returns the active TA-licensed route catalogue, grouped client-side by
 * `origin_parish`. Riders use this to pick a corridor before hailing a
 * route taxi. Drivers also hit this endpoint when starting a session.
 *
 * Query params:
 *   ?parish=...  — filter to a single parish
 *   ?q=...       — substring match on origin/destination (case-insensitive)
 */
export async function POST() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export async function GET(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    // Don't fall back to mock — route catalogue is the spine of Mode B.
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const parish = url.searchParams.get("parish")?.trim();
  const q = url.searchParams.get("q")?.trim();

  let query = supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, distance_km, ta_fare_jmd, slug",
    )
    .eq("active", true)
    .order("origin_parish", { ascending: true, nullsFirst: false })
    .order("origin_name", { ascending: true });

  if (parish) {
    query = query.eq("origin_parish", parish);
  }
  if (q) {
    // Origin OR destination match. The escaping below guards against the
    // PostgREST `or()` filter splitting on commas in user input.
    const safe = q.replace(/[,()]/g, "");
    query = query.or(
      `origin_name.ilike.%${safe}%,destination_name.ilike.%${safe}%`,
    );
  }

  // 2000 is well above the current 884-row catalogue with headroom
  // for catalogue growth; PostgREST's hard default of 1000 is the
  // real floor here so we keep this explicit. If the catalogue ever
  // exceeds ~1800 rows we should switch to paginated fetches client-
  // side rather than bumping this further.
  const { data, error } = await query.limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    routes: (data ?? []).map((r) => ({
      id: r.id,
      origin: r.origin_name,
      destination: r.destination_name,
      parish: r.origin_parish,
      distanceKm: Number(r.distance_km),
      taFareJmd: r.ta_fare_jmd,
      slug: r.slug,
    })),
  });
}
