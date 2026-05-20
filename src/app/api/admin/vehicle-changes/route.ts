import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/admin/vehicle-changes
 *
 * Admin queue of pending vehicle-change requests, oldest first.
 * Each entry includes the driver's name + plate + current vehicle
 * so the reviewer doesn't have to cross-reference another screen.
 *
 * `?status=pending` (default) | `all` | `approved` | `rejected` | `cancelled`
 */

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

  // Admin check.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "pending";
  const limit = Math.min(
    200,
    Math.max(
      10,
      parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    ),
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );

  let query = supabase
    .from("vehicle_change_requests")
    .select(
      "id, driver_id, status, requested_type, requested_brand, requested_model, requested_year, requested_color, requested_plate, note, admin_note, submitted_at, reviewed_at, insurance_path, registration_path, cof_path",
    )
    .order("submitted_at", { ascending: true })
    .range(offset, offset + limit);
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: requests, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bulk-enrich with driver names + current vehicle.
  const fetched = requests ?? [];
  const hasMore = fetched.length > limit;
  const list = hasMore ? fetched.slice(0, limit) : fetched;
  const driverIds = Array.from(new Set(list.map((r) => r.driver_id)));
  const driversById = new Map<
    string,
    {
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      plate_number: string | null;
      vehicle_make: string | null;
      vehicle_model: string | null;
      vehicle_year: number | null;
      vehicle_color: string | null;
      vehicle_type: string | null;
    }
  >();
  if (driverIds.length > 0) {
    const { data: drivers } = await supabase
      .from("drivers")
      .select(
        "id, first_name, last_name, external_id, plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_type",
      )
      .in("id", driverIds);
    for (const d of drivers ?? []) driversById.set(d.id, d);
  }

  return NextResponse.json({
    requests: list.map((r) => {
      const d = driversById.get(r.driver_id);
      return {
        id: r.id,
        status: r.status,
        submittedAt: r.submitted_at,
        reviewedAt: r.reviewed_at,
        note: r.note,
        adminNote: r.admin_note,
        requested: {
          type: r.requested_type,
          brand: r.requested_brand,
          model: r.requested_model,
          year: r.requested_year,
          color: r.requested_color,
          plate: r.requested_plate,
        },
        // Document storage paths — admin tools sign + display these.
        docs: {
          insurance: r.insurance_path,
          registration: r.registration_path,
          cof: r.cof_path,
        },
        driver: d
          ? {
              id: r.driver_id,
              externalId: d.external_id,
              name:
                [d.first_name, d.last_name].filter(Boolean).join(" ") ||
                "Driver",
              currentVehicle: {
                type: d.vehicle_type,
                brand: d.vehicle_make,
                model: d.vehicle_model,
                year: d.vehicle_year,
                color: d.vehicle_color,
                plate: d.plate_number,
              },
            }
          : null,
      };
    }),
    pagination: { hasMore },
  });
}
