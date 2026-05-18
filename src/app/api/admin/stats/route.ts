import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/admin-rbac";

/**
 * GET /api/admin/stats
 *
 * The top-of-page KPI strip for the admin operations dashboard. One
 * request returns every "scoreboard" number the page shows so the UI
 * doesn't fan out to a dozen endpoints on first paint.
 *
 * Numbers are computed at request time against the live tables — no
 * cache layer in front, since admin traffic is low and the queries
 * are all index-backed counts. If/when we outgrow that, swap in a
 * 60-second materialised view.
 */

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;
  // Revenue is business-financial data — only tiers with view_analytics
  // (compliance, super_admin) get it. The rest of this payload is
  // operational and goes to every admin tier.
  const canViewRevenue = hasPermission(actor.adminRole, "view_analytics");

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const yesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    profilesByRole,
    activeDrivers,
    onlineDrivers,
    pendingDrivers,
    rejectedDrivers,
    ridesToday,
    ridesYesterday,
    ridesActive,
    ridesAll7d,
    revenueAll,
    docsPending,
    docsRejected,
    pendingVehicleChanges,
    unresolvedRatings,
  ] = await Promise.all([
    supabase.from("profiles").select("role", { count: "exact", head: false }),
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("activated", true),
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("activated", true)
      .eq("is_online", true),
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_status", "pending_review")
      .eq("activated", false),
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("onboarding_status", "rejected"),
    supabase
      .from("rides")
      .select("id, status, final_fare_jmd, estimated_fare_jmd", {
        count: "exact",
        head: false,
      })
      .gte("requested_at", startOfToday.toISOString()),
    supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .gte("requested_at", yesterday.toISOString())
      .lt("requested_at", startOfToday.toISOString()),
    supabase
      .from("rides")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "accepted", "arrived", "in_progress"]),
    supabase
      .from("rides")
      .select(
        "id, status, final_fare_jmd, estimated_fare_jmd, requested_at, completed_at",
        { count: "exact", head: false },
      )
      .gte("requested_at", sevenDaysAgo.toISOString()),
    supabase
      .from("rides")
      .select("final_fare_jmd, completed_at")
      .eq("status", "completed")
      .gte("completed_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("driver_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("driver_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected"),
    supabase
      .from("vehicle_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("ride_ratings")
      .select("id", { count: "exact", head: true })
      .lte("stars", 2),
  ]);

  const roles = (profilesByRole.data ?? []) as { role: string }[];
  const ridersCount = roles.filter((r) => r.role === "rider").length;
  const driversCount = roles.filter((r) => r.role === "driver").length;
  const adminsCount = roles.filter((r) => r.role === "admin").length;

  const todaysRows = (ridesToday.data ?? []) as Array<{
    status: string;
    final_fare_jmd: number | null;
    estimated_fare_jmd: number | null;
  }>;
  const todayCompleted = todaysRows.filter((r) => r.status === "completed");
  const todayCancelled = todaysRows.filter((r) => r.status === "cancelled");
  const revenueToday = todayCompleted.reduce(
    (sum, r) => sum + (r.final_fare_jmd ?? r.estimated_fare_jmd ?? 0),
    0,
  );

  const last7Rows = (ridesAll7d.data ?? []) as Array<{
    requested_at: string;
    completed_at: string | null;
    status: string;
    final_fare_jmd: number | null;
    estimated_fare_jmd: number | null;
  }>;

  // Build a 7-day rides-per-day series for the sparkline.
  const dailyMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, 0);
  }
  last7Rows.forEach((r) => {
    const key = r.requested_at.slice(0, 10);
    if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
  });
  const ridesSparkline = Array.from(dailyMap.values());

  // Revenue sparkline (30d, daily completed rides only)
  const revenueRows = (revenueAll.data ?? []) as Array<{
    final_fare_jmd: number | null;
    completed_at: string | null;
  }>;
  const revenueDaily = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    revenueDaily.set(d.toISOString().slice(0, 10), 0);
  }
  revenueRows.forEach((r) => {
    if (!r.completed_at) return;
    const key = r.completed_at.slice(0, 10);
    if (revenueDaily.has(key))
      revenueDaily.set(
        key,
        (revenueDaily.get(key) ?? 0) + (r.final_fare_jmd ?? 0),
      );
  });
  const revenue30d = Array.from(revenueDaily.values()).reduce(
    (sum, v) => sum + v,
    0,
  );
  const revenueSparkline = Array.from(revenueDaily.values());

  return NextResponse.json({
    generatedAt: now.toISOString(),
    users: {
      riders: ridersCount,
      drivers: driversCount,
      admins: adminsCount,
      total: ridersCount + driversCount + adminsCount,
    },
    drivers: {
      active: activeDrivers.count ?? 0,
      online: onlineDrivers.count ?? 0,
      pendingVerification: pendingDrivers.count ?? 0,
      rejected: rejectedDrivers.count ?? 0,
    },
    rides: {
      today: ridesToday.count ?? 0,
      yesterday: ridesYesterday.count ?? 0,
      active: ridesActive.count ?? 0,
      completedToday: todayCompleted.length,
      cancelledToday: todayCancelled.length,
      sparkline7d: ridesSparkline,
    },
    // Null for tiers without analytics access — the dashboard hides
    // the revenue card entirely rather than showing a zeroed one.
    revenue: canViewRevenue
      ? {
          today: revenueToday,
          last30d: revenue30d,
          sparkline30d: revenueSparkline,
        }
      : null,
    queue: {
      docsPending: docsPending.count ?? 0,
      docsRejected: docsRejected.count ?? 0,
      vehicleChangesPending: pendingVehicleChanges.count ?? 0,
      lowRatings: unresolvedRatings.count ?? 0,
    },
  });
}
