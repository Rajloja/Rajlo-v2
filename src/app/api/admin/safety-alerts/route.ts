import { NextRequest, NextResponse } from "next/server";
import { requireSafetyOfficerOrAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/safety-alerts
 *
 * Lists safety alerts for the admin safety dashboard. Supports:
 *   ?status=open|acknowledged|resolved|all   (default: open)
 *   ?kind=sos|flag|unusual_stop|all          (default: all)
 *   ?days=14                                  (window, default 14, max 90)
 *   ?limit=100&offset=0
 *
 * Each row joins the rider's display name + the related ride's
 * pickup/dropoff so the queue is scannable without per-row hydration
 * on the client.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSafetyOfficerOrAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const sp = request.nextUrl.searchParams;
  const statusFilter = (sp.get("status") ?? "open").toLowerCase();
  const kindFilter = (sp.get("kind") ?? "all").toLowerCase();
  const days = Math.max(0, Math.min(90, Number(sp.get("days") ?? "14") || 14));
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? "100") || 100));
  const offset = Math.max(0, Number(sp.get("offset") ?? "0") || 0);

  let query = supabase
    .from("safety_alerts")
    .select(
      "id, ride_id, rider_id, driver_id, kind, message, lat, lng, status, acknowledged_at, resolved_at, resolution_note, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (kindFilter !== "all") query = query.eq("kind", kindFilter);
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data: rows, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alerts = rows ?? [];
  const total = count ?? 0;
  const hasMore = offset + alerts.length < total;
  if (alerts.length === 0) {
    return NextResponse.json({
      alerts: [],
      total,
      pagination: { hasMore: false },
    });
  }

  // Hydrate rider display names + ride context in two batched queries.
  const riderIds = Array.from(new Set(alerts.map((a) => a.rider_id)));
  const rideIds = Array.from(new Set(alerts.map((a) => a.ride_id)));

  const [{ data: profiles }, { data: rides }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", riderIds),
    supabase
      .from("rides")
      .select("id, pickup_name, dropoff_name, status")
      .in("id", rideIds),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );
  const rideMap = new Map(
    (rides ?? []).map((r) => [
      r.id as string,
      {
        pickup: r.pickup_name as string,
        dropoff: r.dropoff_name as string,
        status: r.status as string,
      },
    ]),
  );

  const hydrated = alerts.map((a) => ({
    id: a.id as string,
    rideId: a.ride_id as string,
    riderId: a.rider_id as string,
    riderName: profileMap.get(a.rider_id as string) ?? "Unknown rider",
    driverId: (a.driver_id as string | null) ?? null,
    kind: a.kind as "sos" | "flag" | "unusual_stop",
    message: (a.message as string | null) ?? null,
    lat: a.lat as number | null,
    lng: a.lng as number | null,
    status: a.status as "open" | "acknowledged" | "resolved",
    acknowledgedAt: (a.acknowledged_at as string | null) ?? null,
    resolvedAt: (a.resolved_at as string | null) ?? null,
    resolutionNote: (a.resolution_note as string | null) ?? null,
    createdAt: a.created_at as string,
    ride: rideMap.get(a.ride_id as string) ?? null,
  }));

  return NextResponse.json({
    alerts: hydrated,
    total,
    pagination: { hasMore },
  });
}
