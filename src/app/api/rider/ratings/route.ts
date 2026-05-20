import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/rider/ratings
 *
 * Returns ratings the signed-in rider has *given* — most-recent
 * first. Each entry is enriched with the trip's pickup → dropoff
 * names and the driver's display name so the page can render
 * meaningful context without a follow-up join client-side.
 *
 * Also returns a small summary block: total count, average stars
 * across the rider's history, and a per-star distribution for the
 * "ratings given" bar chart.
 */

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

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

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset")) || 0,
  );

  const { data: ratings, error } = await supabase
    .from("ride_ratings")
    .select("id, ride_id, rated_id, stars, comment, created_at")
    .eq("rater_id", user.id)
    .eq("rater_role", "rider")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fetched = ratings ?? [];
  const hasMore = fetched.length > limit;
  const list = hasMore ? fetched.slice(0, limit) : fetched;

  // Bulk-enrich with the trip + driver context. Two cheap lookups,
  // not N+1 — we resolve all ride_ids in one query and all rated user
  // ids (drivers) in another.
  const rideIds = list.map((r) => r.ride_id);
  const driverIds = Array.from(new Set(list.map((r) => r.rated_id)));

  const [ridesRes, driversRes] = await Promise.all([
    rideIds.length > 0
      ? supabase
          .from("rides")
          .select("id, pickup_name, dropoff_name, completed_at")
          .in("id", rideIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            pickup_name: string;
            dropoff_name: string;
            completed_at: string | null;
          }[],
        }),
    driverIds.length > 0
      ? supabase
          .from("drivers")
          .select("user_id, first_name, last_name")
          .in("user_id", driverIds)
      : Promise.resolve({
          data: [] as {
            user_id: string;
            first_name: string | null;
            last_name: string | null;
          }[],
        }),
  ]);

  const rideById = new Map((ridesRes.data ?? []).map((r) => [r.id, r]));
  const driverNameByUserId = new Map(
    (driversRes.data ?? []).map((d) => [
      d.user_id,
      [d.first_name, d.last_name].filter(Boolean).join(" ") || "Driver",
    ]),
  );

  // Summary aggregates — across the entire rated set, not just the
  // page. We re-query for the count + avg so pagination doesn't
  // distort the numbers in the header.
  const { data: agg } = await supabase
    .from("ride_ratings")
    .select("stars")
    .eq("rater_id", user.id)
    .eq("rater_role", "rider");

  const allStars = (agg ?? []).map((r) => r.stars ?? 0);
  const total = allStars.length;
  const avg = total > 0 ? allStars.reduce((s, v) => s + v, 0) / total : 0;
  // Distribution: index 0 = 1-star, … index 4 = 5-star.
  const distribution: number[] = [0, 0, 0, 0, 0];
  for (const s of allStars) {
    if (s >= 1 && s <= 5) distribution[s - 1] += 1;
  }

  return NextResponse.json({
    summary: {
      total,
      average: total > 0 ? Math.round(avg * 10) / 10 : null,
      distribution,
    },
    ratings: list.map((r) => {
      const ride = rideById.get(r.ride_id);
      return {
        id: r.id,
        rideId: r.ride_id,
        stars: r.stars,
        comment: r.comment,
        createdAt: r.created_at,
        driverName: driverNameByUserId.get(r.rated_id) ?? "Driver",
        pickupName: ride?.pickup_name ?? null,
        dropoffName: ride?.dropoff_name ?? null,
        tripCompletedAt: ride?.completed_at ?? null,
      };
    }),
    pagination: { hasMore },
  });
}
