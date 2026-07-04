import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requiredTADocuments } from "@/lib/mock-data";

/**
 * GET /api/admin/drivers/:externalId
 *
 * Full driver profile for the admin driver-hub page. One round-trip
 * hydrates:
 *
 *   - Personal + vehicle profile (from `drivers`)
 *   - Wallet balance (from `wallets`)
 *   - Every required document with per-doc status + expiry
 *     (reconciled from `driver_documents` + the driver's onboarding-
 *      supplied licence + franchise expiries on `drivers`)
 *   - Ride stats + the last N rides (from `rides`)
 *   - Violation stats + the last N open violations (from
 *     `driver_violations`)
 *   - Ratings summary (from `ride_ratings`)
 *
 * The hub page renders each of these as its own section — the admin
 * uses it as a "one place to see everything about this driver" without
 * having to bounce between /verification-detail, /transactions,
 * /driver-violations, etc.
 *
 * A separate `/admin/verification-detail?driverId=<externalId>` link
 * keeps the moderation workflow (per-doc approve/reject buttons +
 * activate/deactivate) as its own focused surface, since that's a
 * mode not a browse.
 */

const RIDE_LIMIT = 10;
const VIOLATION_LIMIT = 10;

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const { externalId } = await params;
  if (!externalId) {
    return NextResponse.json(
      { error: "externalId required" },
      { status: 400 },
    );
  }

  // Resolve the driver row by external_id (the short ID surfaced in
  // the admin UI). Every downstream query keys off `driver.id`.
  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select(
      "id, external_id, user_id, first_name, last_name, phone, email, trn, nis, licence_number, licence_expiry, badge_number, plate_number, vehicle_type, vehicle_make, vehicle_model, vehicle_year, vehicle_color, franchise_number, franchise_expiry, onboarding_status, activated, deactivated_at, deactivation_reason, admin_note, created_at, submitted_at, activated_at, last_online_at, is_online",
    )
    .eq("external_id", externalId)
    .maybeSingle();
  if (driverError) {
    return NextResponse.json({ error: driverError.message }, { status: 500 });
  }
  if (!driver) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Parallelise every downstream lookup — none depend on each other.
  const [
    walletRes,
    docsRes,
    rideStatsRes,
    recentRidesRes,
    violationStatsRes,
    recentViolationsRes,
    ratingsRes,
  ] = await Promise.all([
    driver.user_id
      ? supabase
          .from("wallets")
          .select("balance_jmd, updated_at")
          .eq("user_id", driver.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    supabase
      .from("driver_documents")
      .select(
        "doc_key, label, status, note, file_name, file_path, previously_approved, expires_on, renewal_period_days",
      )
      .eq("driver_id", driver.id),

    supabase
      .from("rides")
      .select("id, status", { count: "exact", head: true })
      .eq("driver_id", driver.id),

    supabase
      .from("rides")
      .select(
        "id, status, pickup_name, dropoff_name, seats, final_fare_jmd, estimated_fare_jmd, estimated_distance_km, requested_at, completed_at, cancelled_at",
      )
      .eq("driver_id", driver.id)
      .order("requested_at", { ascending: false })
      .limit(RIDE_LIMIT),

    supabase
      .from("driver_violations")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id),

    supabase
      .from("driver_violations")
      .select("id, kind, details, resolved_at, admin_notes, created_at")
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false })
      .limit(VIOLATION_LIMIT),

    supabase
      .from("ride_ratings")
      .select("stars")
      .eq("rated_id", driver.user_id ?? "00000000-0000-0000-0000-000000000000")
      .eq("rated_role", "driver"),
  ]);

  // ─── Documents: reconcile the DB row against the canonical
  // required-docs template so the response always contains one entry
  // per doc key (missing entries render as "Not uploaded"). Expiry
  // falls back to drivers.licence_expiry / franchise_expiry for the
  // three docs sourced from the onboarding form — same rule the
  // /admin/verification page uses. ───
  const rowsByKey = new Map<string, {
    doc_key: string;
    label: string;
    status: string;
    note: string | null;
    file_name: string | null;
    file_path: string | null;
    previously_approved: boolean | null;
    expires_on: string | null;
    renewal_period_days: number | null;
  }>();
  for (const d of docsRes.data ?? []) {
    rowsByKey.set(d.doc_key as string, {
      doc_key: d.doc_key as string,
      label: d.label as string,
      status: d.status as string,
      note: (d.note as string | null) ?? null,
      file_name: (d.file_name as string | null) ?? null,
      file_path: (d.file_path as string | null) ?? null,
      previously_approved: (d.previously_approved as boolean | null) ?? null,
      expires_on: (d.expires_on as string | null) ?? null,
      renewal_period_days: (d.renewal_period_days as number | null) ?? null,
    });
  }

  const docs = requiredTADocuments.map((meta) => {
    const row = rowsByKey.get(meta.id);
    let expiresOn: string | null = row?.expires_on ?? null;
    if (!expiresOn) {
      if (
        meta.id === "drivers_licence_front" ||
        meta.id === "drivers_licence_back"
      ) {
        expiresOn = (driver.licence_expiry as string | null) ?? null;
      } else if (meta.id === "franchise_cert") {
        expiresOn = (driver.franchise_expiry as string | null) ?? null;
      }
    }
    return {
      docKey: meta.id,
      label: meta.label,
      status: row?.status ?? "missing",
      note: row?.note ?? null,
      fileName: row?.file_name ?? null,
      hasFile: Boolean(row?.file_path),
      previouslyApproved: row?.previously_approved === true,
      expiresOn,
      renewalPeriodDays: row?.renewal_period_days ?? meta.renewalPeriodDays,
    };
  });

  // ─── Ride stats — status breakdown from a lightweight count query.
  // We already have the total via `head: true`. Fetch a status-only
  // list once more so we can bucket without loading the fare + names
  // for every historical ride.
  const { data: rideStatusRows } = await supabase
    .from("rides")
    .select("status")
    .eq("driver_id", driver.id);
  const rideStatusCounts: Record<string, number> = {};
  for (const r of rideStatusRows ?? []) {
    const s = r.status as string;
    rideStatusCounts[s] = (rideStatusCounts[s] ?? 0) + 1;
  }
  const rideTotal = rideStatsRes.count ?? 0;
  const rideCompleted = rideStatusCounts["completed"] ?? 0;
  const rideCancelled = rideStatusCounts["cancelled"] ?? 0;
  const rideInFlight =
    (rideStatusCounts["requested"] ?? 0) +
    (rideStatusCounts["accepted"] ?? 0) +
    (rideStatusCounts["arrived"] ?? 0) +
    (rideStatusCounts["in_progress"] ?? 0);

  const recentRides = (recentRidesRes.data ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as string,
    pickupName: r.pickup_name as string,
    dropoffName: r.dropoff_name as string,
    seats: r.seats as number,
    fareJmd:
      (r.final_fare_jmd as number | null) ??
      (r.estimated_fare_jmd as number | null),
    distanceKm: (r.estimated_distance_km as number | null) ?? null,
    requestedAt: r.requested_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
    cancelledAt: (r.cancelled_at as string | null) ?? null,
  }));

  // ─── Violations ───
  const violationTotal = violationStatsRes.count ?? 0;
  const recentViolations = (recentViolationsRes.data ?? []).map((v) => ({
    id: v.id as string,
    kind: v.kind as string,
    details: (v.details as string | null) ?? null,
    adminNotes: (v.admin_notes as string | null) ?? null,
    resolvedAt: (v.resolved_at as string | null) ?? null,
    createdAt: v.created_at as string,
  }));
  const openViolations = recentViolations.filter((v) => !v.resolvedAt).length;

  // ─── Ratings summary ───
  const ratingRows = ratingsRes.data ?? [];
  const ratingsCount = ratingRows.length;
  const ratingsAverage =
    ratingsCount === 0
      ? null
      : ratingRows.reduce((sum, r) => sum + (r.stars as number), 0) /
        ratingsCount;

  return NextResponse.json({
    driver: {
      id: driver.id,
      externalId: driver.external_id,
      userId: driver.user_id,
      firstName: driver.first_name,
      lastName: driver.last_name,
      fullName:
        [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
        "Unnamed driver",
      phone: driver.phone,
      email: driver.email,
      trn: driver.trn,
      nis: driver.nis,
      licenceNumber: driver.licence_number,
      licenceExpiry: driver.licence_expiry,
      badgeNumber: driver.badge_number,
      plateNumber: driver.plate_number,
      vehicleType: driver.vehicle_type,
      vehicleMake: driver.vehicle_make,
      vehicleModel: driver.vehicle_model,
      vehicleYear: driver.vehicle_year,
      vehicleColor: driver.vehicle_color,
      franchiseNumber: driver.franchise_number,
      franchiseExpiry: driver.franchise_expiry,
      onboardingStatus: driver.onboarding_status,
      activated: driver.activated,
      deactivatedAt: driver.deactivated_at,
      deactivationReason: driver.deactivation_reason,
      adminNote: driver.admin_note,
      createdAt: driver.created_at,
      submittedAt: driver.submitted_at,
      activatedAt: driver.activated_at,
      lastOnlineAt: driver.last_online_at,
      isOnline: !!driver.is_online,
    },
    wallet: walletRes.data
      ? {
          balanceJmd: (walletRes.data.balance_jmd as number) ?? 0,
          updatedAt: (walletRes.data.updated_at as string) ?? null,
        }
      : null,
    docs,
    rides: {
      total: rideTotal,
      completed: rideCompleted,
      cancelled: rideCancelled,
      inFlight: rideInFlight,
      recent: recentRides,
    },
    violations: {
      total: violationTotal,
      open: openViolations,
      recent: recentViolations,
    },
    ratings: {
      count: ratingsCount,
      average: ratingsAverage,
    },
  });
}
