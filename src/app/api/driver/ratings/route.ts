import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/driver/ratings
 *
 * The signed-in driver's rating profile.
 *
 * Returns:
 *   summary      - lifetime average + total count + 5-star %
 *   distribution - count per star (1..5) for the histogram
 *   last30Days   - average + count over the trailing 30 days
 *   recent       - a page of recent ratings + the rider's first name
 *                  + the rider's optional written comment + the
 *                  trip's pickup→dropoff (so the driver knows which
 *                  trip the rating is for without bouncing into the
 *                  history list)
 *   pagination   - { hasMore } for the `recent` list
 *
 * `?limit=` + `?offset=` paginate the recent list (default 20, max
 * 50). The aggregate stats stay computed across the driver's full
 * history (capped at 500 ratings to keep the histogram query cheap)
 * regardless of the recent page being viewed — they describe
 * lifetime performance, not the loaded slice.
 */

const MS_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 50;

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
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // Pull ALL ratings targeting this driver. One bulk query — the
  // distribution + averages are computed in memory.
  const { data: ratings, error } = await supabase
    .from("ride_ratings")
    .select("ride_id, rater_id, stars, comment, created_at")
    .eq("rated_id", user.id)
    .eq("rated_role", "driver")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = ratings ?? [];
  const total = all.length;
  const sum = all.reduce((a, r) => a + (r.stars ?? 0), 0);
  const average = total === 0 ? null : Math.round((sum / total) * 10) / 10;

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (const r of all) {
    const s = r.stars as 1 | 2 | 3 | 4 | 5;
    if (s >= 1 && s <= 5) distribution[s] += 1;
  }
  const fiveStarPct = total === 0 ? null : Math.round((distribution[5] / total) * 100);

  const cutoff30 = Date.now() - 30 * MS_DAY;
  const last30 = all.filter((r) => new Date(r.created_at).getTime() >= cutoff30);
  const last30Sum = last30.reduce((a, r) => a + (r.stars ?? 0), 0);
  const last30Average =
    last30.length === 0 ? null : Math.round((last30Sum / last30.length) * 10) / 10;

  /* ─── Recent (page with comments and trip context) ─── */
  const url = new URL(request.url);
  const recentLimit = Math.min(
    MAX_RECENT_LIMIT,
    Math.max(
      1,
      Number(url.searchParams.get("limit")) || DEFAULT_RECENT_LIMIT,
    ),
  );
  const recentOffset = Math.max(
    0,
    Number(url.searchParams.get("offset")) || 0,
  );
  // Slice the requested page out of `all` (which is the aggregate set,
  // already ordered most-recent first). One row beyond the page tells
  // us whether to surface `hasMore` on the response.
  const recentSlice = all.slice(recentOffset, recentOffset + recentLimit + 1);
  const recentHasMore = recentSlice.length > recentLimit;
  const recentRaw = recentHasMore
    ? recentSlice.slice(0, recentLimit)
    : recentSlice;
  const riderIds = Array.from(new Set(recentRaw.map((r) => r.rater_id)));
  const rideIds = Array.from(new Set(recentRaw.map((r) => r.ride_id)));

  const [{ data: profiles }, { data: rides }] = await Promise.all([
    riderIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", riderIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    rideIds.length > 0
      ? supabase
          .from("rides")
          .select("id, pickup_name, dropoff_name")
          .in("id", rideIds)
      : Promise.resolve({
          data: [] as { id: string; pickup_name: string; dropoff_name: string }[],
        }),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rideMap = new Map((rides ?? []).map((r) => [r.id, r]));

  const recent = recentRaw.map((r) => {
    const profile = profileMap.get(r.rater_id);
    const ride = rideMap.get(r.ride_id);
    // First name only — it's the same PII rule as everywhere else
    // (riders don't get the driver's last name on the trip-share
    // page either, so we mirror).
    const riderFirstName = profile?.full_name?.split(" ")[0] ?? "Rider";
    return {
      id: `${r.ride_id}-${r.rater_id}`,
      stars: r.stars,
      comment: r.comment,
      createdAt: r.created_at,
      riderFirstName,
      pickup: ride?.pickup_name ?? null,
      dropoff: ride?.dropoff_name ?? null,
    };
  });

  return NextResponse.json({
    summary: {
      total,
      average,
      fiveStarPct,
    },
    distribution,
    last30Days: {
      total: last30.length,
      average: last30Average,
    },
    recent,
    pagination: { hasMore: recentHasMore },
  });
}
