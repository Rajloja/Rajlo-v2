import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/analytics/overview?days=30
 *
 * Returns the heavy-lift analytics payload that powers the
 * /admin/analytics page + the operations dashboard charts:
 *
 *   - daily ride volume + revenue series (for the area chart)
 *   - status mix (for the donut)
 *   - parish breakdown (top 8 origin parishes)
 *   - vehicle type mix
 *   - hour-of-day × day-of-week heatmap
 *   - rating distribution
 *   - top drivers by completed rides + earnings
 *   - top riders by spend
 *   - cancellation reasons
 *
 * One round-trip per page load. Heavier than /stats but still bounded
 * by the `days` window (default 30, max 90) so the queries stay
 * predictable.
 */

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const requested = parseInt(
    request.nextUrl.searchParams.get("days") ?? "30",
    10,
  );
  // Min was 7 to keep the weekly-trend charts meaningful, but ride
  // monitoring calls this same endpoint for its status-count KPIs
  // and needs to support 24h. 1-day aggregates are fine for count
  // rollups; the heatmap just gets sparse (which is honest).
  const days = Math.min(90, Math.max(1, isNaN(requested) ? 30 : requested));

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [
    rides,
    ratings,
    drivers,
    docs,
  ] = await Promise.all([
    supabase
      .from("rides")
      .select(
        "id, status, requested_at, completed_at, cancelled_at, cancellation_reason, final_fare_jmd, estimated_fare_jmd, pickup_parish, dropoff_parish, driver_id, rider_id",
      )
      .gte("requested_at", sinceIso)
      .order("requested_at", { ascending: true }),
    supabase
      .from("ride_ratings")
      .select("stars, rated_id, created_at")
      .gte("created_at", sinceIso),
    supabase.from("drivers").select("id, vehicle_type, activated, is_online"),
    supabase.from("driver_documents").select("status"),
  ]);

  type RideRow = {
    id: string;
    status: string;
    requested_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    final_fare_jmd: number | null;
    estimated_fare_jmd: number | null;
    pickup_parish: string | null;
    dropoff_parish: string | null;
    driver_id: string | null;
    rider_id: string;
  };
  const rideRows = (rides.data ?? []) as RideRow[];

  /* ─────────── Daily series: rides + revenue ─────────── */
  const dayKeys: string[] = [];
  const ridesByDay = new Map<string, number>();
  const revenueByDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayKeys.push(key);
    ridesByDay.set(key, 0);
    revenueByDay.set(key, 0);
  }
  rideRows.forEach((r) => {
    const key = r.requested_at.slice(0, 10);
    if (ridesByDay.has(key))
      ridesByDay.set(key, (ridesByDay.get(key) ?? 0) + 1);
    if (r.status === "completed" && r.completed_at) {
      const ckey = r.completed_at.slice(0, 10);
      if (revenueByDay.has(ckey))
        revenueByDay.set(
          ckey,
          (revenueByDay.get(ckey) ?? 0) + (r.final_fare_jmd ?? 0),
        );
    }
  });

  const formatDay = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-JM", { day: "numeric", month: "short" });
  };

  const daily = dayKeys.map((k) => ({
    date: k,
    label: formatDay(k),
    rides: ridesByDay.get(k) ?? 0,
    revenue: revenueByDay.get(k) ?? 0,
  }));

  /* ─────────── Status mix ─────────── */
  const statusCounts: Record<string, number> = {};
  rideRows.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  });

  /* ─────────── Parish breakdown (origin) ─────────── */
  const parishCounts = new Map<string, number>();
  rideRows.forEach((r) => {
    const key = r.pickup_parish ?? "Unknown";
    parishCounts.set(key, (parishCounts.get(key) ?? 0) + 1);
  });
  const parishes = Array.from(parishCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([parish, count]) => ({ parish, count }));

  /* ─────────── Vehicle type mix ─────────── */
  const vehicleCounts = new Map<string, number>();
  ((drivers.data ?? []) as { vehicle_type: string | null }[]).forEach((d) => {
    const key = d.vehicle_type ?? "Unspecified";
    vehicleCounts.set(key, (vehicleCounts.get(key) ?? 0) + 1);
  });
  const vehicleTypes = Array.from(vehicleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  /* ─────────── Compliance status mix ─────────── */
  const complianceCounts: Record<string, number> = {};
  ((docs.data ?? []) as { status: string }[]).forEach((d) => {
    complianceCounts[d.status] = (complianceCounts[d.status] ?? 0) + 1;
  });

  /* ─────────── Hour × Day heatmap ─────────── */
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  rideRows.forEach((r) => {
    const d = new Date(r.requested_at);
    heatmap[d.getDay()][d.getHours()]++;
  });

  /* ─────────── Rating distribution + average ─────────── */
  const ratingRows = (ratings.data ?? []) as { stars: number; rated_id: string }[];
  const ratingDist = [0, 0, 0, 0, 0];
  ratingRows.forEach((r) => {
    if (r.stars >= 1 && r.stars <= 5) ratingDist[r.stars - 1]++;
  });
  const avgRating =
    ratingRows.length === 0
      ? null
      : ratingRows.reduce((sum, r) => sum + r.stars, 0) / ratingRows.length;

  /* ─────────── Cancellation reasons ─────────── */
  const cancelReasons = new Map<string, number>();
  rideRows
    .filter((r) => r.status === "cancelled")
    .forEach((r) => {
      const key = r.cancellation_reason?.trim() || "No reason given";
      cancelReasons.set(key, (cancelReasons.get(key) ?? 0) + 1);
    });
  const cancellations = Array.from(cancelReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([reason, count]) => ({ reason, count }));

  /* ─────────── Top drivers by completed rides + earnings ─────────── */
  const driverAgg = new Map<
    string,
    { rides: number; revenue: number }
  >();
  rideRows
    .filter((r) => r.status === "completed" && r.driver_id)
    .forEach((r) => {
      const id = r.driver_id!;
      const cur = driverAgg.get(id) ?? { rides: 0, revenue: 0 };
      cur.rides++;
      cur.revenue += r.final_fare_jmd ?? 0;
      driverAgg.set(id, cur);
    });
  const topDriverIds = Array.from(driverAgg.entries())
    .sort((a, b) => b[1].rides - a[1].rides)
    .slice(0, 8);

  let topDrivers: Array<{
    id: string;
    externalId: string;
    name: string;
    rides: number;
    revenue: number;
  }> = [];
  if (topDriverIds.length > 0) {
    const { data: dRows } = await supabase
      .from("drivers")
      .select("id, external_id, first_name, last_name")
      .in(
        "id",
        topDriverIds.map(([id]) => id),
      );
    const dMap = new Map(
      ((dRows ?? []) as Array<{
        id: string;
        external_id: string;
        first_name: string | null;
        last_name: string | null;
      }>).map((d) => [d.id, d]),
    );
    topDrivers = topDriverIds.map(([id, agg]) => {
      const d = dMap.get(id);
      return {
        id,
        externalId: d?.external_id ?? "—",
        name:
          [d?.first_name, d?.last_name].filter(Boolean).join(" ") ||
          "Unnamed driver",
        rides: agg.rides,
        revenue: agg.revenue,
      };
    });
  }

  /* ─────────── Top riders by spend ─────────── */
  const riderAgg = new Map<
    string,
    { rides: number; spend: number }
  >();
  rideRows
    .filter((r) => r.status === "completed")
    .forEach((r) => {
      const cur = riderAgg.get(r.rider_id) ?? { rides: 0, spend: 0 };
      cur.rides++;
      cur.spend += r.final_fare_jmd ?? 0;
      riderAgg.set(r.rider_id, cur);
    });
  const topRiderIds = Array.from(riderAgg.entries())
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 8);

  let topRiders: Array<{
    id: string;
    name: string;
    rides: number;
    spend: number;
  }> = [];
  if (topRiderIds.length > 0) {
    const { data: pRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        topRiderIds.map(([id]) => id),
      );
    const pMap = new Map(
      ((pRows ?? []) as { id: string; full_name: string | null }[]).map(
        (p) => [p.id, p.full_name ?? "Unnamed rider"],
      ),
    );
    topRiders = topRiderIds.map(([id, agg]) => ({
      id,
      name: pMap.get(id) ?? "Unnamed rider",
      rides: agg.rides,
      spend: agg.spend,
    }));
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    days,
    daily,
    statusCounts,
    parishes,
    vehicleTypes,
    complianceCounts,
    heatmap,
    ratings: {
      distribution: ratingDist,
      total: ratingRows.length,
      average: avgRating,
    },
    cancellations,
    topDrivers,
    topRiders,
  });
}
