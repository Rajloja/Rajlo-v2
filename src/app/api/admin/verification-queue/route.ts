import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { requiredTADocuments } from "@/lib/mock-data";

/**
 * GET /api/admin/verification-queue
 *
 * Returns the list of drivers awaiting verification, sorted oldest first
 * (so the longest-waiting driver is reviewed first). Admin-only.
 *
 * Query params:
 *   ?scope=active   → returns currently activated drivers (so admins can
 *                     find them to deactivate / re-verify)
 *   default         → returns drivers in the verification pipeline
 *                     (pending_review or rejected, not yet activated)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const isActiveScope = scope === "active";

  // Pagination — client fetches a page at a time and appends via
  // Load more. `limit` is capped so a malicious client can't request
  // "all rows in one call"; `hasMore` in the response drives the
  // button's visibility.
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)),
  );
  const offset = Math.max(
    0,
    parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  );
  // Verify caller is admin
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ source: "mock", drivers: [] });
  }

  // Pull drivers in the requested scope + count of uploaded docs per driver.
  // For the verification queue (default), order by submitted_at oldest-first
  // so longest-waiting reviews are at the top. For the active list, order
  // by submitted_at newest-first so most recently activated is at the top.
  let driversQuery = supabase
    .from("drivers")
    .select(
      "id, external_id, first_name, last_name, plate_number, onboarding_status, activated, created_at, submitted_at, admin_note",
    );

  if (isActiveScope) {
    driversQuery = driversQuery
      .eq("activated", true)
      .order("submitted_at", { ascending: false, nullsFirst: false });
  } else {
    driversQuery = driversQuery
      .in("onboarding_status", ["pending_review", "rejected"])
      .eq("activated", false)
      .order("submitted_at", { ascending: true, nullsFirst: true });
  }

  // Fetch one extra row than requested — the presence of that N+1 tells
  // us whether there's another page without a separate count query.
  const { data: driversRaw, error } = await driversQuery.range(
    offset,
    offset + limit,
  );
  const driversAll = driversRaw ?? [];
  const hasMore = driversAll.length > limit;
  const drivers = hasMore ? driversAll.slice(0, limit) : driversAll;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (drivers.length === 0) {
    return NextResponse.json({
      source: "supabase",
      drivers: [],
      pagination: { hasMore: false, limit, offset },
    });
  }

  // Bulk fetch document counts per driver (1 query) — exclude legacy doc_keys
  // (e.g. trn/nis) that are no longer part of the required document list.
  const driverIds = drivers.map((d) => d.id);
  const validDocKeys = requiredTADocuments.map((d) => d.id);
  const { data: docs } = await supabase
    .from("driver_documents")
    .select("driver_id, status")
    .in("driver_id", driverIds)
    .in("doc_key", validDocKeys);

  const docCounts = new Map<string, { uploaded: number; pending: number; rejected: number }>();
  driverIds.forEach((id) => docCounts.set(id, { uploaded: 0, pending: 0, rejected: 0 }));
  docs?.forEach((d) => {
    const counts = docCounts.get(d.driver_id);
    if (!counts) return;
    if (d.status !== "missing") counts.uploaded++;
    if (d.status === "pending") counts.pending++;
    if (d.status === "rejected") counts.rejected++;
  });

  return NextResponse.json({
    source: "supabase",
    drivers: drivers.map((d) => {
      const counts = docCounts.get(d.id) ?? { uploaded: 0, pending: 0, rejected: 0 };
      return {
        id: d.id,
        externalId: d.external_id,
        name: [d.first_name, d.last_name].filter(Boolean).join(" ") || "Unnamed driver",
        plateNumber: d.plate_number,
        status: d.activated ? "active" : d.onboarding_status,
        activated: d.activated,
        submittedAt: d.submitted_at ?? d.created_at,
        adminNote: d.admin_note,
        docsUploaded: counts.uploaded,
        docsPending: counts.pending,
        docsRejected: counts.rejected,
      };
    }),
    pagination: { hasMore, limit, offset },
  });
}
