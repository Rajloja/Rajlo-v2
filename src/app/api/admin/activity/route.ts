import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/activity?limit=40
 *
 * Unified live-activity feed surfaced on the operations dashboard
 * + the audit logs page. Pulls the most recent rows from every
 * "something happened" table and merges them into a single
 * timestamp-ordered stream:
 *
 *   - rides created (rider booked)
 *   - rides accepted (driver picked up the request)
 *   - rides completed
 *   - rides cancelled
 *   - new ratings submitted
 *   - new vehicle change requests
 *   - admin actions from admin_audit_logs
 *   - driver verification decisions from driver_audit_logs
 *
 * Each item is shaped uniformly so the UI doesn't have to switch on
 * source type — just render the icon, title, body, and timestamp.
 */

type FeedItem = {
  id: string;
  source:
    | "ride_created"
    | "ride_accepted"
    | "ride_completed"
    | "ride_cancelled"
    | "rating"
    | "vehicle_change"
    | "admin_audit"
    | "driver_audit";
  tone: "info" | "good" | "warning" | "danger" | "neutral";
  icon: string;
  title: string;
  body: string;
  href?: string;
  at: string;
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;
  // Admin actions (admin_audit_logs) are governance-sensitive — role
  // changes, suspensions, bans. Only super_admins see them in the live
  // feed; every other tier gets the operational stream without them.
  const isSuperAdmin = actor.adminRole === "super_admin";

  const limit = Math.min(
    100,
    Math.max(5, parseInt(request.nextUrl.searchParams.get("limit") ?? "40", 10) || 40),
  );

  const perBucket = Math.ceil(limit / 4);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [rides, ratings, vehicleChanges, adminAudits, driverAudits] =
    await Promise.all([
      supabase
        .from("rides")
        .select(
          "id, status, requested_at, accepted_at, completed_at, cancelled_at, cancellation_reason, rider_id, driver_id, pickup_name, dropoff_name, final_fare_jmd, estimated_fare_jmd",
        )
        .gte("requested_at", since24h)
        .order("requested_at", { ascending: false })
        .limit(perBucket * 2),
      supabase
        .from("ride_ratings")
        .select("id, ride_id, stars, comment, rater_role, created_at")
        .order("created_at", { ascending: false })
        .limit(perBucket),
      supabase
        .from("vehicle_change_requests")
        .select("id, driver_id, status, submitted_at, requested_brand, requested_plate")
        .order("submitted_at", { ascending: false })
        .limit(perBucket),
      supabase
        .from("admin_audit_logs")
        .select("id, action, summary, target_type, target_id, created_at, actor_label")
        .order("created_at", { ascending: false })
        .limit(perBucket),
      supabase
        .from("driver_audit_logs")
        .select("id, driver_id, event, actor_role, created_at")
        .order("created_at", { ascending: false })
        .limit(perBucket),
    ]);

  const feed: FeedItem[] = [];

  type RideRow = {
    id: string;
    status: string;
    requested_at: string;
    accepted_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    rider_id: string;
    driver_id: string | null;
    pickup_name: string;
    dropoff_name: string;
    final_fare_jmd: number | null;
    estimated_fare_jmd: number | null;
  };

  ((rides.data ?? []) as RideRow[]).forEach((r) => {
    feed.push({
      id: `ride-created-${r.id}`,
      source: "ride_created",
      tone: "info",
      icon: "navigation",
      title: "New ride request",
      body: `${r.pickup_name} → ${r.dropoff_name}`,
      href: `/admin/rides/${r.id}`,
      at: r.requested_at,
    });
    if (r.accepted_at) {
      feed.push({
        id: `ride-accepted-${r.id}`,
        source: "ride_accepted",
        tone: "good",
        icon: "check-circle",
        title: "Driver accepted ride",
        body: `${r.pickup_name} → ${r.dropoff_name}`,
        href: `/admin/rides/${r.id}`,
        at: r.accepted_at,
      });
    }
    if (r.completed_at) {
      const fare = r.final_fare_jmd ?? r.estimated_fare_jmd ?? 0;
      feed.push({
        id: `ride-completed-${r.id}`,
        source: "ride_completed",
        tone: "good",
        icon: "check-circle",
        title: "Ride completed",
        body: `${r.pickup_name} → ${r.dropoff_name} · JMD ${fare.toLocaleString("en-JM")}`,
        href: `/admin/rides/${r.id}`,
        at: r.completed_at,
      });
    }
    if (r.cancelled_at) {
      feed.push({
        id: `ride-cancelled-${r.id}`,
        source: "ride_cancelled",
        tone: "warning",
        icon: "alert-triangle",
        title: "Ride cancelled",
        body:
          r.cancellation_reason?.trim() ||
          `${r.pickup_name} → ${r.dropoff_name}`,
        href: `/admin/rides/${r.id}`,
        at: r.cancelled_at,
      });
    }
  });

  ((ratings.data ?? []) as Array<{
    id: string;
    ride_id: string;
    stars: number;
    comment: string | null;
    rater_role: string;
    created_at: string;
  }>).forEach((r) => {
    const tone: FeedItem["tone"] =
      r.stars <= 2 ? "danger" : r.stars === 3 ? "warning" : "good";
    feed.push({
      id: `rating-${r.id}`,
      source: "rating",
      tone,
      icon: "star",
      title: `${r.stars}★ rating from ${r.rater_role}`,
      body: r.comment?.trim() || "No comment left",
      href: `/admin/rides/${r.ride_id}`,
      at: r.created_at,
    });
  });

  ((vehicleChanges.data ?? []) as Array<{
    id: string;
    driver_id: string;
    status: string;
    submitted_at: string;
    requested_brand: string | null;
    requested_plate: string | null;
  }>).forEach((v) => {
    feed.push({
      id: `vehicle-${v.id}`,
      source: "vehicle_change",
      tone: v.status === "pending" ? "warning" : "neutral",
      icon: "car",
      title: `Vehicle change ${v.status}`,
      body: [v.requested_brand, v.requested_plate].filter(Boolean).join(" · "),
      href: "/admin/vehicle-changes",
      at: v.submitted_at,
    });
  });

  ((adminAudits.data ?? []) as Array<{
    id: string;
    action: string;
    summary: string;
    target_type: string;
    target_id: string | null;
    created_at: string;
    actor_label: string | null;
  }>).forEach((a) => {
    const dangerActions = ["delete", "deactivate", "ban"];
    const goodActions = ["reactivate", "approve", "invite"];
    const tone: FeedItem["tone"] = dangerActions.includes(a.action)
      ? "danger"
      : goodActions.includes(a.action)
        ? "good"
        : "info";
    feed.push({
      id: `admin-${a.id}`,
      source: "admin_audit",
      tone,
      icon: "shield",
      title: `Admin · ${a.action}`,
      body: a.summary,
      href: a.target_id
        ? a.target_type === "ride"
          ? `/admin/rides/${a.target_id}`
          : `/admin/users/${a.target_id}`
        : undefined,
      at: a.created_at,
    });
  });

  ((driverAudits.data ?? []) as Array<{
    id: string;
    driver_id: string;
    event: string;
    actor_role: string;
    created_at: string;
  }>).forEach((a) => {
    feed.push({
      id: `driver-${a.id}`,
      source: "driver_audit",
      tone: a.actor_role === "admin" ? "info" : "neutral",
      icon: "shield-check",
      title: `Driver event · ${a.actor_role}`,
      body: a.event,
      at: a.created_at,
    });
  });

  feed.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  // Strip admin-action entries for everyone below super_admin. Done
  // before the slice so lower tiers still get a full-length feed of
  // operational events.
  const visible = isSuperAdmin
    ? feed
    : feed.filter((item) => item.source !== "admin_audit");

  return NextResponse.json({ items: visible.slice(0, limit) });
}
